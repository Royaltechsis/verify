import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { query } from '../db/pool';
import { v4 as uuidv4 } from 'uuid';
import { getWorkerMatches, verifyTaskCompletion } from '../services/ai-matching';
import { createSquadEscrow, releaseEscrowToWorker } from '../services/squad-service';
import { processTaskOutcome } from '../services/financial-intelligence';
import { WalletService } from '../services/wallet-service';

import type { Task } from '../types';
import { authenticate, requireRole } from '../middleware/auth';
import { NotificationService } from '../services/notification-service';

const router = Router();
type TaskWithBuyer = Task & { buyer_user_id?: number };

// Configure storage
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage: storage });

const normalizeSkillsInput = (skillsInput: any): string[] => {
  if (Array.isArray(skillsInput)) {
    return skillsInput.map((s: any) => String(s).trim()).filter(Boolean);
  }

  if (typeof skillsInput === 'string') {
    const trimmed = skillsInput.trim();
    if (!trimmed) return [];

    // Accept JSON string array from form-data or frontend serializers.
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((s: any) => String(s).trim()).filter(Boolean);
        }
      } catch {
        // Fall back to comma-separated parsing below.
      }
    }

    return trimmed.split(',').map((s: string) => s.trim()).filter(Boolean);
  }

  return [];
};

const normalizeDeliverableSpecInput = (deliverableSpecRaw: any): any => {
  if (typeof deliverableSpecRaw === 'string') {
    return JSON.parse(deliverableSpecRaw);
  }
  return deliverableSpecRaw;
};

const buildTaskAccessClause = (user: Request['user'], params: any[]): string => {
  if (!user) {
    return ' AND 1=0';
  }

  if (user.role === 'admin') {
    return '';
  }

  if (user.role === 'buyer') {
    params.push(user.id);
    return ` AND t.buyer_user_id = $${params.length}`;
  }

  if (user.role === 'worker') {
    if (!user.worker_id) {
      return ' AND 1=0';
    }
    // Push worker_id once and reuse the same parameter index for all 4 predicates
    params.push(user.worker_id);
    const workerIdParam = params.length;
    return `
      AND (
        t.assigned_worker_id = $${workerIdParam}
        OR t.selected_worker_id = $${workerIdParam}
        OR (t.shortlisted_workers IS NOT NULL AND t.shortlisted_workers::text LIKE '%' || $${workerIdParam}::text || '%')
        OR EXISTS (
          SELECT 1
          FROM task_applications ta
          WHERE ta.task_id = t.id AND ta.worker_id = $${workerIdParam}
        )
      )
    `;
  }

  return ' AND 1=0';
};

// Get all tasks
router.get('/', authenticate, requireRole('buyer', 'worker', 'admin'), async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    const location = req.query.location as string;
    
    let sql = 'SELECT t.* FROM tasks t WHERE 1=1';
    const params: any[] = [];

    if (status) {
      sql += ' AND t.status = $' + (params.length + 1);
      params.push(status);
    }

    if (location) {
      sql += ' AND t.task_location ILIKE $' + (params.length + 1);
      params.push(`%${location}%`);
    }

    sql += buildTaskAccessClause(req.user, params);

    sql += ' ORDER BY t.created_at DESC';
    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Tasks] Error fetching tasks:', errorMessage);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get task by ID
