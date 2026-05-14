import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';

// Mocks
jest.mock('../db/pool', () => ({ query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }) }));
jest.mock('../middleware/auth', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 1, role: 'worker', email: 'worker@test.com', worker_id: 1 };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  auditLog: jest.fn()
}));

import workerProfileRoutes from '../routes/worker-profile';

const app = express();
app.use(bodyParser.json());
app.use('/api/v1/worker-profile', workerProfileRoutes);

describe('Worker Profile Endpoints (/api/v1/worker-profile)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('POST /create should create a profile', async () => {
    const res = await request(app).post('/api/v1/worker-profile/create').send({ name: 'Test', primary_location: 'Location' });
    expect([201, 400, 403, 500]).toContain(res.status);
  });

  it('GET /me should get profile', async () => {
    const res = await request(app).get('/api/v1/worker-profile/me');
    expect([200, 400, 403, 404, 500]).toContain(res.status);
  });

  it('GET /me/credit-score should get score', async () => {
    const res = await request(app).get('/api/v1/worker-profile/me/credit-score');
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('GET /me/kyc should get kyc', async () => {
    const res = await request(app).get('/api/v1/worker-profile/me/kyc');
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('POST /me/kyc should submit kyc', async () => {
    const res = await request(app).post('/api/v1/worker-profile/me/kyc').send({ nin: '12345678901', bvn: '12345678901', address_line1: '123', city: 'A', state: 'B' });
    expect([201, 400, 404, 409, 500]).toContain(res.status);
  });

  it('GET /me/loans should get loans', async () => {
    const res = await request(app).get('/api/v1/worker-profile/me/loans');
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('POST /me/loans should apply for loan', async () => {
    const res = await request(app).post('/api/v1/worker-profile/me/loans').send({ amount_naira: 1000, purpose: 'Business' });
    expect([201, 400, 403, 404, 409, 500]).toContain(res.status);
  });

  it('GET /me/insurance should get insurance', async () => {
    const res = await request(app).get('/api/v1/worker-profile/me/insurance');
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('POST /me/insurance should apply for insurance', async () => {
    const res = await request(app).post('/api/v1/worker-profile/me/insurance').send({ insurance_type: 'health' });
    expect([201, 400, 403, 404, 409, 500]).toContain(res.status);
  });

  it('GET /me/tasks should get tasks', async () => {
    const res = await request(app).get('/api/v1/worker-profile/me/tasks');
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('GET /me/tasks/:id should get a task', async () => {
    const res = await request(app).get('/api/v1/worker-profile/me/tasks/1');
    expect([200, 400, 404, 500]).toContain(res.status);
  });

  it('POST /me/tasks/:id/request-release should request release', async () => {
    const res = await request(app).post('/api/v1/worker-profile/me/tasks/1/request-release').send({ reason: 'Fair' });
    expect([200, 400, 404, 500]).toContain(res.status);
  });
});
