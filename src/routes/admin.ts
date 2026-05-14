import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool';
import { authenticate, requireRole, auditLog } from '../middleware/auth';

const router = Router();

// ALL admin routes require authentication + admin role
router.use(authenticate);
router.use(requireRole('admin'));

// ════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════

/**
 * GET /api/v1/admin/dashboard
 * High-level platform statistics.
 */
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const [tasks, workers, users, disputes, escrow] = await Promise.all([
      query(`SELECT status, COUNT(*) FROM tasks GROUP BY status`),
      query(`SELECT COUNT(*) AS total, SUM(CASE WHEN is_active THEN 1 ELSE 0 END) AS active FROM workers`),
      query(`SELECT role, COUNT(*) FROM users GROUP BY role`),
      query(`SELECT status, COUNT(*) FROM dispute_logs GROUP BY status`),
      query(`SELECT SUM(amount_naira) AS total_escrowed,
                    SUM(CASE WHEN status='funded'   THEN amount_naira ELSE 0 END) AS funded,
                    SUM(CASE WHEN status='released' THEN amount_naira ELSE 0 END) AS released,
                    SUM(CASE WHEN status='refunded' THEN amount_naira ELSE 0 END) AS refunded
             FROM escrow_accounts`),
    ]);

    return res.json({
      tasks_by_status: tasks.rows,
      workers: workers.rows[0],
      users_by_role: users.rows,
      disputes_by_status: disputes.rows,
      escrow_summary: escrow.rows[0],
    });
  } catch (error: any) {
    console.error('[Admin] Dashboard error:', error.message);
    return res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ════════════════════════════════════════════════════════
// USER MANAGEMENT
// ════════════════════════════════════════════════════════

/** GET /api/v1/admin/users – list all users */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const { role, search, page = '1', limit = '20' } = req.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let sql = `SELECT id, email, full_name, phone, role, worker_id, is_active, created_at
               FROM users WHERE 1=1`;
    const params: any[] = [];

    if (role) { params.push(role); sql += ` AND role = $${params.length}`; }
    if (search) { params.push(`%${search}%`); sql += ` AND (email ILIKE $${params.length} OR full_name ILIKE $${params.length})`; }

    params.push(parseInt(limit)); sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;
    params.push(offset);          sql += ` OFFSET $${params.length}`;

    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/** GET /api/v1/admin/users/:id */
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, email, full_name, phone, role, worker_id, is_active, created_at, updated_at
       FROM users WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/** PATCH /api/v1/admin/users/:id – update role or is_active */
router.patch('/users/:id', async (req: Request, res: Response) => {
  try {
    const { role, is_active, full_name, phone } = req.body;
    const updates: string[] = [];
    const params: any[] = [];

    if (role !== undefined)      { params.push(role);      updates.push(`role = $${params.length}`); }
    if (is_active !== undefined) { params.push(is_active); updates.push(`is_active = $${params.length}`); }
    if (full_name !== undefined) { params.push(full_name); updates.push(`full_name = $${params.length}`); }
    if (phone !== undefined)     { params.push(phone);     updates.push(`phone = $${params.length}`); }

    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.id);
    const result = await query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });

    await auditLog(req.user!.id, 'admin', 'update_user', 'users', parseInt(req.params.id), req.body);
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

/** POST /api/v1/admin/users – create admin/buyer/worker user */
router.post('/users', async (req: Request, res: Response) => {
  try {
    const { email, password, full_name, phone, role = 'buyer', worker_id } = req.body;
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'email, password, full_name required' });
    }
    const password_hash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, phone, role, worker_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, email, full_name, role, created_at`,
      [email, password_hash, full_name, phone || null, role, worker_id || null]
    );
    await auditLog(req.user!.id, 'admin', 'create_user', 'users', result.rows[0].id, { email, role });
    return res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') return res.status(409).json({ error: 'Email already exists' });
    return res.status(500).json({ error: 'Failed to create user' });
  }
});

/** DELETE /api/v1/admin/users/:id – deactivate (soft delete) */
router.delete('/users/:id', async (req: Request, res: Response) => {
  try {
    await query(`UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1`, [req.params.id]);
    await auditLog(req.user!.id, 'admin', 'deactivate_user', 'users', parseInt(req.params.id), {});
    return res.json({ message: 'User deactivated' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// ════════════════════════════════════════════════════════
// TASK MANAGEMENT
// ════════════════════════════════════════════════════════

/** GET /api/v1/admin/tasks – list all tasks with full details */
router.get('/tasks', async (req: Request, res: Response) => {
  try {
    const { status, page = '1', limit = '20' } = req.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params: any[] = [];
    let where = 'WHERE 1=1';

    if (status) { params.push(status); where += ` AND t.status = $${params.length}`; }

    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT t.*,
              w.name AS worker_name, w.email AS worker_email,
              u.email AS buyer_email, u.full_name AS buyer_name,
              e.status AS escrow_status, e.amount_naira AS escrow_amount, e.funded_at
       FROM tasks t
       LEFT JOIN workers w ON w.id = t.assigned_worker_id
       LEFT JOIN users u ON u.id = t.buyer_user_id
       LEFT JOIN escrow_accounts e ON e.task_id = t.id
       ${where}
       ORDER BY t.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

/** GET /api/v1/admin/tasks/:id */
router.get('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT t.*,
              w.name AS worker_name, w.email AS worker_email,
              u.email AS buyer_email, u.full_name AS buyer_name,
              e.status AS escrow_status, e.amount_naira AS escrow_amount,
              e.funded_at, e.released_to_worker_at, e.refunded_to_client_at
       FROM tasks t
       LEFT JOIN workers w ON w.id = t.assigned_worker_id
       LEFT JOIN users u ON u.id = t.buyer_user_id
       LEFT JOIN escrow_accounts e ON e.task_id = t.id
       WHERE t.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch task' });
  }
});

/** PATCH /api/v1/admin/tasks/:id/status – force-set a task status */
router.patch('/tasks/:id/status', async (req: Request, res: Response) => {
  try {
    const { status, admin_resolution } = req.body;
    const validStatuses = [
      'posted','assigned','funded','verified','completed',
      'buyer_disputed','complaint_filed','disputed','cancelled','refunded',
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status', valid: validStatuses });
    }

    const result = await query(
      `UPDATE tasks SET status = $1, admin_resolution = $2, admin_resolved_at = NOW(),
                        admin_resolved_by = $3
       WHERE id = $4 RETURNING *`,
      [status, admin_resolution || null, req.user!.id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    await auditLog(req.user!.id, 'admin', 'force_task_status', 'tasks', parseInt(req.params.id), {
      status, admin_resolution,
    });
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update task status' });
  }
});

/** POST /api/v1/admin/tasks/:id/release-funds – admin force-releases funds to worker */
router.post('/tasks/:id/release-funds', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    await query(
      `UPDATE tasks SET status = 'completed', completed_at = NOW(),
                        admin_resolved_by = $1, admin_resolved_at = NOW()
       WHERE id = $2`,
      [req.user!.id, id]
    );

    await auditLog(req.user!.id, 'admin', 'admin_release_funds', 'tasks', parseInt(id), {});
    return res.json({ message: 'Funds released to worker by admin' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to release funds' });
  }
});

/** POST /api/v1/admin/tasks/:id/refund – admin force-refunds buyer */
router.post('/tasks/:id/refund', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    await query(
      `UPDATE tasks SET status = 'refunded', admin_resolved_by = $1, admin_resolved_at = NOW()
       WHERE id = $2`,
      [req.user!.id, id]
    );

    await auditLog(req.user!.id, 'admin', 'admin_refund', 'tasks', parseInt(id), {});
    return res.json({ message: 'Buyer refunded by admin' });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to refund task' });
  }
});

// ════════════════════════════════════════════════════════
// DISPUTE MANAGEMENT
// ════════════════════════════════════════════════════════

/** GET /api/v1/admin/disputes – list all disputes */
router.get('/disputes', async (req: Request, res: Response) => {
  try {
    const { status } = req.query as any;
    const params: any[] = [];
    let where = 'WHERE 1=1';

    if (status) { params.push(status); where += ` AND d.status = $${params.length}`; }

    const result = await query(
      `SELECT d.*,
              t.title AS task_title, t.amount_naira, t.status AS task_status,
              u.email AS filed_by_email, u.full_name AS filed_by_name
       FROM dispute_logs d
       JOIN tasks t ON t.id = d.task_id
       LEFT JOIN users u ON u.id = d.filed_by
       ${where}
       ORDER BY d.created_at DESC`,
      params
    );
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch disputes' });
  }
});

/** GET /api/v1/admin/disputes/:id */
router.get('/disputes/:id', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT d.*,
              t.title AS task_title, t.amount_naira, t.ai_verification_result, t.proof_submission,
              u.email AS filed_by_email, u.full_name AS filed_by_name
       FROM dispute_logs d
       JOIN tasks t ON t.id = d.task_id
       LEFT JOIN users u ON u.id = d.filed_by
       WHERE d.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Dispute not found' });
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch dispute' });
  }
});

/**
 * PATCH /api/v1/admin/disputes/:id/resolve
 * Body: { resolution: 'resolved_worker'|'resolved_buyer'|'escalated', resolution_note }
 */
router.patch('/disputes/:id/resolve', async (req: Request, res: Response) => {
  try {
    const { resolution, resolution_note } = req.body;
    const validResolutions = ['resolved_worker', 'resolved_buyer', 'escalated'];
    if (!validResolutions.includes(resolution)) {
      return res.status(400).json({ error: 'Invalid resolution', valid: validResolutions });
    }

    const disputeResult = await query('SELECT * FROM dispute_logs WHERE id = $1', [req.params.id]);
    if (disputeResult.rows.length === 0) return res.status(404).json({ error: 'Dispute not found' });

    const dispute = disputeResult.rows[0];

    await query(
      `UPDATE dispute_logs
         SET status = $1, resolution_note = $2, resolved_by = $3, resolved_at = NOW()
       WHERE id = $4`,
      [resolution, resolution_note || null, req.user!.id, req.params.id]
    );

    // Apply task-level action based on resolution
    if (resolution === 'resolved_worker') {
      await query(
        `UPDATE tasks SET status = 'completed', completed_at = NOW(),
                          admin_resolved_by = $1, admin_resolved_at = NOW()
         WHERE id = $2`,
        [req.user!.id, dispute.task_id]
      );
    } else if (resolution === 'resolved_buyer') {
      await query(
        `UPDATE tasks SET status = 'refunded',
                          admin_resolved_by = $1, admin_resolved_at = NOW()
         WHERE id = $2`,
        [req.user!.id, dispute.task_id]
      );
    }

    await auditLog(req.user!.id, 'admin', 'resolve_dispute', 'dispute_logs', parseInt(req.params.id), {
      resolution, task_id: dispute.task_id,
    });

    return res.json({ message: `Dispute resolved: ${resolution}` });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to resolve dispute' });
  }
});

// ════════════════════════════════════════════════════════
// WORKER MANAGEMENT
// ════════════════════════════════════════════════════════

/** GET /api/v1/admin/workers – list all workers with trust scores */
router.get('/workers', async (req: Request, res: Response) => {
  try {
    const { search, is_active, page = '1', limit = '20' } = req.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params: any[] = [];
    let where = 'WHERE 1=1';

    if (is_active !== undefined) { params.push(is_active === 'true'); where += ` AND w.is_active = $${params.length}`; }
    if (search) { params.push(`%${search}%`); where += ` AND (w.name ILIKE $${params.length} OR w.email ILIKE $${params.length})`; }

    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT w.*, COUNT(t.id) AS assigned_tasks
       FROM workers w
       LEFT JOIN tasks t ON t.assigned_worker_id = w.id
       ${where}
       GROUP BY w.id
       ORDER BY w.trust_score DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch workers' });
  }
});

/** PATCH /api/v1/admin/workers/:id – update trust score, is_active, etc. */
router.patch('/workers/:id', async (req: Request, res: Response) => {
  try {
    const allowed = ['trust_score', 'is_active', 'skills', 'bio'];
    const updates: string[] = [];
    const params: any[] = [];

    for (const field of allowed) {
      if (field in req.body) {
        params.push(req.body[field]);
        updates.push(`${field} = $${params.length}`);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.params.id);
    const result = await query(
      `UPDATE workers SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Worker not found' });

    await auditLog(req.user!.id, 'admin', 'update_worker', 'workers', parseInt(req.params.id), req.body);
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update worker' });
  }
});

