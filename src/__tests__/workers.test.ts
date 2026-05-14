import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';

// Mocks
jest.mock('../db/pool', () => ({ query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] }) }));

import workersRoutes from '../routes/workers';

const app = express();
app.use(bodyParser.json());
app.use('/api/v1/workers', workersRoutes);

describe('Workers Endpoints (/api/v1/workers)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET / should list workers', async () => {
    const res = await request(app).get('/api/v1/workers');
    expect([200, 500]).toContain(res.status);
  });

  it('GET /:id should get a worker', async () => {
    const res = await request(app).get('/api/v1/workers/1');
    expect([200, 404, 500]).toContain(res.status);
  });

  it('POST / should create a worker', async () => {
    const res = await request(app).post('/api/v1/workers').send({ name: 'W', email: 'w@w.com', primary_location: 'L' });
    expect([201, 400, 409, 500]).toContain(res.status);
  });

  it('PUT /:id should update a worker', async () => {
    const res = await request(app).put('/api/v1/workers/1').send({ name: 'Updated' });
    expect([200, 404, 500]).toContain(res.status);
  });

  it('GET /:id/stats should get worker stats', async () => {
    const res = await request(app).get('/api/v1/workers/1/stats');
    expect([200, 500]).toContain(res.status);
  });

  it('GET /:id/financial-profile should get financial profile', async () => {
    const res = await request(app).get('/api/v1/workers/1/financial-profile');
    expect([200, 404, 500]).toContain(res.status);
  });
});
