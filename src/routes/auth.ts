import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/pool';
import { signToken, auditLog } from '../middleware/auth';

const router = Router();

/**
 * POST /api/v1/auth/register
 * Register a new buyer or worker account.
 * Body: { email, password, full_name, phone, role: 'buyer'|'worker', worker_id? }
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, full_name, phone, role = 'buyer', worker_id } = req.body;

    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'email, password, and full_name are required' });
    }

    if (!['buyer', 'worker', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'role must be "buyer" or "worker"' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 12);

    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, phone, role, worker_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, full_name, phone, role, worker_id, created_at`,
      [email, password_hash, full_name, phone || null, role, worker_id || null]
    );

    const user = result.rows[0];
    const token = signToken({ id: user.id, email: user.email, role: user.role, worker_id: user.worker_id });

    await auditLog(user.id, user.role, 'register', 'users', user.id, { email });

    return res.status(201).json({ user, token });
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error('[Auth] Register error:', error.message);
    return res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/v1/auth/login
 * Body: { email, password }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const result = await query(
      'SELECT id, email, password_hash, full_name, role, worker_id, is_active FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken({ id: user.id, email: user.email, role: user.role, worker_id: user.worker_id });

    await auditLog(user.id, user.role, 'login', 'users', user.id, {});

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        worker_id: user.worker_id,
      },
    });
  } catch (error: any) {
    console.error('[Auth] Login error:', error.message);
    return res.status(500).json({ error: 'Login failed' });
  }
});

/**
 * POST /api/v1/auth/admin/create
 * Internal: create an admin user (only callable by existing admins — guarded by RBAC in server.ts)
 */
router.post('/admin/create', async (req: Request, res: Response) => {
  try {
    const { email, password, full_name } = req.body;
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'email, password, and full_name are required' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const result = await query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'admin')
       RETURNING id, email, full_name, role, created_at`,
      [email, password_hash, full_name]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error: any) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error('[Auth] Admin create error:', error.message);
    return res.status(500).json({ error: 'Failed to create admin' });
  }
});

export default router;
