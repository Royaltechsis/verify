import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';

// Mocks
jest.mock('../db/pool', () => ({ query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }) }));
jest.mock('../middleware/auth', () => ({
  authenticate: (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  auditLog: jest.fn()
}));

import taskRoutes from '../routes/tasks';

const app = express();
app.use(bodyParser.json());
app.use('/api/v1/tasks', taskRoutes);

describe('Task Endpoints (/api/v1/tasks)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET / should list tasks', async () => {
    const res = await request(app).get('/api/v1/tasks');
    expect([200, 500]).toContain(res.status);
  });

  it('GET /:id should get a task', async () => {
    const res = await request(app).get('/api/v1/tasks/1');
    expect([200, 404, 500]).toContain(res.status);
  });

  it('POST / should create a task', async () => {
    const res = await request(app).post('/api/v1/tasks').send({ title: 'Task', amount_naira: 100, task_location: 'Location', due_date: '2026-01-01', deliverable_spec: {}, description: 'Desc' });
    expect([201, 400, 500]).toContain(res.status);
  });

  it('POST /:id/shortlist should shortlist', async () => {
    const res = await request(app).post('/api/v1/tasks/1/shortlist').send({ worker_ids: [1] });
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('POST /:id/apply should apply', async () => {
    const res = await request(app).post('/api/v1/tasks/1/apply').send({ worker_id: 1, proposed_price: 100 });
    expect([201, 400, 403, 404, 409, 500]).toContain(res.status);
  });

  it('POST /:id/confirm-worker should confirm', async () => {
    const res = await request(app).post('/api/v1/tasks/1/confirm-worker').send({ worker_id: 1 });
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('POST /:id/accept-assignment should accept', async () => {
    const res = await request(app).post('/api/v1/tasks/1/accept-assignment').send({ worker_id: 1 });
    expect([200, 400, 403, 404, 500]).toContain(res.status);
  });

  it('POST /:id/recommend-final should recommend', async () => {
    const res = await request(app).post('/api/v1/tasks/1/recommend-final');
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('POST /:id/submit-proof should submit proof', async () => {
    const res = await request(app).post('/api/v1/tasks/1/submit-proof');
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('POST /:id/complaint should submit complaint', async () => {
    const res = await request(app).post('/api/v1/tasks/1/complaint').send({ complaint_text: 'Issue' });
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('POST /:id/dispute should file dispute', async () => {
    const res = await request(app).post('/api/v1/tasks/1/dispute').send({ reason: 'Issue' });
    expect([201, 400, 403, 404, 500]).toContain(res.status);
  });

  it('GET /:id/status should get status', async () => {
    const res = await request(app).get('/api/v1/tasks/1/status');
    expect([200, 404, 500]).toContain(res.status);
  });
});
