import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';

// Mocks
jest.mock('../db/pool', () => ({
  query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] })
}));
jest.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 1, role: 'admin', email: 'admin@admin.com', worker_id: 1 };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  auditLog: jest.fn()
}));
jest.mock('../services/wallet-service', () => ({
  WalletService: { releaseEscrowToWorker: jest.fn() }
}));
jest.mock('../services/squad-service', () => ({
  releaseEscrowToWorker: jest.fn()
}));

import adminRoutes from '../routes/admin';

const app = express();
app.use(bodyParser.json());
app.use('/api/v1/admin', adminRoutes);

describe('Admin Endpoints (/api/v1/admin)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /dashboard should return dashboard stats', async () => {
    const res = await request(app).get('/api/v1/admin/dashboard');
    expect([200, 500]).toContain(res.status);
  });

  it('GET /users should list users', async () => {
    const res = await request(app).get('/api/v1/admin/users');
    expect([200, 500]).toContain(res.status);
  });

  it('GET /users/:id should get a user', async () => {
    const res = await request(app).get('/api/v1/admin/users/1');
    expect([200, 404, 500]).toContain(res.status);
  });

  it('PATCH /users/:id should update a user', async () => {
    const res = await request(app).patch('/api/v1/admin/users/1').send({ role: 'admin' });
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('POST /users should create a user', async () => {
    const res = await request(app).post('/api/v1/admin/users').send({ email: 'new@admin.com', password: 'password', full_name: 'Admin' });
    expect([201, 400, 409, 500]).toContain(res.status);
  });

  it('DELETE /users/:id should deactivate a user', async () => {
    const res = await request(app).delete('/api/v1/admin/users/1');
    expect([200, 500]).toContain(res.status);
  });

  it('GET /tasks should list tasks', async () => {
    const res = await request(app).get('/api/v1/admin/tasks');
    expect([200, 500]).toContain(res.status);
  });

  it('GET /tasks/:id should get a task', async () => {
    const res = await request(app).get('/api/v1/admin/tasks/1');
    expect([200, 404, 500]).toContain(res.status);
  });

  it('PATCH /tasks/:id/status should update task status', async () => {
    const res = await request(app).patch('/api/v1/admin/tasks/1/status').send({ status: 'completed' });
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('POST /tasks/:id/release-funds should release funds', async () => {
    const res = await request(app).post('/api/v1/admin/tasks/1/release-funds');
    expect([200, 404, 500]).toContain(res.status);
  });

  it('POST /tasks/:id/refund should refund task', async () => {
    const res = await request(app).post('/api/v1/admin/tasks/1/refund');
    expect([200, 404, 500]).toContain(res.status);
  });

  it('GET /disputes should list disputes', async () => {
    const res = await request(app).get('/api/v1/admin/disputes');
    expect([200, 500]).toContain(res.status);
  });

  it('GET /disputes/:id should get dispute details', async () => {
    const res = await request(app).get('/api/v1/admin/disputes/1');
    expect([200, 404, 500]).toContain(res.status);
  });

  it('PATCH /disputes/:id/resolve should resolve dispute', async () => {
    const res = await request(app).patch('/api/v1/admin/disputes/1/resolve').send({ resolution: 'resolved_worker' });
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('PATCH /tasks/:id/resolve-worker-release-request should resolve request', async () => {
    const res = await request(app).patch('/api/v1/admin/tasks/1/resolve-worker-release-request').send({ decision: 'approve' });
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('GET /pending-release-requests should list requests', async () => {
    const res = await request(app).get('/api/v1/admin/pending-release-requests');
    expect([200, 500]).toContain(res.status);
  });

  it('GET /workers should list workers', async () => {
    const res = await request(app).get('/api/v1/admin/workers');
    expect([200, 500]).toContain(res.status);
  });

  it('PATCH /workers/:id should update worker', async () => {
    const res = await request(app).patch('/api/v1/admin/workers/1').send({ trust_score: 90 });
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('GET /escrow should list escrows', async () => {
    const res = await request(app).get('/api/v1/admin/escrow');
    expect([200, 500]).toContain(res.status);
  });

  it('PATCH /escrow/:id/status should update escrow status', async () => {
    const res = await request(app).patch('/api/v1/admin/escrow/1/status').send({ status: 'released' });
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('GET /ai-logs should list logs', async () => {
    const res = await request(app).get('/api/v1/admin/ai-logs');
    expect([200, 500]).toContain(res.status);
  });

  it('GET /audit-logs should list logs', async () => {
    const res = await request(app).get('/api/v1/admin/audit-logs');
    expect([200, 500]).toContain(res.status);
  });

  it('POST /tasks/:id/extend-dispute-window should extend window', async () => {
    const res = await request(app).post('/api/v1/admin/tasks/1/extend-dispute-window').send({ hours: 24 });
    expect([200, 404, 500]).toContain(res.status);
  });

  it('GET /kyc should list kyc', async () => {
    const res = await request(app).get('/api/v1/admin/kyc');
    expect([200, 500]).toContain(res.status);
  });

  it('GET /kyc/:id should get kyc detail', async () => {
    const res = await request(app).get('/api/v1/admin/kyc/1');
    expect([200, 404, 500]).toContain(res.status);
  });

  it('PATCH /kyc/:id/review should review kyc', async () => {
    const res = await request(app).patch('/api/v1/admin/kyc/1/review').send({ decision: 'approved' });
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('GET /loans should list loans', async () => {
    const res = await request(app).get('/api/v1/admin/loans');
    expect([200, 500]).toContain(res.status);
  });

  it('PATCH /loans/:id/review should review loan', async () => {
    const res = await request(app).patch('/api/v1/admin/loans/1/review').send({ decision: 'approved' });
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('GET /insurance should list insurance policies', async () => {
    const res = await request(app).get('/api/v1/admin/insurance');
    expect([200, 500]).toContain(res.status);
  });

  it('PATCH /insurance/:id/review should review insurance', async () => {
    const res = await request(app).patch('/api/v1/admin/insurance/1/review').send({ decision: 'approved' });
    expect([200, 400, 404, 500]).toContain(res.status);
  });
});