// ════════════════════════════════════════════════════════
// ESCROW MANAGEMENT
// ════════════════════════════════════════════════════════

/** GET /api/v1/admin/escrow – list all escrow accounts */
router.get('/escrow', async (req: Request, res: Response) => {
  try {
    const { status } = req.query as any;
    const params: any[] = [];
    let where = 'WHERE 1=1';
    if (status) { params.push(status); where += ` AND e.status = $${params.length}`; }

    const result = await query(
      `SELECT e.*, t.title AS task_title, t.status AS task_status
       FROM escrow_accounts e
       JOIN tasks t ON t.id = e.task_id
       ${where}
       ORDER BY e.created_at DESC`,
      params
    );
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch escrow accounts' });
  }
});

/** PATCH /api/v1/admin/escrow/:id/status – manually update escrow status */
router.patch('/escrow/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const valid = ['pending', 'funded', 'released', 'refunded', 'frozen'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status', valid });

    const result = await query(
      `UPDATE escrow_accounts SET status = $1, updated_at = NOW(), last_squad_event = $2
       WHERE id = $3 RETURNING *`,
      [status, `admin_override:${status}`, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Escrow not found' });

    await auditLog(req.user!.id, 'admin', 'update_escrow_status', 'escrow_accounts', parseInt(req.params.id), { status });
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to update escrow status' });
  }
});

