import 'dotenv/config';
import { query } from './db/pool';
import axios from 'axios';

// ─── Colours ────────────────────────────────────────────────────────────────
const G = '\x1b[32m'; // green
const R = '\x1b[31m'; // red
const Y = '\x1b[33m'; // yellow
const B = '\x1b[36m'; // cyan
// Removed W and D
const X = '\x1b[0m';  // reset

function pass(msg: string) { console.log(`${G}  ✓ PASS${X}  ${msg}`); }
function fail(msg: string) { console.log(`${R}  ✗ FAIL${X}  ${msg}`); }
function info(msg: string) { console.log(`${B}  →${X}  ${msg}`); }
function section(msg: string) { console.log(`\n${Y}━━━ ${msg} ━━━${X}`); }

const API_URL = 'http://localhost:3001/api/v1';

async function ensureTestData() {
  info('Seeding test data...');
  // Create a worker
  const workerRes = await query(`
    INSERT INTO workers (name, email, skills, primary_location, latitude, longitude, is_active)
    VALUES ('Flow Test Worker 1', 'flow1@test.com', ARRAY['cleaning'], 'Akure', 7.25, 5.19, true)
    ON CONFLICT (email) DO UPDATE SET is_active = true
    RETURNING id
  `);
  
  const workerRes2 = await query(`
    INSERT INTO workers (name, email, skills, primary_location, latitude, longitude, is_active)
    VALUES ('Flow Test Worker 2', 'flow2@test.com', ARRAY['cleaning'], 'Akure', 7.25, 5.19, true)
    ON CONFLICT (email) DO UPDATE SET is_active = true
    RETURNING id
  `);

  const worker1Id = workerRes.rows[0].id;
  const worker2Id = workerRes2.rows[0].id;

  // Create a task
  const taskRes = await query(`
    INSERT INTO tasks (task_uuid, title, description, amount_naira, task_location, due_date, deliverable_spec, status)
    VALUES (gen_random_uuid(), 'Test Task Flow', 'Flow desc', 10000, 'Akure', NOW() + INTERVAL '1 day', '{}'::jsonb, 'open')
    RETURNING id
  `);

  const taskId = taskRes.rows[0].id;

  return { taskId, worker1Id, worker2Id };
}

async function testTaskFlow() {
  let data;
  try {
    data = await ensureTestData();
  } catch (err: any) {
    fail(`Failed to seed data: ${err.message}`);
    return;
  }
  
  const { taskId, worker1Id, worker2Id } = data;

  section('Test 1 — Shortlist Workers');
  try {
    info(`POST /tasks/${taskId}/shortlist`);
    const res = await axios.post(`${API_URL}/tasks/${taskId}/shortlist`, {
      worker_ids: [worker1Id, worker2Id]
    });
    
    if (res.data.task.status === 'shortlisted' && res.data.task.shortlisted_workers.length === 2) {
      pass('Task successfully updated to shortlisted status');
    } else {
      fail('Task status or shortlisted_workers array not updated correctly');
    }
  } catch (err: any) {
    fail(`Endpoint failed: ${err.message}`);
    if (err.response) console.error('Response data:', err.response.data);
  }

  section('Test 2 — Worker Applies');
  try {
    info(`POST /tasks/${taskId}/apply (Worker 1)`);
    const res = await axios.post(`${API_URL}/tasks/${taskId}/apply`, {
      worker_id: worker1Id,
      proposed_price: 10500,
      message: 'I can do this today'
    });
    
    if (res.status === 201 && res.data.application.worker_id === worker1Id) {
      pass('Application submitted successfully');
    } else {
      fail('Failed to submit application');
    }
    
    // Check task status
    const taskStatusRes = await query(`SELECT status FROM tasks WHERE id = $1`, [taskId]);
    if (taskStatusRes.rows[0].status === 'applications_open') {
      pass('Task status correctly transitioned to applications_open');
    } else {
      fail(`Task status is ${taskStatusRes.rows[0].status}, expected applications_open`);
    }

  } catch (err: any) {
    fail(`Endpoint failed: ${err.message}`);
    if (err.response) console.error('Response data:', err.response.data);
  }

  section('Test 3 — Buyer Confirms Worker');
  try {
    info(`POST /tasks/${taskId}/confirm-worker`);
    const res = await axios.post(`${API_URL}/tasks/${taskId}/confirm-worker`, {
      worker_id: worker1Id
    });
    
    if (res.data.task.status === 'selection_in_progress' && res.data.task.buyer_confirmed) {
      pass('Worker properly confirmed by buyer');
    } else {
      fail('Task status or buyer_confirmed flag not updated correctly');
    }
  } catch (err: any) {
    fail(`Endpoint failed: ${err.message}`);
    if (err.response) console.error('Response data:', err.response.data);
  }

  section('Test 4 — Worker Accepts Assignment');
  try {
    info(`POST /tasks/${taskId}/accept-assignment`);
    const res = await axios.post(`${API_URL}/tasks/${taskId}/accept-assignment`, {
      worker_id: worker1Id
    });
    
    if (res.data.task.status === 'assigned' && res.data.task.worker_confirmed) {
      pass('Task properly moved to assigned state');
      
      if (res.data.escrow && res.data.escrow.squad_va_number) {
        pass('Squad escrow successfully created');
      } else {
        fail('Escrow data missing in response');
      }
    } else {
      fail('Task status or worker_confirmed flag not updated correctly');
    }
  } catch (err: any) {
    fail(`Endpoint failed: ${err.message}`);
    if (err.response) console.error('Response data:', err.response.data);
  }

  // Cleanup
  info('Cleaning up test data...');
  try {
    await query(`DELETE FROM escrow_accounts WHERE task_id = $1`, [taskId]);
    await query(`DELETE FROM task_applications WHERE task_id = $1`, [taskId]);
    await query(`DELETE FROM tasks WHERE id = $1`, [taskId]);
  } catch (e) {
    console.error('Cleanup error:', e);
  }

  console.log(`\n${G}━━━ Test Suite Complete ━━━${X}\n`);
  process.exit(0);
}

// Ensure the server is running on port 3001 before executing
setTimeout(() => {
  testTaskFlow();
}, 1000);
