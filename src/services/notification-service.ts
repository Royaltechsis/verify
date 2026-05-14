import { query } from '../db/pool';

export class NotificationService {
  /**
   * Create a notification for a specific user
   */
  static async createNotification(
    userId: number,
    title: string,
    message: string,
    type: 'task_update' | 'system_alert' | 'escrow_update' | 'kyc_update' = 'task_update',
    metadata: any = {}
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO notifications (user_id, title, message, type, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, title, message, type, JSON.stringify(metadata)]
      );
    } catch (error) {
      console.error('[NotificationService] Error creating notification:', error);
    }
  }

  /**
   * Create a notification for a specific worker using their worker_id
   */
  static async notifyWorker(
    workerId: number,
    title: string,
    message: string,
    type: 'task_update' | 'system_alert' | 'escrow_update' | 'kyc_update' = 'task_update',
    metadata: any = {}
  ): Promise<void> {
    try {
      const userResult = await query('SELECT id FROM users WHERE worker_id = $1', [workerId]);
      if (userResult.rows.length > 0) {
        await this.createNotification(userResult.rows[0].id, title, message, type, metadata);
      }
    } catch (error) {
      console.error('[NotificationService] Error notifying worker:', error);
    }
  }

  /**
   * Broadcast a notification to all users or a specific role
   */
  static async broadcastNotification(
    title: string,
    message: string,
    targetRole?: 'buyer' | 'worker' | 'admin' | 'all'
  ): Promise<void> {
    try {
      // If targetRole is 'all' or undefined, target_role is NULL (meaning everyone)
      const role = targetRole === 'all' ? null : targetRole;
      
      await query(
        `INSERT INTO notifications (user_id, title, message, type, target_role)
         VALUES (NULL, $1, $2, 'broadcast', $3)`,
        [title, message, role]
      );
    } catch (error) {
      console.error('[NotificationService] Error broadcasting notification:', error);
    }
  }

  /**
   * Get notifications for a user, including relevant broadcasts
   */
  static async getUserNotifications(userId: number, userRole: string, limit = 50, offset = 0) {
    try {
      const result = await query(
        `SELECT * FROM notifications 
         WHERE user_id = $1 
            OR (user_id IS NULL AND (target_role IS NULL OR target_role = $2))
         ORDER BY created_at DESC
         LIMIT $3 OFFSET $4`,
        [userId, userRole, limit, offset]
      );
      return result.rows;
    } catch (error) {
      console.error('[NotificationService] Error fetching notifications:', error);
      throw error;
    }
  }

  /**
   * Mark a notification as read
   */
  static async markAsRead(notificationId: number, userId: number): Promise<void> {
    try {
      await query(
        `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
        [notificationId, userId]
      );
    } catch (error) {
      console.error('[NotificationService] Error marking notification as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userId: number): Promise<void> {
    try {
      await query(
        `UPDATE notifications SET is_read = TRUE WHERE user_id = $1`,
        [userId]
      );
    } catch (error) {
      console.error('[NotificationService] Error marking all notifications as read:', error);
      throw error;
    }
  }
}