router.get('/:id', authenticate, requireRole('buyer', 'worker', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const params: any[] = [id];
    let sql = 'SELECT t.* FROM tasks t WHERE t.id = $1';
    sql += buildTaskAccessClause(req.user, params);
    const result = await query(sql, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = result.rows[0];
    /* const isAssociated = req.user?.role === 'admin' 
      || task.buyer_user_id === req.user?.id 
      || task.assigned_worker_id === req.user?.worker_id
      || (task.shortlisted_workers && task.shortlisted_workers.includes(req.user?.worker_id));

    if (!isAssociated) {
      return res.status(403).json({ error: 'You are not authorized to view this task' });
    } */

    return res.json(task);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Tasks] Error fetching task:', errorMessage);
    return res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// Create new task
const parseTaskCreationUpload = (req: Request, res: Response, next: NextFunction) => {
  if (req.is('multipart/form-data')) {
    upload.array('deliverable_images', 5)(req, res, next as any);
  } else {
    next();
  }
};

router.post('/', authenticate, requireRole('buyer', 'admin'), parseTaskCreationUpload, async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      client_name,
      client_email,
      required_skills,
      amount_naira,
      task_location,
      location_latitude,
      location_longitude,
      due_date,
      deliverable_spec: deliverableSpecRaw,
      deliverableSpec: deliverableSpecAlt
    } = req.body as any;

    const deliverableSpecValue = deliverableSpecRaw ?? deliverableSpecAlt;
    let deliverable_spec = deliverableSpecValue;
    if (typeof deliverableSpecValue === 'string') {
      try {
        deliverable_spec = normalizeDeliverableSpecInput(deliverableSpecValue);
      } catch {
        return res.status(400).json({ error: 'deliverable_spec must be valid JSON' });
      }
    }

    if (!title || !description || !amount_naira || !task_location || !due_date || !deliverable_spec) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (typeof deliverable_spec !== 'object') {
      return res.status(400).json({ error: 'deliverable_spec must be an object' });
    }

    // Accept array, comma-separated string, or JSON-string array.
    const skillsArray = normalizeSkillsInput(required_skills);

    const uploadedFiles = req.files as Express.Multer.File[] | undefined;
    const deliverableImageUrls = uploadedFiles?.map(f => `http://localhost:${process.env.PORT || 3001}/uploads/${f.filename}`) || [];
    const existingImages = Array.isArray(deliverable_spec.reference_image_urls) ? deliverable_spec.reference_image_urls : [];
    if (deliverableImageUrls.length > 0) {
      deliverable_spec.reference_image_urls = [...existingImages, ...deliverableImageUrls];
    }

    const task_uuid = uuidv4();
    const result = await query(
      `INSERT INTO tasks 
       (task_uuid, title, description, client_name, client_email, required_skills, 
        amount_naira, task_location, location_latitude, location_longitude, due_date, deliverable_spec, buyer_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        task_uuid, title, description, client_name || (req.user as any)?.full_name || 'Anonymous', client_email || req.user?.email, skillsArray,
        amount_naira, task_location, location_latitude, location_longitude, due_date, JSON.stringify(deliverable_spec), req.user?.id
      ]
    );

    // Get worker matches
    const task = result.rows[0] as Task;
    const matches = await getWorkerMatches(task, 5);
    
    // Try to persist AI recommendations (may fail if column doesn't exist yet, which is OK)
    let updatedTask = task;
    let persistedRecommendations = matches;
    try {
      const updatedTaskResult = await query(
        `UPDATE tasks SET ai_recommendations = $1 WHERE id = $2 RETURNING *`,
        [JSON.stringify(matches), task.id]
      );
      if (updatedTaskResult.rows.length > 0) {
        updatedTask = updatedTaskResult.rows[0] as Task;
        persistedRecommendations = (updatedTaskResult.rows[0] as any)?.ai_recommendations || matches;
      }
    } catch (persistError) {
      console.warn('[Tasks] Warning: Could not persist AI recommendations (column may not exist):', persistError instanceof Error ? persistError.message : persistError);
      // Continue with original task and matches
    }

    return res.status(201).json({
      task: updatedTask,
      matches: persistedRecommendations || matches
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Tasks] Error creating task:', errorMessage);
    return res.status(500).json({ error: 'Failed to create task' });
  }
});

// Refresh AI recommendations for an existing task (buyer/admin)
router.post('/:id/recommend-workers', authenticate, requireRole('buyer', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0] as TaskWithBuyer;
    if (req.user?.role !== 'admin' && task.buyer_user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Not authorized for this task' });
    }

    const matches = await getWorkerMatches(task, 5);

    const updatedResult = await query(
      'UPDATE tasks SET ai_recommendations = $1 WHERE id = $2 RETURNING *',
      [JSON.stringify(matches), id]
    );

    return res.json({
      task: updatedResult.rows[0],
      matches,
      message: 'AI recommendations refreshed successfully'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Tasks] Error refreshing AI recommendations:', errorMessage);
    return res.status(500).json({ error: 'Failed to refresh AI recommendations' });
  }
});

// Update task (buyer owner or admin)
router.patch('/:id', authenticate, requireRole('buyer', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      client_name,
      client_email,
      required_skills,
      amount_naira,
      task_location,
      location_latitude,
      location_longitude,
      due_date,
      deliverable_spec,
      deliverableSpec
    } = req.body as any;

    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const existingTask = taskResult.rows[0] as TaskWithBuyer;
    if (req.user?.role !== 'admin' && existingTask.buyer_user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Not authorized for this task' });
    }

    if (!['posted', 'shortlisted', 'applications_open', 'selection_in_progress'].includes(existingTask.status)) {
      return res.status(400).json({ error: 'Task cannot be updated at the current status' });
    }

    let parsedDeliverableSpec = deliverable_spec ?? deliverableSpec;
    if (typeof parsedDeliverableSpec === 'string') {
      try {
        parsedDeliverableSpec = normalizeDeliverableSpecInput(parsedDeliverableSpec);
      } catch {
        return res.status(400).json({ error: 'deliverable_spec must be valid JSON' });
      }
    }

    if (parsedDeliverableSpec != null && typeof parsedDeliverableSpec !== 'object') {
      return res.status(400).json({ error: 'deliverable_spec must be an object' });
    }

    const mergedSkills = required_skills == null
      ? existingTask.required_skills
      : normalizeSkillsInput(required_skills);

    const mergedTask = {
      title: title ?? existingTask.title,
      description: description ?? existingTask.description,
      client_name: client_name ?? existingTask.client_name,
      client_email: client_email ?? existingTask.client_email,
      required_skills: mergedSkills,
      amount_naira: amount_naira ?? existingTask.amount_naira,
      task_location: task_location ?? existingTask.task_location,
      location_latitude: location_latitude ?? existingTask.location_latitude,
      location_longitude: location_longitude ?? existingTask.location_longitude,
      due_date: due_date ?? existingTask.due_date,
      deliverable_spec: parsedDeliverableSpec ?? existingTask.deliverable_spec,
    };

    const result = await query(
      `UPDATE tasks
       SET title = $1,
           description = $2,
           client_name = $3,
           client_email = $4,
           required_skills = $5,
           amount_naira = $6,
           task_location = $7,
           location_latitude = $8,
           location_longitude = $9,
           due_date = $10,
           deliverable_spec = $11,
           updated_at = NOW()
       WHERE id = $12
       RETURNING *`,
      [
        mergedTask.title,
        mergedTask.description,
        mergedTask.client_name,
        mergedTask.client_email,
        mergedTask.required_skills,
        mergedTask.amount_naira,
        mergedTask.task_location,
        mergedTask.location_latitude,
        mergedTask.location_longitude,
        mergedTask.due_date,
        JSON.stringify(mergedTask.deliverable_spec),
        id,
      ]
    );

    return res.json({
      task: result.rows[0],
      message: 'Task updated successfully'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Tasks] Error updating task:', errorMessage);
    return res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task (buyer owner or admin)
router.delete('/:id', authenticate, requireRole('buyer', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0] as TaskWithBuyer;
    if (req.user?.role !== 'admin' && task.buyer_user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Not authorized for this task' });
    }

    // Prevent deleting tasks that are in execution/verification/payment stages.
    if (!['posted', 'shortlisted', 'applications_open', 'selection_in_progress'].includes(task.status)) {
      return res.status(400).json({ error: 'Task cannot be deleted at the current status' });
    }

    // Cleanup dependent records to satisfy foreign-key constraints.
    await query('DELETE FROM task_applications WHERE task_id = $1', [id]);
    await query('DELETE FROM tasks WHERE id = $1', [id]);

    return res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Tasks] Error deleting task:', errorMessage);
    return res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Shortlist workers
router.post('/:id/shortlist', authenticate, requireRole('buyer', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { worker_ids } = req.body;

    if (!Array.isArray(worker_ids) || worker_ids.length === 0) {
      return res.status(400).json({ error: 'Worker IDs array is required' });
    }

    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (req.user?.role !== 'admin' && taskResult.rows[0].buyer_user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Not authorized for this task' });
    }

    const result = await query(
      `UPDATE tasks SET shortlisted_workers = $1, status = 'shortlisted'
       WHERE id = $2 RETURNING *`,
      [JSON.stringify(worker_ids), id]
    );

    const task = result.rows[0];

    // Notify shortlisted workers
    worker_ids.forEach((workerId: number) => {
      NotificationService.notifyWorker(
        workerId,
        'You have been shortlisted',
        `You have been shortlisted for task: ${task.title}. You can now submit an application.`,
        'task_update',
        { taskId: id }
      );
    });

    return res.json({
      task,
      message: 'Workers shortlisted successfully'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Tasks] Error shortlisting workers:', errorMessage);
    return res.status(500).json({ error: 'Failed to shortlist workers' });
  }
});

// Worker applies for a task
router.post('/:id/apply', authenticate, requireRole('worker'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { worker_id, proposed_price, message } = req.body;

    if (!worker_id || !proposed_price) {
      return res.status(400).json({ error: 'Worker ID and proposed price are required' });
    }

    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (req.user?.role !== 'admin' && Number(worker_id) !== req.user?.worker_id) {
      return res.status(403).json({ error: 'Not authorized for this worker profile' });
    }

    const task = taskResult.rows[0];
    const shortlistedWorkers = task.shortlisted_workers || [];
    
    if (!shortlistedWorkers.includes(worker_id)) {
      return res.status(403).json({ error: 'Worker is not shortlisted for this task' });
    }

    const result = await query(
      `INSERT INTO task_applications (task_id, worker_id, proposed_price, message)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, worker_id, proposed_price, message]
    );

    // Update task status to applications_open if not already
    if (task.status === 'shortlisted') {
      await query(`UPDATE tasks SET status = 'applications_open' WHERE id = $1`, [id]);
    }

    // Notify buyer
    if (task.buyer_user_id) {
      NotificationService.createNotification(
        task.buyer_user_id,
        'New Task Application',
        `A worker has applied for your task: ${task.title}. Proposed price: ₦${proposed_price}`,
        'task_update',
        { taskId: id }
      );
    }

    return res.status(201).json({
      application: result.rows[0],
      message: 'Application submitted successfully'
    });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Worker has already applied for this task' });
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Tasks] Error submitting application:', errorMessage);
    return res.status(500).json({ error: 'Failed to submit application' });
  }
});

