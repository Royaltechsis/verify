import { Router, Request, Response } from 'express';
import { query } from '../db/pool';
import { authenticate, requireRole, auditLog } from '../middleware/auth';

const router = Router();

// All routes require a logged-in worker (or admin acting on their behalf)
router.use(authenticate);
router.use(requireRole('worker', 'admin'));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Compute a credit score (0–850) from a worker's performance metrics.
 * Inspired by FICO scoring bands:
 *   < 580  poor    (no loan/insurance access)
 *   580-669 fair
 *   670-739 good
 *   740-799 very good
 *   800+    exceptional
 */
function computeCreditScore(worker: {
  tasks_completed: number;
  tasks_successful: number;
  on_time_rate: number;
  avg_rating: number;
  trust_score: number;
}): number {
  const completionRate =
    worker.tasks_completed > 0
      ? worker.tasks_successful / worker.tasks_completed
      : 0;

  const onTimeNorm = worker.on_time_rate > 1 ? worker.on_time_rate / 100 : worker.on_time_rate;

  const finalScore =
    worker.trust_score * 0.35 +
    completionRate * 200 +
    onTimeNorm * 150 +
    worker.avg_rating * 30 +
    Math.min(worker.tasks_completed * 2, 100);

  return Math.min(Math.round(finalScore), 850);
}

function creditBand(score: number): string {
  if (score >= 800) return 'exceptional';
  if (score >= 740) return 'very_good';
  if (score >= 670) return 'good';
  if (score >= 580) return 'fair';
  return 'poor';
}

// Resolve the worker record for the authenticated user
async function resolveWorker(req: Request, res: Response): Promise<any | null> {
  const workerId = req.params.workerId ?? req.user!.worker_id;
  if (!workerId) {
    res.status(400).json({ error: 'No worker profile linked to this account. Link via worker_id on your user record.' });
    return null;
  }
  // Admins can access any worker; workers can only access their own
  if (req.user!.role === 'worker' && req.user!.worker_id !== Number(workerId)) {
    res.status(403).json({ error: 'Access denied — you can only manage your own profile' });
    return null;
  }
  const result = await query('SELECT * FROM workers WHERE id = $1', [workerId]);
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Worker not found' });
    return null;
  }
  return result.rows[0];
}

