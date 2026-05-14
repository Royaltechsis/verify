import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { NotificationService } from '../services/notification-service';

const router = Router();

// Protect all notification routes
router.use(authenticate);

/**
 * Get user's notifications
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    const notifications = await NotificationService.getUserNotifications(
      req.user!.id,
      req.user!.role,
      limit,
      offset
    );
    
    return res.json(notifications);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

/**
 * Mark a single notification as read
 */
router.post('/:id/read', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await NotificationService.markAsRead(parseInt(id, 10), req.user!.id);
    return res.json({ message: 'Notification marked as read' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

/**
 * Mark all notifications as read
 */
router.post('/read-all', async (req: Request, res: Response) => {
  try {
    await NotificationService.markAllAsRead(req.user!.id);
    return res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

/**
 * ADMIN ONLY: Broadcast a notification to all or a specific group
 */
router.post('/broadcast', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { title, message, targetRole } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }
    
    await NotificationService.broadcastNotification(title, message, targetRole);
    return res.json({ message: 'Broadcast sent successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to send broadcast' });
  }
});

/**
 * ADMIN ONLY: Send a targeted notification to a specific user
 */
router.post('/send', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { userId, title, message, type, metadata } = req.body;
    
    if (!userId || !title || !message) {
      return res.status(400).json({ error: 'User ID, title, and message are required' });
    }
    
    await NotificationService.createNotification(
      parseInt(userId, 10),
      title,
      message,
      type || 'system_alert',
      metadata || {}
    );
    return res.json({ message: 'Notification sent successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to send notification' });
  }
});

export default router;