// Buyer selects final worker
router.post('/:id/confirm-worker', authenticate, requireRole('buyer', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { worker_id } = req.body;

    if (!worker_id) {
      return res.status(400).json({ error: 'Worker ID is required' });
    }

    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (req.user?.role !== 'admin' && taskResult.rows[0].buyer_user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Not authorized for this task' });
    }
    
    const task = taskResult.rows[0];
    if (task.selected_worker_id && task.selected_worker_id !== worker_id && task.buyer_confirmed) {
      return res.status(400).json({ error: 'Another worker has already been confirmed by the buyer' });
    }

    const result = await query(
      `UPDATE tasks SET selected_worker_id = $1, buyer_confirmed = true, status = 'selection_in_progress'
       WHERE id = $2 RETURNING *`,
      [worker_id, id]
    );

    // Notify worker
    NotificationService.notifyWorker(
      worker_id,
      'You were selected!',
      `The buyer selected you for task: ${task.title}. Please review and accept the assignment to begin work.`,
      'task_update',
      { taskId: id }
    );

    return res.json({
      task: result.rows[0],
      message: 'Worker confirmed by buyer'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Tasks] Error confirming worker by buyer:', errorMessage);
    return res.status(500).json({ error: 'Failed to confirm worker' });
  }
});

// Worker accepts assignment
router.post('/:id/accept-assignment', authenticate, requireRole('worker'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { worker_id } = req.body; // Usually from auth context, but taking from body for now

    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    let task = taskResult.rows[0];
    if (req.user?.role !== 'admin' && task.selected_worker_id !== req.user?.worker_id) {
      return res.status(403).json({ error: 'Not authorized for this task' });
    }
    
    if (task.selected_worker_id !== worker_id) {
      return res.status(403).json({ error: 'Worker is not the selected worker for this task' });
    }
    
    if (!task.buyer_confirmed) {
      return res.status(400).json({ error: 'Buyer has not confirmed this worker yet' });
    }
    
    if (task.status === 'assigned') {
      return res.status(400).json({ error: 'Task is already fully assigned' });
    }

    // Both parties agreed! Update to assigned and create escrow
    const escrow = await createSquadEscrow(task.id, task.amount_naira);

    const result = await query(
      `UPDATE tasks 
       SET worker_confirmed = true, assigned_worker_id = $1, assigned_at = NOW(), 
           status = 'assigned', squad_va_account_number = $2
       WHERE id = $3 RETURNING *`,
      [worker_id, escrow.squad_va_number, id]
    );

    // Notify buyer
    if (task.buyer_user_id) {
      NotificationService.createNotification(
        task.buyer_user_id,
        'Task Assigned & Escrow Created',
        `The worker accepted the assignment for: ${task.title}. An escrow account has been created for the payment.`,
        'escrow_update',
        { taskId: id }
      );
    }

    return res.json({
      task: result.rows[0],
      escrow,
      message: 'Task fully assigned and escrow created'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Tasks] Error accepting assignment:', errorMessage);
    return res.status(500).json({ error: 'Failed to accept assignment' });
  }
});

