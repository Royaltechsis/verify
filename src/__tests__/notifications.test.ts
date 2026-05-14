import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import notificationRoutes from '../routes/notifications';
import { NotificationService } from '../services/notification-service';

import { query } from '../db/pool';

// Mock DB pool
jest.mock('../db/pool', () => ({ 
  query: jest.fn().mockResolvedValue({ rows: [{ id: 1, title: 'Test Notification' }] }) 
}));

// Mock Auth Middleware
jest.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 1, role: 'admin' };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

const app = express();
app.use(bodyParser.json());
app.use('/api/v1/notifications', notificationRoutes);

describe('Notifications Endpoints & Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (query as jest.Mock).mockResolvedValue({ rows: [{ id: 1, title: 'Test Notification' }] });
  });

  describe('Service Logic', () => {
    it('should create a notification', async () => {
      await NotificationService.createNotification(1, 'Title', 'Msg', 'task_update', { id: 1 });
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        [1, 'Title', 'Msg', 'task_update', JSON.stringify({ id: 1 })]
      );
    });

    it('should broadcast a notification', async () => {
      await NotificationService.broadcastNotification('Broadcast', 'Msg', 'worker');
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO notifications'),
        ['Broadcast', 'Msg', 'worker']
      );
    });

    it('should get user notifications', async () => {
      const rows = await NotificationService.getUserNotifications(1, 'worker', 50, 0);
      expect(query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM notifications'),
        [1, 'worker', 50, 0]
      );
      expect(rows).toEqual([{ id: 1, title: 'Test Notification' }]);
    });
  });

  describe('API Routes (/api/v1/notifications)', () => {
    it('GET / should list notifications', async () => {
      const res = await request(app).get('/api/v1/notifications');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /:id/read should mark as read', async () => {
      const res = await request(app).post('/api/v1/notifications/1/read');
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('Notification marked as read');
    });

    it('POST /read-all should mark all as read', async () => {
      const res = await request(app).post('/api/v1/notifications/read-all');
      expect(res.status).toBe(200);
    });

    it('POST /broadcast should send broadcast', async () => {
      const res = await request(app).post('/api/v1/notifications/broadcast').send({
        title: 'Platform Maintenance',
        message: 'Downtime expected',
        targetRole: 'all'
      });
      expect(res.status).toBe(200);
    });

    it('POST /send should send targeted notification', async () => {
      const res = await request(app).post('/api/v1/notifications/send').send({
        userId: 1,
        title: 'Direct Msg',
        message: 'Hello'
      });
      expect(res.status).toBe(200);
    });
  });
});