// ════════════════════════════════════════════════════════
// AI LOGS
// ════════════════════════════════════════════════════════

/** GET /api/v1/admin/ai-logs – recent AI decision synthesis logs */
router.get('/ai-logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const result = await query(
      `SELECT l.*, t.title AS task_title
       FROM decision_synthesis_logs l
       LEFT JOIN tasks t ON t.id = l.task_id
       ORDER BY l.created_at DESC LIMIT $1`,
      [limit]
    );
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch AI logs' });
  }
});

// ════════════════════════════════════════════════════════
// AUDIT LOGS
// ════════════════════════════════════════════════════════

/** GET /api/v1/admin/audit-logs */
router.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const { actor_id, action, entity_type, page = '1', limit = '50' } = req.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params: any[] = [];
    let where = 'WHERE 1=1';

    if (actor_id)    { params.push(actor_id);    where += ` AND a.actor_id = $${params.length}`; }
    if (action)      { params.push(`%${action}%`); where += ` AND a.action ILIKE $${params.length}`; }
    if (entity_type) { params.push(entity_type); where += ` AND a.entity_type = $${params.length}`; }

    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT a.*, u.email AS actor_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// ════════════════════════════════════════════════════════
// PLATFORM SETTINGS / DISPUTE WINDOW OVERRIDE
// ════════════════════════════════════════════════════════

