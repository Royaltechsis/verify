import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { query } from '../db/pool';
import { v4 as uuidv4 } from 'uuid';
import { getWorkerMatches, verifyTaskCompletion } from '../services/ai-matching';
import { createSquadEscrow, releaseEscrowToWorker } from '../services/squad-service';
import { processTaskOutcome } from '../services/financial-intelligence';
import { WalletService } from '../services/wallet-service';

import type { Task } from '../types';

const router = Router();

// Configure storage
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage: storage });

// Get all tasks
router.get('/', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    const location = req.query.location as string;
    
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];

    if (status) {
      sql += ' AND status = $' + (params.length + 1);
      params.push(status);
    }

    if (location) {
      sql += ' AND task_location ILIKE $' + (params.length + 1);
      params.push(`%${location}%`);
    }

    sql += ' ORDER BY created_at DESC';
    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Tasks] Error fetching tasks:', errorMessage);
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get task by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    return res.json(result.rows[0]);
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

router.post('/', parseTaskCreationUpload, async (req: Request, res: Response) => {
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
      deliverable_spec: deliverableSpecRaw
    } = req.body as any;

    let deliverable_spec = deliverableSpecRaw;
    if (typeof deliverableSpecRaw === 'string') {
      try {
        deliverable_spec = JSON.parse(deliverableSpecRaw);
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
        amount_naira, task_location, location_latitude, location_longitude, due_date, deliverable_spec)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        task_uuid, title, description, client_name, client_email, required_skills,
        amount_naira, task_location, location_latitude, location_longitude, due_date, JSON.stringify(deliverable_spec)
      ]
    );

    // Get worker matches
    const task = result.rows[0] as Task;
    const matches = await getWorkerMatches(task, 5);

    return res.status(201).json({
      task,
      matches
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Tasks] Error creating task:', errorMessage);
    return res.status(500).json({ error: 'Failed to create task' });
  }
});

// Assign worker to task
router.post('/:id/assign', async (req: Request, res: Response) => {
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

    // Verify worker exists
    const workerResult = await query('SELECT id FROM workers WHERE id = $1', [worker_id]);
    if (workerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    const task = taskResult.rows[0];

    // Create Squad escrow account
    const escrow = await createSquadEscrow(task.id, task.amount_naira);

    // Update task with assignment
    const result = await query(
      `UPDATE tasks SET assigned_worker_id = $1, assigned_at = NOW(), status = 'assigned', squad_va_account_number = $2
       WHERE id = $3 RETURNING *`,
      [worker_id, escrow.squad_va_number, id]
    );

    return res.json({
      task: result.rows[0],
      escrow
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Tasks] Error assigning worker:', errorMessage);
    return res.status(500).json({ error: 'Failed to assign worker' });
  }
});

// Submit task completion proof
router.post('/:id/submit-proof', upload.array('files', 3), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    
    // Access files via req.files
    const files = req.files as Express.Multer.File[];
    let fileUrls: string[] = [];
    
    if (files) {
      fileUrls = files.map(f => `http://localhost:${process.env.PORT || 3001}/uploads/${f.filename}`);
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
router.post('/:id/complaint', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    
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
router.post('/:id/dispute', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { message: _message } = req.body;

    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

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
router.get('/:id/status', async (req: Request, res: Response) => {
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