// Recommend Final Worker (Optional Advanced AI)
router.post('/:id/recommend-final', authenticate, requireRole('buyer', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (req.user?.role !== 'admin' && taskResult.rows[0].buyer_user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Not authorized for this task' });
    }
    
    const applicationsResult = await query(
      `SELECT a.*, w.name, w.trust_score, w.avg_rating 
       FROM task_applications a 
       JOIN workers w ON a.worker_id = w.id 
       WHERE a.task_id = $1`,
      [id]
    );
    
    if (applicationsResult.rows.length === 0) {
      return res.status(400).json({ error: 'No applications found for this task' });
    }
    
    // Simulate AI compare applicants logic
    const applicants = applicationsResult.rows;
    // Just pick highest trust_score for now
    const bestChoice = applicants.reduce((prev, current) => (prev.trust_score > current.trust_score) ? prev : current);
    
    return res.json({
      best_choice: bestChoice.worker_id,
      reason: 'Recommended based on highest trust score among applicants.',
      risk_notes: ['Ensure proposed price matches budget.']
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Tasks] Error recommending final worker:', errorMessage);
    return res.status(500).json({ error: 'Failed to recommend final worker' });
  }
});

// Submit task completion proof
router.post('/:id/submit-proof', authenticate, requireRole('worker'), upload.array('files', 3), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    
    const files = req.files as Express.Multer.File[];
    let fileUrls: string[] = [];
    
    if (files) {
      fileUrls = files.map(f => `http://localhost:${process.env.PORT || 3001}/uploads/${f.filename}`);
    }

    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    if (req.user?.role !== 'admin' && taskResult.rows[0].assigned_worker_id !== req.user?.worker_id) {
      return res.status(403).json({ error: 'Not authorized for this task' });
    }

    const proof_submission = {
      text,
      files: fileUrls
    };

    if (!proof_submission.text && fileUrls.length === 0) {
      return res.status(400).json({ error: 'Proof submission is required' });
    }

    // 1. Submit proof & Run AI verification
    const verification = await verifyTaskCompletion(parseInt(id, 10), proof_submission);

    // 2. Determine status based on AI review
    // If pass -> 'verified' (24h dispute window opens)
    // If fail -> 'flagged_for_dispute'
    const status = verification.verified ? 'verified' : 'flagged_for_dispute';

    // Set dispute window expiry (24 hours from verification)
    const WINDOW_MS = process.env.NODE_ENV === 'test' ? 60_000 : 24 * 60 * 60 * 1000;
    const disputeWindowExpires = new Date(Date.now() + WINDOW_MS);

    const result = await query(
      `UPDATE tasks
         SET proof_submission = $1, submitted_at = NOW(), verified_at = NOW(),
             status = $2, dispute_window_expires = $3
       WHERE id = $4 RETURNING *`,
      [JSON.stringify(proof_submission), status, disputeWindowExpires, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = result.rows[0];

    // 3. Initiate the automatic payout after the 24-hour dispute window
    if (status === 'verified') {
      setTimeout(async () => {
        try {
          // Only release if buyer has NOT disputed within the window
          const checkStatus = await query(
            `SELECT t.*, e.id AS escrow_id, e.amount_naira, t.buyer_user_id
             FROM tasks t
             LEFT JOIN escrow_accounts e ON e.task_id = t.id
             WHERE t.id = $1`,
            [id]
          );
          if (
            checkStatus.rows.length > 0 &&
            checkStatus.rows[0].status === 'verified'
          ) {
            const taskData = checkStatus.rows[0];
            
            // Process wallet transfer: buyer → worker
            try {
              if (taskData.buyer_user_id && parseInt(id) > 0 && taskData.amount_naira) {
                await WalletService.releaseEscrowToWorker(
                  taskData.buyer_user_id,
                  taskData.assigned_worker_id,
                  taskData.amount_naira,
                  parseInt(id)
                );
              }
            } catch (walletError) {
              console.error(`[Tasks] Wallet transfer failed for task ${id}:`, walletError);
            }

            // Attempt Squad escrow release
            try {
              if (taskData.escrow_id && taskData.assigned_worker_id) {
                await releaseEscrowToWorker(taskData.escrow_id, taskData.assigned_worker_id);
              }
            } catch (squadError) {
              console.warn(`[Tasks] Squad release failed for task ${id}, but local wallet updated:`, squadError);
            }

            // Window elapsed with no buyer dispute -> auto-release
            await query(
              `UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = $1`,
              [id]
            );
            
            // Update escrow status
            await query(
              `UPDATE escrow_accounts SET status = 'released', released_to_worker_at = NOW() WHERE task_id = $1`,
              [id]
            );
            
            await processTaskOutcome(
              taskData.assigned_worker_id,
              true,
              taskData.amount_naira
            );
            console.log(`[Tasks] Auto-released payment for task ${id} after dispute window.`);
          }
        } catch (err) {
          console.error(`[Tasks] Error auto-releasing payment for task ${id}:`, err);
        }
      }, WINDOW_MS);
    }

    // Notify buyer about the proof submission
    if (task.buyer_user_id) {
      NotificationService.createNotification(
        task.buyer_user_id,
        'Task Proof Submitted',
        `Proof submitted for task: ${task.title}. AI verification result: ${status === 'verified' ? 'Passed' : 'Flagged'}`,
        'task_update',
        { taskId: id }
      );
    }

    return res.json({
      task,
      verification,
      dispute_window_expires: status === 'verified' ? disputeWindowExpires : null,
      message:
        status === 'verified'
          ? 'AI verified. Buyer has 24 hours to dispute before funds are automatically released.'
          : 'AI flagged. Worker can file a manual dispute.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Tasks] Error submitting proof:', errorMessage);
    return res.status(500).json({ error: 'Failed to submit proof' });
  }
});

// File a complaint over AI verification bounds (legacy – use /api/v1/buyer/tasks/:id/dispute for auth'd flow)
router.post('/:id/complaint', authenticate, requireRole('buyer', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    if (req.user?.role !== 'admin' && taskResult.rows[0].buyer_user_id !== req.user?.id) {
      return res.status(403).json({ error: 'Not authorized for this task' });
    }
    
    const task = taskResult.rows[0];

    // Only allow complaints when AI has verified (buyer has 24hrs)
    if (task.status !== 'verified') {
      return res.status(400).json({ error: 'Task must be in verified state for complaint window' });
    }

    // Enforce the 24-hour window
    if (task.dispute_window_expires && new Date() > new Date(task.dispute_window_expires)) {
      return res.status(400).json({
        error: 'Dispute window expired – funds have been auto-released to worker',
        window_expired_at: task.dispute_window_expires,
      });
    }

    const result = await query(
      `UPDATE tasks SET status = 'complaint_filed' WHERE id = $1 RETURNING *`,
      [id]
    );

    // Apply penalty to the worker's economic profile
    await processTaskOutcome(task.assigned_worker_id, false, 0);

    return res.json({ message: 'Complaint registered for human intervention', task: result.rows[0] });
  } catch (error) {
    console.error('[Tasks] Error filing complaint:', error);
    return res.status(500).json({ error: 'Failed to file complaint' });
  }
});

// Manually dispute a low flag
router.post('/:id/dispute', authenticate, requireRole('worker', 'buyer', 'admin'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { message: _message } = req.body;

    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    if (req.user?.role !== 'admin' && taskResult.rows[0].assigned_worker_id !== req.user?.worker_id) {
      return res.status(403).json({ error: 'Not authorized for this task' });
    }

    if (taskResult.rows[0].status !== 'flagged_for_dispute') {
      return res.status(400).json({ error: 'Only tasks flagged by AI as low can be manually disputed' });
    }

    const result = await query(
      `UPDATE tasks SET status = 'disputed' WHERE id = $1 RETURNING *`,
      [id]
    );

    return res.json({ message: 'Manual dispute filed', task: result.rows[0] });
  } catch (error) {
    console.error('[Tasks] Error filing dispute:', error);
    return res.status(500).json({ error: 'Failed to file dispute' });
  }
});

// Get task status
router.get('/:id/status', authenticate, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query(
      'SELECT id, status, assigned_worker_id, submitted_at, verified_at FROM tasks WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Tasks] Error fetching task status:', errorMessage);
    return res.status(500).json({ error: 'Failed to fetch task status' });
  }
});

export default router;