/**
 * POST /api/v1/admin/tasks/:id/extend-dispute-window
 * Give more time for a buyer to dispute.
 */
router.post('/tasks/:id/extend-dispute-window', async (req: Request, res: Response) => {
  try {
    const { hours = 24 } = req.body;
    const result = await query(
      `UPDATE tasks
         SET dispute_window_expires = NOW() + ($1 || ' hours')::INTERVAL
       WHERE id = $2 RETURNING id, dispute_window_expires`,
      [hours, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });
    await auditLog(req.user!.id, 'admin', 'extend_dispute_window', 'tasks', parseInt(req.params.id), { hours });
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to extend dispute window' });
  }
});

// ════════════════════════════════════════════════════════
// KYC MANAGEMENT
// ════════════════════════════════════════════════════════

/** GET /api/v1/admin/kyc – list all KYC submissions */
router.get('/kyc', async (req: Request, res: Response) => {
  try {
    const { status, page = '1', limit = '20' } = req.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params: any[] = [];
    let where = 'WHERE 1=1';
    if (status) { params.push(status); where += ` AND k.status = $${params.length}`; }
    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT k.id, k.worker_id, k.status, k.nin_submitted, k.bvn_submitted, k.address_submitted,
              k.submitted_at, k.reviewed_at, k.rejection_reason,
              w.name AS worker_name, w.email AS worker_email, w.tier
       FROM worker_kyc k
       JOIN workers w ON w.id = k.worker_id
       ${where}
       ORDER BY k.submitted_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch KYC submissions' });
  }
});

