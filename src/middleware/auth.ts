import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool';

const JWT_SECRET = process.env.JWT_SECRET || 'taskverify-super-secret-change-in-production';

export interface AuthUser {
  id: number;
  email: string;
  role: 'admin' | 'buyer' | 'worker';
  worker_id?: number | null;
}

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Verify JWT and attach user to request.
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or malformed Authorization header' });
    }

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, JWT_SECRET) as AuthUser;

    // Optionally refresh from DB to ensure user is still active
    const result = await query(
      'SELECT id, email, role, worker_id, is_active FROM users WHERE id = $1',
      [payload.id]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'User not found or deactivated' });
    }

    req.user = {
      id: result.rows[0].id,
      email: result.rows[0].email,
      role: result.rows[0].role,
      worker_id: result.rows[0].worker_id,
    };

    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

/**
 * Role-based access control middleware.
 * Usage: requireRole('admin') or requireRole('admin', 'buyer')
 */
export const requireRole = (...roles: Array<'admin' | 'buyer' | 'worker'>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden – insufficient privileges',
        required: roles,
        current: req.user.role,
      });
    }

    return next();
  };
};

/**
 * Generate a signed JWT for a user.
 */
export function signToken(user: AuthUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, worker_id: user.worker_id },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * Write an entry to the audit_logs table.
 */
export async function auditLog(
  actorId: number | null,
  actorRole: string | null,
  action: string,
  entityType: string,
  entityId: number | null,
  metadata: object = {}
): Promise<void> {
  try {
    await query(
      `INSERT INTO audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actorId, actorRole, action, entityType, entityId, JSON.stringify(metadata)]
    );
  } catch (_) {
    // Non-fatal – audit failures shouldn't crash the request
  }
}
