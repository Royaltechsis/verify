import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { query } from '../db/pool';

const router = Router();

router.use(authenticate);
router.use(requireRole('buyer', 'worker', 'admin'));

async function resolveUserIdFromWorker(workerId?: number): Promise<number | null> {
  if (!workerId) return null;
  const result = await query('SELECT id FROM users WHERE worker_id = $1', [workerId]);
  return result.rows.length > 0 ? result.rows[0].id : null;
}

async function resolveRecipientUserId(recipientUserId?: number, recipientWorkerId?: number): Promise<number | null> {
  if (recipientUserId) {
    const userResult = await query('SELECT id FROM users WHERE id = $1', [recipientUserId]);
    return userResult.rows.length > 0 ? userResult.rows[0].id : null;
  }

  return resolveUserIdFromWorker(recipientWorkerId);
}

// Send a message
router.post('/', async (req: Request, res: Response) => {
  try {
    const { recipient_user_id, recipient_worker_id, body, message, task_id } = req.body;
    const content = String(body ?? message ?? '').trim();

    if (!content) {
      return res.status(400).json({ error: 'Message body is required' });
    }

    const resolvedRecipientId = await resolveRecipientUserId(
      recipient_user_id ? Number(recipient_user_id) : undefined,
      recipient_worker_id ? Number(recipient_worker_id) : undefined
    );

    if (!resolvedRecipientId) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    if (resolvedRecipientId === req.user!.id) {
      return res.status(400).json({ error: 'You cannot message yourself' });
    }

    const result = await query(
      `INSERT INTO messages (sender_user_id, recipient_user_id, task_id, body)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.user!.id, resolvedRecipientId, task_id || null, content]
    );

    return res.status(201).json({ message: 'Message sent successfully', data: result.rows[0] });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Messages] Error sending message:', errorMessage);
    return res.status(500).json({ error: 'Failed to send message' });
  }
});

// Conversation list / inbox
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT
         m.*,
         CASE WHEN m.sender_user_id = $1 THEN m.recipient_user_id ELSE m.sender_user_id END AS other_user_id,
         u.full_name AS other_user_name,
         u.email AS other_user_email,
         u.role AS other_user_role,
         u.worker_id AS other_worker_id
       FROM messages m
       JOIN users u
         ON u.id = CASE WHEN m.sender_user_id = $1 THEN m.recipient_user_id ELSE m.sender_user_id END
       WHERE m.sender_user_id = $1 OR m.recipient_user_id = $1
       ORDER BY m.created_at DESC`,
      [req.user!.id]
    );

    const conversations = new Map<number, any>();

    for (const row of result.rows) {
      if (!conversations.has(row.other_user_id)) {
        conversations.set(row.other_user_id, {
          other_user_id: row.other_user_id,
          other_user_name: row.other_user_name,
          other_user_email: row.other_user_email,
          other_user_role: row.other_user_role,
          other_worker_id: row.other_worker_id,
          last_message: {
            id: row.id,
            body: row.body,
            sender_user_id: row.sender_user_id,
            recipient_user_id: row.recipient_user_id,
            task_id: row.task_id,
            is_read: row.is_read,
            created_at: row.created_at,
          },
          unread_count: row.sender_user_id === req.user!.id ? 0 : 1,
        });
      } else if (row.sender_user_id !== req.user!.id) {
        const current = conversations.get(row.other_user_id);
        current.unread_count += 1;
      }
    }

    return res.json(Array.from(conversations.values()));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Messages] Error fetching conversations:', errorMessage);
    return res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Message history with one other user or worker profile
router.get('/history', async (req: Request, res: Response) => {
  try {
    const otherUserId = req.query.other_user_id ? Number(req.query.other_user_id) : undefined;
    const otherWorkerId = req.query.other_worker_id ? Number(req.query.other_worker_id) : undefined;

    const resolvedOtherUserId = otherUserId || (await resolveUserIdFromWorker(otherWorkerId));
    if (!resolvedOtherUserId) {
      return res.status(400).json({ error: 'other_user_id or other_worker_id is required' });
    }

    const result = await query(
      `SELECT *
       FROM messages
       WHERE (sender_user_id = $1 AND recipient_user_id = $2)
          OR (sender_user_id = $2 AND recipient_user_id = $1)
       ORDER BY created_at ASC`,
      [req.user!.id, resolvedOtherUserId]
    );

    return res.json(result.rows);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Messages] Error fetching history:', errorMessage);
    return res.status(500).json({ error: 'Failed to fetch message history' });
  }
});

// Mark a conversation as read
router.post('/history/read', async (req: Request, res: Response) => {
  try {
    const { other_user_id, other_worker_id } = req.body;
    const resolvedOtherUserId = other_user_id
      ? Number(other_user_id)
      : await resolveUserIdFromWorker(other_worker_id ? Number(other_worker_id) : undefined);

    if (!resolvedOtherUserId) {
      return res.status(400).json({ error: 'other_user_id or other_worker_id is required' });
    }

    await query(
      `UPDATE messages
       SET is_read = true, read_at = NOW(), updated_at = NOW()
       WHERE sender_user_id = $1 AND recipient_user_id = $2 AND is_read = false`,
      [resolvedOtherUserId, req.user!.id]
    );

    return res.json({ message: 'Conversation marked as read' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Messages] Error marking messages as read:', errorMessage);
    return res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

export default router;