/** GET /api/v1/admin/kyc/:id – KYC detail */
router.get('/kyc/:id', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT k.*, w.name AS worker_name, w.email AS worker_email, w.tier
       FROM worker_kyc k JOIN workers w ON w.id = k.worker_id
       WHERE k.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'KYC record not found' });
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch KYC record' });
  }
});

/**
 * PATCH /api/v1/admin/kyc/:id/review
 * Body: { decision: 'approved'|'rejected', rejection_reason? }
 * On approval: upgrades worker tier to 'verified'.
 */
router.patch('/kyc/:id/review', async (req: Request, res: Response) => {
  try {
    const { decision, rejection_reason } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be "approved" or "rejected"' });
    }
    if (decision === 'rejected' && !rejection_reason) {
      return res.status(400).json({ error: 'rejection_reason is required when rejecting KYC' });
    }

    const kycResult = await query('SELECT * FROM worker_kyc WHERE id = $1', [req.params.id]);
    if (kycResult.rows.length === 0) return res.status(404).json({ error: 'KYC not found' });
    const kyc = kycResult.rows[0];

    await query(
      `UPDATE worker_kyc
         SET status = $1, rejection_reason = $2, reviewed_by = $3, reviewed_at = NOW()
       WHERE id = $4`,
      [decision, rejection_reason || null, req.user!.id, req.params.id]
    );

    // Upgrade worker tier on approval
    if (decision === 'approved') {
      await query(`UPDATE workers SET tier = 'verified', updated_at = NOW() WHERE id = $1`, [kyc.worker_id]);
    }

    await auditLog(req.user!.id, 'admin', `kyc_${decision}`, 'worker_kyc', parseInt(req.params.id), {
      worker_id: kyc.worker_id, decision, rejection_reason,
    });

    return res.json({
      message: `KYC ${decision}. ${decision === 'approved' ? 'Worker tier upgraded to verified.' : ''}`,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to review KYC' });
  }
});

// ════════════════════════════════════════════════════════
// LOAN MANAGEMENT
// ════════════════════════════════════════════════════════

/** GET /api/v1/admin/loans */
router.get('/loans', async (req: Request, res: Response) => {
  try {
    const { status, page = '1', limit = '20' } = req.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params: any[] = [];
    let where = 'WHERE 1=1';
    if (status) { params.push(status); where += ` AND l.status = $${params.length}`; }
    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT l.*, w.name AS worker_name, w.email AS worker_email, w.tier
       FROM worker_loans l
       JOIN workers w ON w.id = l.worker_id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch loans' });
  }
});

/** GET /api/v1/admin/loans/:id */
router.get('/loans/:id', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT l.*, w.name AS worker_name, w.email AS worker_email
       FROM worker_loans l JOIN workers w ON w.id = l.worker_id
       WHERE l.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Loan not found' });
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch loan' });
  }
});

