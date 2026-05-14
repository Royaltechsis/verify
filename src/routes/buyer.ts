import { Router, Request, Response } from 'express';
import multer from 'multer';
import { query } from '../db/pool';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, requireRole, auditLog } from '../middleware/auth';
import { getWorkerMatches } from '../services/ai-matching';
import { createSquadEscrow } from '../services/squad-service';
import type { Task } from '../types';

const router = Router();

// All buyer routes require authentication + buyer role
router.use(authenticate);
router.use(requireRole('buyer', 'admin'));

const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});
const upload = multer({ storage });

// ─── GET /api/v1/buyer/tasks ─────────────────────────────────────────────────
// List all tasks posted by the authenticated buyer
router.get('/tasks', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT t.*, e.status AS escrow_status, e.squad_va_number, e.amount_naira AS escrow_amount,
              e.funded_at, e.released_to_worker_at, e.refunded_to_client_at
       FROM tasks t
       LEFT JOIN escrow_accounts e ON e.task_id = t.id
       WHERE t.buyer_user_id = $1
       ORDER BY t.created_at DESC`,
      [req.user!.id]
    );
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch buyer tasks' });
  }
});

// ─── POST /api/v1/buyer/tasks ────────────────────────────────────────────────
// Create a task (hirer posts a job)
router.post('/tasks', async (req: Request, res: Response) => {
  try {
    const {
      title,
      description,
      required_skills,
      amount_naira,
      task_location,
      location_latitude,
      location_longitude,
      due_date,
      deliverable_spec,
    } = req.body;

    if (!title || !description || !amount_naira || !task_location || !due_date || !deliverable_spec) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const task_uuid = uuidv4();
    const user = req.user!;

    const result = await query(
      `INSERT INTO tasks
         (task_uuid, title, description, client_name, client_email, required_skills,
          amount_naira, task_location, location_latitude, location_longitude, due_date,
          deliverable_spec, buyer_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        task_uuid, title, description,
        user.email, user.email, required_skills || [],
        amount_naira, task_location, location_latitude, location_longitude,
        due_date, JSON.stringify(deliverable_spec), user.id,
      ]
    );

    const task = result.rows[0] as Task;
    const matches = await getWorkerMatches(task, 5);

    await auditLog(user.id, user.role, 'create_task', 'tasks', task.id, { task_uuid });

    return res.status(201).json({ task, matches });
  } catch (error: any) {
    console.error('[Buyer] Error creating task:', error.message);
    return res.status(500).json({ error: 'Failed to create task' });
  }
});

// ─── GET /api/v1/buyer/tasks/:id ────────────────────────────────────────────
router.get('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT t.*, e.status AS escrow_status, e.squad_va_number, e.funded_at
       FROM tasks t
       LEFT JOIN escrow_accounts e ON e.task_id = t.id
       WHERE t.id = $1 AND t.buyer_user_id = $2`,
      [req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or not yours' });
    }
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// ─── POST /api/v1/buyer/tasks/:id/assign ────────────────────────────────────
// Buyer selects a worker from AI recommendations
router.post('/tasks/:id/assign', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { worker_id } = req.body;

    if (!worker_id) return res.status(400).json({ error: 'worker_id is required' });

    const taskResult = await query(
      'SELECT * FROM tasks WHERE id = $1 AND buyer_user_id = $2',
      [id, req.user!.id]
    );
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or not yours' });
    }

    const workerResult = await query('SELECT id FROM workers WHERE id = $1', [worker_id]);
    if (workerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    const task = taskResult.rows[0];
    const escrow = await createSquadEscrow(task.id, task.amount_naira);

    const result = await query(
      `UPDATE tasks
         SET assigned_worker_id = $1, assigned_at = NOW(), status = 'assigned',
             squad_va_account_number = $2
       WHERE id = $3 RETURNING *`,
      [worker_id, escrow.squad_va_number, id]
    );

    await auditLog(req.user!.id, req.user!.role, 'assign_worker', 'tasks', parseInt(id), {
      worker_id,
    });

    return res.json({ task: result.rows[0], escrow });
  } catch (error: any) {
    console.error('[Buyer] Error assigning worker:', error.message);
    return res.status(500).json({ error: 'Failed to assign worker' });
  }
});

// ─── POST /api/v1/buyer/tasks/:id/dispute ────────────────────────────────────
// Buyer disputes within the 24-hour window (AI passed but buyer disagrees)
router.post('/tasks/:id/dispute', upload.array('evidence', 5), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) return res.status(400).json({ error: 'Dispute reason is required' });

    const taskResult = await query(
      'SELECT * FROM tasks WHERE id = $1 AND buyer_user_id = $2',
      [id, req.user!.id]
    );
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or not yours' });
    }

    const task = taskResult.rows[0];

    // Only allow disputes during the 24-hour window
    if (task.status !== 'verified') {
      return res.status(400).json({
        error: `Cannot dispute task in '${task.status}' state. Task must be in 'verified' state.`,
      });
    }

    if (task.dispute_window_expires && new Date() > new Date(task.dispute_window_expires)) {
      return res.status(400).json({
        error: 'Dispute window has expired (24 hours after AI verification)',
        window_expired_at: task.dispute_window_expires,
      });
    }

    // Collect evidence file URLs
    const files = req.files as Express.Multer.File[] | undefined;
    const evidenceUrls = files
      ? files.map(f => `http://localhost:${process.env.PORT || 3001}/uploads/${f.filename}`)
      : [];

    // Update task status
    await query(
      `UPDATE tasks SET status = 'buyer_disputed', dispute_reason = $1 WHERE id = $2`,
      [reason, id]
    );

    // Create a dispute log entry
    const disputeResult = await query(
      `INSERT INTO dispute_logs (task_id, filed_by, reason, evidence_urls, status)
       VALUES ($1, $2, $3, $4, 'open') RETURNING *`,
      [id, req.user!.id, reason, evidenceUrls]
    );

    await auditLog(req.user!.id, req.user!.role, 'buyer_dispute', 'tasks', parseInt(id), {
      reason,
    });

    return res.json({
      message: 'Dispute filed. An admin will review within 48 hours.',
      dispute: disputeResult.rows[0],
    });
  } catch (error: any) {
    console.error('[Buyer] Error filing dispute:', error.message);
    return res.status(500).json({ error: 'Failed to file dispute' });
  }
});