// ─── POST /api/v1/worker-profile/create ──────────────────────────────────────
// Create a new worker profile and auto-link it to the authenticated user
router.post('/create', async (req: Request, res: Response) => {
  try {
    if (req.user!.role !== 'worker') {
      return res.status(403).json({ error: 'Only workers can create a worker profile' });
    }

    if (req.user!.worker_id) {
      return res.status(400).json({ error: 'You already have a linked worker profile' });
    }

    const {
      name,
      phone,
      skills,
      bio,
      primary_location,
      latitude,
      longitude,
      avatar_url
    } = req.body;

    if (!name || !primary_location) {
      return res.status(400).json({ error: 'name and primary_location are required' });
    }

    const defaultEconomicProfile = {
      identity_verified: false,
      verification_sources: phone ? ['phone'] : [],
      behavioral_score: 50,
      reliability_score: 50,
      earning_pattern: [],
      risk_level: 'medium'
    };
    
    const defaultFinancialProfile = {
      credit_score: 300,
      loan_eligibility: false,
      recommended_loan: 0,
      insurance_risk_level: 'medium'
    };

    // Create worker profile
    const workerResult = await query(
      `INSERT INTO workers (name, email, phone, skills, bio, primary_location, latitude, longitude, avatar_url, economic_profile, financial_profile)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [name, req.user!.email, phone || null, skills || [], bio || null, primary_location, latitude || null, longitude || null, avatar_url || null, JSON.stringify(defaultEconomicProfile), JSON.stringify(defaultFinancialProfile)]
    );

    const worker = workerResult.rows[0];

    // Auto-link the worker profile to the user account
    await query(
      `UPDATE users SET worker_id = $1, updated_at = NOW() WHERE id = $2`,
      [worker.id, req.user!.id]
    );

    await auditLog(req.user!.id, 'worker', 'create_worker_profile', 'workers', worker.id, { name });

    return res.status(201).json({
      message: 'Worker profile created and linked to your account',
      worker
    });
  } catch (error: any) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Worker Profile] Create error:', errorMessage);
    return res.status(500).json({ error: 'Failed to create worker profile' });
  }
});

// ─── GET /api/v1/worker-profile/me ───────────────────────────────────────────
// My full profile + tier + credit score
router.get('/me', async (req: Request, res: Response) => {
  try {
    const worker = await resolveWorker(req, res);
    if (!worker) return;

    const creditScore = computeCreditScore(worker);
    return res.json({
      ...worker,
      credit_score: creditScore,
      credit_band: creditBand(creditScore),
      tier: worker.tier ?? 'normal',
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ─── GET /api/v1/worker-profile/me/credit-score ──────────────────────────────
router.get('/me/credit-score', async (req: Request, res: Response) => {
  try {
    const worker = await resolveWorker(req, res);
    if (!worker) return;

    const score = computeCreditScore(worker);
    const band = creditBand(score);
    const loanEligible = worker.tier === 'verified' && score >= 580;
    const insuranceEligible = worker.tier === 'verified' && score >= 580;

    return res.json({
      worker_id: worker.id,
      credit_score: score,
      credit_band: band,
      tier: worker.tier ?? 'normal',
      loan_eligible: loanEligible,
      insurance_eligible: insuranceEligible,
      breakdown: {
        trust_score_contribution: Math.round(worker.trust_score * 0.35),
        completion_rate: worker.tasks_completed > 0
          ? Math.round((worker.tasks_successful / worker.tasks_completed) * 100) + '%'
          : '0%',
        on_time_rate: (worker.on_time_rate > 1
          ? worker.on_time_rate
          : worker.on_time_rate * 100).toFixed(1) + '%',
        avg_rating: worker.avg_rating,
        tasks_completed: worker.tasks_completed,
      },
      notes: loanEligible
        ? 'You are eligible to apply for loans and insurance as a verified worker.'
        : worker.tier !== 'verified'
        ? 'Complete KYC verification to unlock loan and insurance products.'
        : 'Your credit score is below the minimum threshold (580) for loan and insurance products.',
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to compute credit score' });
  }
});

// ─── PATCH /api/v1/worker-profile/me ────────────────────────────────────────
// Update editable fields on the worker profile (workers update their own profile)
router.patch('/me', async (req: Request, res: Response) => {
  try {
    const worker = await resolveWorker(req, res);
    if (!worker) return;

    const allowed = ['name', 'phone', 'skills', 'bio', 'primary_location', 'latitude', 'longitude', 'avatar_url'];
    const updates: string[] = [];
    const values: any[] = [];

    allowed.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        values.push((req.body as any)[field]);
        updates.push(`${field} = $${values.length}`);
      }
    });

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No editable fields provided' });
    }

    // Append updated_at
    values.push(new Date());
    const setClause = updates.join(', ') + `, updated_at = $${values.length}`;

    const result = await query(
      `UPDATE workers SET ${setClause} WHERE id = $${values.length + 1} RETURNING *`,
      [...values, worker.id]
    );

    const updated = result.rows[0];

    await auditLog(req.user!.id, req.user!.role, 'update_worker_profile', 'workers', updated.id, {
      updated_fields: updates.map(u => u.split(' = ')[0])
    });

    return res.json({ message: 'Profile updated', worker: updated });
  } catch (err: any) {
    console.error('[WorkerProfile] Update error:', err.message);
    return res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// KYC
// ══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/v1/worker-profile/me/kyc ───────────────────────────────────────
router.get('/me/kyc', async (req: Request, res: Response) => {
  try {
    const worker = await resolveWorker(req, res);
    if (!worker) return;

    const result = await query(
      'SELECT id, status, nin_submitted, bvn_submitted, address_submitted, submitted_at, reviewed_at, rejection_reason FROM worker_kyc WHERE worker_id = $1 ORDER BY created_at DESC LIMIT 1',
      [worker.id]
    );

    if (result.rows.length === 0) {
      return res.json({ status: 'not_submitted', worker_tier: worker.tier ?? 'normal' });
    }
    return res.json({ ...result.rows[0], worker_tier: worker.tier ?? 'normal' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch KYC status' });
  }
});

// ─── POST /api/v1/worker-profile/me/kyc ──────────────────────────────────────
// Submit KYC documents (NIN + BVN + address confirmation)
router.post('/me/kyc', async (req: Request, res: Response) => {
  try {
    const worker = await resolveWorker(req, res);
    if (!worker) return;

    const { nin, bvn, address_line1, address_line2, city, state, country = 'Nigeria' } = req.body;

    if (!nin || !bvn || !address_line1 || !city || !state) {
      return res.status(400).json({
        error: 'Missing required KYC fields',
        required: ['nin', 'bvn', 'address_line1', 'city', 'state'],
      });
    }

    // NIN = 11 digits, BVN = 11 digits
    if (!/^\d{11}$/.test(nin)) return res.status(400).json({ error: 'NIN must be exactly 11 digits' });
    if (!/^\d{11}$/.test(bvn)) return res.status(400).json({ error: 'BVN must be exactly 11 digits' });

    // Check for existing pending/approved KYC
    const existing = await query(
      `SELECT status FROM worker_kyc WHERE worker_id = $1 AND status IN ('pending', 'approved') LIMIT 1`,
      [worker.id]
    );
    if (existing.rows.length > 0) {
      const s = existing.rows[0].status;
      return res.status(409).json({
        error: `KYC already ${s}. ${s === 'pending' ? 'Await admin review.' : 'You are already verified.'}`,
      });
    }

    const result = await query(
      `INSERT INTO worker_kyc
         (worker_id, nin_hash, bvn_hash, address_line1, address_line2, city, state, country,
          nin_submitted, bvn_submitted, address_submitted, status)
       VALUES ($1, md5($2), md5($3), $4, $5, $6, $7, $8, true, true, true, 'pending')
       RETURNING id, status, nin_submitted, bvn_submitted, address_submitted, submitted_at`,
      [worker.id, nin, bvn, address_line1, address_line2 || null, city, state, country]
    );

    await auditLog(req.user!.id, req.user!.role, 'submit_kyc', 'worker_kyc', result.rows[0].id, {
      worker_id: worker.id,
    });

    return res.status(201).json({
      message: 'KYC submitted successfully. An admin will review within 24–48 hours.',
      kyc: result.rows[0],
    });
  } catch (err: any) {
    console.error('[WorkerProfile] KYC submit error:', err.message);
    return res.status(500).json({ error: 'Failed to submit KYC' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// LOANS
// ══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/v1/worker-profile/me/loans ─────────────────────────────────────
router.get('/me/loans', async (req: Request, res: Response) => {
  try {
    const worker = await resolveWorker(req, res);
    if (!worker) return;

    const result = await query(
      `SELECT * FROM worker_loans WHERE worker_id = $1 ORDER BY created_at DESC`,
      [worker.id]
    );
    return res.json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch loans' });
  }
});

// ─── POST /api/v1/worker-profile/me/loans ────────────────────────────────────
router.post('/me/loans', async (req: Request, res: Response) => {
  try {
    const worker = await resolveWorker(req, res);
    if (!worker) return;

    // Must be verified tier
    if ((worker.tier ?? 'normal') !== 'verified') {
      return res.status(403).json({
        error: 'Loan applications require verified worker status. Complete KYC first.',
        tier: worker.tier ?? 'normal',
      });
    }

    const creditScore = computeCreditScore(worker);
    if (creditScore < 580) {
      return res.status(403).json({
        error: 'Credit score too low for a loan application.',
        credit_score: creditScore,
        minimum_required: 580,
        credit_band: creditBand(creditScore),
      });
    }

    // Check for existing active loan
    const active = await query(
      `SELECT id FROM worker_loans WHERE worker_id = $1 AND status IN ('pending', 'approved', 'disbursed') LIMIT 1`,
      [worker.id]
    );
    if (active.rows.length > 0) {
      return res.status(409).json({ error: 'You already have an active loan application or outstanding loan.' });
    }

    const { amount_naira, purpose, repayment_months = 6 } = req.body;
    if (!amount_naira || !purpose) {
      return res.status(400).json({ error: 'amount_naira and purpose are required' });
    }

    // Max loan = 3× last month earnings, capped at ₦500,000
    const maxLoan = Math.min(worker.current_month_earnings * 3, 500000);
    if (amount_naira > maxLoan) {
      return res.status(400).json({
        error: `Loan amount exceeds maximum allowed based on earnings.`,
        requested: amount_naira,
        maximum_allowed: maxLoan,
      });
    }

    const result = await query(
      `INSERT INTO worker_loans
         (worker_id, amount_naira, purpose, repayment_months, credit_score_at_application, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [worker.id, amount_naira, purpose, repayment_months, creditScore]
    );

    await auditLog(req.user!.id, req.user!.role, 'apply_loan', 'worker_loans', result.rows[0].id, {
      worker_id: worker.id, amount_naira, credit_score: creditScore,
    });

    return res.status(201).json({
      message: 'Loan application submitted. Review within 24 hours.',
      loan: result.rows[0],
    });
  } catch (err: any) {
    console.error('[WorkerProfile] Loan apply error:', err.message);
    return res.status(500).json({ error: 'Failed to submit loan application' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// INSURANCE
// ══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/v1/worker-profile/me/insurance ─────────────────────────────────
router.get('/me/insurance', async (req: Request, res: Response) => {
  try {
    const worker = await resolveWorker(req, res);
    if (!worker) return;

    const result = await query(
      `SELECT * FROM worker_insurance WHERE worker_id = $1 ORDER BY created_at DESC`,
      [worker.id]
    );
    return res.json(result.rows);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch insurance policies' });
  }
});

// ─── POST /api/v1/worker-profile/me/insurance ────────────────────────────────
router.post('/me/insurance', async (req: Request, res: Response) => {
  try {
    const worker = await resolveWorker(req, res);
    if (!worker) return;

    if ((worker.tier ?? 'normal') !== 'verified') {
      return res.status(403).json({
        error: 'Insurance products require verified worker status. Complete KYC first.',
      });
    }

    const creditScore = computeCreditScore(worker);
    if (creditScore < 580) {
      return res.status(403).json({
        error: 'Credit score too low for insurance.',
        credit_score: creditScore,
        minimum_required: 580,
      });
    }

    const { insurance_type, coverage_amount_naira } = req.body;
    const validTypes = ['health', 'income_protection', 'accident'];
    if (!insurance_type || !validTypes.includes(insurance_type)) {
      return res.status(400).json({
        error: 'Invalid or missing insurance_type',
        valid_types: validTypes,
      });
    }

    // Check duplicate active policy of same type
    const existing = await query(
      `SELECT id FROM worker_insurance WHERE worker_id = $1 AND insurance_type = $2 AND status IN ('pending','active') LIMIT 1`,
      [worker.id, insurance_type]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: `You already have an active or pending ${insurance_type} policy.` });
    }

    const result = await query(
      `INSERT INTO worker_insurance
         (worker_id, insurance_type, coverage_amount_naira, credit_score_at_application, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [worker.id, insurance_type, coverage_amount_naira || null, creditScore]
    );

    await auditLog(req.user!.id, req.user!.role, 'apply_insurance', 'worker_insurance', result.rows[0].id, {
      worker_id: worker.id, insurance_type, credit_score: creditScore,
    });

    return res.status(201).json({
      message: 'Insurance application submitted. Review within 48 hours.',
      policy: result.rows[0],
    });
  } catch (err: any) {
    console.error('[WorkerProfile] Insurance apply error:', err.message);
    return res.status(500).json({ error: 'Failed to submit insurance application' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// TASKS
// ══════════════════════════════════════════════════════════════════════════════

// ─── GET /api/v1/worker-profile/me/tasks ─────────────────────────────────────
// Get all tasks assigned to the authenticated worker
router.get('/me/tasks', async (req: Request, res: Response) => {
  try {
    const worker = await resolveWorker(req, res);
    if (!worker) return;

    const result = await query(
      `SELECT t.*, e.status AS escrow_status, e.squad_va_number, e.funded_at, e.released_to_worker_at
       FROM tasks t
       LEFT JOIN escrow_accounts e ON e.task_id = t.id
       WHERE t.assigned_worker_id = $1
       ORDER BY t.created_at DESC`,
      [worker.id]
    );
    return res.json(result.rows);
  } catch (err: any) {
    console.error('[WorkerProfile] Error fetching worker tasks:', err.message);
    return res.status(500).json({ error: 'Failed to fetch worker tasks' });
  }
});

// ─── GET /api/v1/worker-profile/me/tasks/:id ────────────────────────────────
// Get a specific task assigned to the worker
router.get('/me/tasks/:id', async (req: Request, res: Response) => {
  try {
    const worker = await resolveWorker(req, res);
    if (!worker) return;

    const result = await query(
      `SELECT t.*, e.status AS escrow_status, e.squad_va_number, e.funded_at, e.released_to_worker_at
       FROM tasks t
       LEFT JOIN escrow_accounts e ON e.task_id = t.id
       WHERE t.id = $1 AND t.assigned_worker_id = $2`,
      [req.params.id, worker.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or not assigned to you' });
    }

    return res.json(result.rows[0]);
  } catch (err: any) {
    console.error('[WorkerProfile] Error fetching task:', err.message);
    return res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// ─── POST /api/v1/worker-profile/me/tasks/:id/request-release ────────────────
// Worker requests fund release when they feel AI has unfairly rejected work
router.post('/me/tasks/:id/request-release', async (req: Request, res: Response) => {
  try {
    const worker = await resolveWorker(req, res);
    if (!worker) return;

    const { id } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Please provide a reason for requesting fund release' });
    }

    // Get the task
    const taskResult = await query(
      `SELECT * FROM tasks WHERE id = $1 AND assigned_worker_id = $2`,
      [id, worker.id]
    );

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found or not assigned to you' });
    }

    const task = taskResult.rows[0];

    // Only allow release requests when AI has flagged the work
    const validStatuses = ['flagged_for_dispute', 'verified'];
    if (!validStatuses.includes(task.status)) {
      return res.status(400).json({
        error: `Cannot request release for task in '${task.status}' state. Task must be flagged or verified by AI.`,
        current_status: task.status,
        valid_statuses: validStatuses,
      });
    }

    // Update task status to pending_release_of_funds
    const updateResult = await query(
      `UPDATE tasks 
       SET status = 'pending_release_of_funds', updated_at = NOW() 
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    // Create a log entry (optional but recommended)
    await query(
      `INSERT INTO dispute_logs (task_id, filed_by, reason, status)
       VALUES ($1, $2, $3, 'open')`,
      [id, req.user!.id, `Worker request for fund release - AI rejection concern: ${reason}`]
    );

    await auditLog(req.user!.id, 'worker', 'request_fund_release', 'tasks', parseInt(id), {
      reason,
    });

    return res.json({
      message: 'Fund release request submitted. An admin will review your case within 48 hours.',
      task: updateResult.rows[0],
      status: 'pending_release_of_funds',
      next_steps: [
        'An admin will review your AI verification results',
        'If the review supports your case, funds will be released',
        'You will receive a notification of the decision'
      ]
    });
  } catch (err: any) {
    console.error('[WorkerProfile] Error requesting fund release:', err.message);
    return res.status(500).json({ error: 'Failed to request fund release' });
  }
});

export default router;
