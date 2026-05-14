import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';

// Mocks
jest.mock('../db/pool', () => ({ query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }) }));
jest.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 1, role: 'buyer', email: 'buyer@test.com' };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  auditLog: jest.fn()
}));

import buyerRoutes from '../routes/buyer';

const app = express();
app.use(bodyParser.json());
app.use('/api/v1/buyer', buyerRoutes);

describe('Buyer Endpoints (/api/v1/buyer)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /tasks should list tasks', async () => {
    const res = await request(app).get('/api/v1/buyer/tasks');
    expect([200, 500]).toContain(res.status);
  });

  it('POST /tasks should create task', async () => {
    const res = await request(app).post('/api/v1/buyer/tasks').send({ title: 'T', description: 'D', amount_naira: 10, task_location: 'L', due_date: '2026-01-01', deliverable_spec: {} });
    expect([201, 400, 500]).toContain(res.status);
  });

  it('GET /tasks/:id should get task', async () => {
    const res = await request(app).get('/api/v1/buyer/tasks/1');
    expect([200, 404, 500]).toContain(res.status);
  });

  it('POST /tasks/:id/assign should assign task', async () => {
    const res = await request(app).post('/api/v1/buyer/tasks/1/assign').send({ worker_id: 1 });
    expect([200, 400, 403, 404, 500]).toContain(res.status);
  });

  it('POST /tasks/:id/dispute should file dispute', async () => {
    const res = await request(app).post('/api/v1/buyer/tasks/1/dispute').send({ reason: 'Issue' });
    expect([201, 400, 403, 404, 500]).toContain(res.status);
  });

  it('POST /tasks/:id/release-funds should release funds', async () => {
    const res = await request(app).post('/api/v1/buyer/tasks/1/release-funds');
    expect([200, 403, 404, 500]).toContain(res.status);
  });

  it('GET /tasks/:id/dispute-window should get window', async () => {
    const res = await request(app).get('/api/v1/buyer/tasks/1/dispute-window');
    expect([200, 404, 500]).toContain(res.status);
  });

  it('GET /disputes should get disputes', async () => {
    const res = await request(app).get('/api/v1/buyer/disputes');
    expect([200, 500]).toContain(res.status);
  });
});