// ─── POST /api/v1/buyer/tasks/:id/release-funds ──────────────────────────────
// Bypass the 24-hour window — buyer manually releases funds to the worker
router.post('/tasks/:id/release-funds', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const taskResult = await query(
      'SELECT * FROM tasks WHERE id = $1 AND buyer_user_id = $2',
      [id, req.user!.id]
    );
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or not yours' });
    }

    const task = taskResult.rows[0];

    // Allow release if task is verified (during window) or pending_release
    const releasableStatuses = ['verified', 'pending_release'];
    if (!releasableStatuses.includes(task.status)) {
      return res.status(400).json({
        error: `Cannot release funds for task in '${task.status}' state.`,
        releasable_when: releasableStatuses,
      });
    }

    // Mark task as completed immediately
    await query(
      `UPDATE tasks
         SET status = 'completed', buyer_released_at = NOW(), completed_at = NOW()
       WHERE id = $1`,
      [id]
    );

    await auditLog(req.user!.id, req.user!.role, 'buyer_manual_release', 'tasks', parseInt(id), {});

    return res.json({
      message: 'Funds released to worker. Task marked as completed.',
      released_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[Buyer] Error releasing funds:', error.message);
    return res.status(500).json({ error: 'Failed to release funds' });
  }
});

// ─── GET /api/v1/buyer/tasks/:id/dispute-window ──────────────────────────────
// Check how much time is left in the 24-hour dispute window
router.get('/tasks/:id/dispute-window', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, status, verified_at, dispute_window_expires, buyer_released_at, completed_at
       FROM tasks WHERE id = $1 AND buyer_user_id = $2`,
      [req.params.id, req.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or not yours' });
    }

    const task = result.rows[0];
    const now = new Date();
    const expires = task.dispute_window_expires ? new Date(task.dispute_window_expires) : null;

    return res.json({
      task_id: task.id,
      status: task.status,
      dispute_window_expires: task.dispute_window_expires,
      window_active: expires ? now < expires : false,
      seconds_remaining: expires ? Math.max(0, Math.floor((expires.getTime() - now.getTime()) / 1000)) : 0,
      buyer_released_at: task.buyer_released_at,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to check dispute window' });
  }
});

// ─── GET /api/v1/buyer/disputes ──────────────────────────────────────────────
// List all disputes filed by this buyer
router.get('/disputes', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT d.*, t.title AS task_title, t.amount_naira
       FROM dispute_logs d
       JOIN tasks t ON t.id = d.task_id
       WHERE d.filed_by = $1
       ORDER BY d.created_at DESC`,
      [req.user!.id]
    );
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch disputes' });
  }
});

export default router;