/**
 * PATCH /api/v1/admin/loans/:id/review
 * Body: { decision: 'approved'|'rejected', admin_note?, rejection_reason? }
 */
router.patch('/loans/:id/review', async (req: Request, res: Response) => {
  try {
    const { decision, admin_note, rejection_reason } = req.body;
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be "approved" or "rejected"' });
    }

    const result = await query(
      `UPDATE worker_loans
         SET status = $1, admin_note = $2, rejection_reason = $3,
             approved_by = $4, approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE NULL END,
             updated_at = NOW()
       WHERE id = $5 RETURNING *`,
      [decision, admin_note || null, rejection_reason || null, req.user!.id, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Loan not found' });

    await auditLog(req.user!.id, 'admin', `loan_${decision}`, 'worker_loans', parseInt(req.params.id), { decision });
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to review loan' });
  }
});

/** PATCH /api/v1/admin/loans/:id/disburse – mark loan as disbursed */
router.patch('/loans/:id/disburse', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `UPDATE worker_loans SET status = 'disbursed', disbursed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND status = 'approved' RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Loan not found or not in approved state' });
    }
    await auditLog(req.user!.id, 'admin', 'loan_disbursed', 'worker_loans', parseInt(req.params.id), {});
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to disburse loan' });
  }
});

// ════════════════════════════════════════════════════════
// INSURANCE MANAGEMENT
// ════════════════════════════════════════════════════════

/** GET /api/v1/admin/insurance */
router.get('/insurance', async (req: Request, res: Response) => {
  try {
    const { status, page = '1', limit = '20' } = req.query as any;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params: any[] = [];
    let where = 'WHERE 1=1';
    if (status) { params.push(status); where += ` AND i.status = $${params.length}`; }
    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT i.*, w.name AS worker_name, w.email AS worker_email, w.tier
       FROM worker_insurance i
       JOIN workers w ON w.id = i.worker_id
       ${where}
       ORDER BY i.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.json(result.rows);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch insurance applications' });
  }
});

/** GET /api/v1/admin/insurance/:id */
router.get('/insurance/:id', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT i.*, w.name AS worker_name, w.email AS worker_email
       FROM worker_insurance i JOIN workers w ON w.id = i.worker_id
       WHERE i.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Insurance record not found' });
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to fetch insurance record' });
  }
});

/**
 * PATCH /api/v1/admin/insurance/:id/review
 * Body: { decision: 'active'|'rejected', admin_note?, rejection_reason?, expires_at? }
 */
router.patch('/insurance/:id/review', async (req: Request, res: Response) => {
  try {
    const { decision, admin_note, rejection_reason, expires_at } = req.body;
    if (!['active', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'decision must be "active" or "rejected"' });
    }

    const defaultExpiry = new Date();
    defaultExpiry.setFullYear(defaultExpiry.getFullYear() + 1); // 1-year default

    const result = await query(
      `UPDATE worker_insurance
         SET status = $1, admin_note = $2, rejection_reason = $3,
             approved_by = $4,
             approved_at = CASE WHEN $1 = 'active' THEN NOW() ELSE NULL END,
             expires_at = CASE WHEN $1 = 'active' THEN $5::TIMESTAMP ELSE NULL END,
             updated_at = NOW()
       WHERE id = $6 RETURNING *`,
      [decision, admin_note || null, rejection_reason || null, req.user!.id,
       expires_at || defaultExpiry.toISOString(), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Insurance not found' });

    await auditLog(req.user!.id, 'admin', `insurance_${decision}`, 'worker_insurance', parseInt(req.params.id), { decision });
    return res.json(result.rows[0]);
  } catch (error: any) {
    return res.status(500).json({ error: 'Failed to review insurance' });
  }
});

export default router;

