/**
 * test-ai.ts  —  AI Layer smoke test
 *
 * Runs directly against the database and Gemini API without an HTTP server.
 * Usage:  npx ts-node src/test-ai.ts
 *
 * What it tests:
 *   1. Worker matching  (deterministic engine  →  Gemini synthesizer)
 *   2. Proof verification — PASS case  (good proof + correct GPS)
 *   3. Proof verification — FAIL case  (vague proof + wrong location)
 *   4. Proof verification — FALLBACK   (deliberately broken proof object)
 */

import 'dotenv/config';
import { verifyProofWithAI } from './ai/decisionSynthesizer';
import { getWorkerMatches, verifyTaskCompletion } from './services/ai-matching';
import { query } from './db/pool';

// ─── Colours ────────────────────────────────────────────────────────────────
const G = '\x1b[32m'; // green
const R = '\x1b[31m'; // red
const Y = '\x1b[33m'; // yellow
const B = '\x1b[36m'; // cyan
const W = '\x1b[37m'; // white
const D = '\x1b[2m';  // dim
const X = '\x1b[0m';  // reset

function pass(msg: string) { console.log(`${G}  ✓ PASS${X}  ${msg}`); }
function fail(msg: string) { console.log(`${R}  ✗ FAIL${X}  ${msg}`); }
function info(msg: string) { console.log(`${B}  →${X}  ${msg}`); }
function section(msg: string) { console.log(`\n${Y}━━━ ${msg} ━━━${X}`); }

// ─── Helper: get or insert a seeded task ────────────────────────────────────
async function ensureTestTask(): Promise<number> {
  const existing = await query(
    `SELECT id FROM tasks WHERE title = 'AI Layer Test Task' LIMIT 1`
  );
  if (existing.rows.length > 0) return existing.rows[0].id;

  const res = await query(
    `INSERT INTO tasks
       (task_uuid, title, description, required_skills, amount_naira,
        task_location, location_latitude, location_longitude,
        due_date, deliverable_spec, status)
     VALUES
       (gen_random_uuid(),
        'AI Layer Test Task',
        'Deep-clean a 3-room office, sanitise all surfaces and remove rubbish.',
        ARRAY['cleaning','physical-labor'],
        15000,
        'Akure, Ondo State', 7.2571, 5.1944,
        NOW() + INTERVAL '7 days',
        '{"photos_required": true, "minimum_photos": 3, "report_required": true}'::jsonb,
        'assigned')
     RETURNING id`
  );
  return res.rows[0].id;
}

// ─── Test 1: Worker Matching ─────────────────────────────────────────────────
async function testWorkerMatching(taskId: number) {
  section('Test 1 — Worker Matching (deterministic + Gemini synthesis)');

  const task = {
    id: taskId,
    title: 'AI Layer Test Task',
    description: 'Deep-clean a 3-room office, sanitise all surfaces and remove rubbish.',
    required_skills: ['cleaning', 'physical-labor'],
    task_location: 'Akure, Ondo State',
    location_latitude: 7.2571,
    location_longitude: 5.1944,
    amount_naira: 15000,
    due_date: new Date(Date.now() + 7 * 86400000).toISOString()
  };

  try {
    info('Calling getWorkerMatches() ...');
    const matches = await getWorkerMatches(task, 3);

    if (!Array.isArray(matches) || matches.length === 0) {
      fail('No matches returned — are workers seeded? Run: npm run seed');
      return;
    }

    console.log(`\n${D}  Ranked matches:${X}`);
    matches.forEach((m, i) => {
      console.log(`  ${i + 1}. ${W}${m.name}${X}  score=${m.match_score}  dist=${m.distance_km}km`);
      if (m.recommendation_reason) console.log(`     ${D}${m.recommendation_reason}${X}`);
      if (m.strengths) console.log(`     ${D}Strengths: ${m.strengths.join(', ')}${X}`);
      if (m.risks) console.log(`     ${D}Risks: ${m.risks.join(', ')}${X}`);
    });

    pass(`Returned ${matches.length} ranked matches`);
    const top = matches[0];
    if (top.recommendation_reason?.includes('Fallback') || top.risks?.some(r => r.includes('Fallback'))) {
      console.log(`${Y}  ⚠  AI synthesis fell back to deterministic (check GEMINI_API_KEY)${X}`);
    } else {
      pass('Gemini reasoning present in top match');
    }
  } catch (err) {
    fail(`getWorkerMatches threw: ${err instanceof Error ? err.message : err}`);
  }
}

// ─── Test 2: Verification — PASS ─────────────────────────────────────────────
async function testVerificationPass(taskId: number) {
  section('Test 2 — Proof Verification PASS (good proof + correct GPS)');

  const proof = {
    file_url: 'https://example.com/office-clean-proof.jpg',
    text: 'All 3 rooms cleaned and sanitised. Rubbish removed. 4 photos attached.',
    images: [
      'https://example.com/room1-before.jpg',
      'https://example.com/room1-after.jpg',
      'https://example.com/room2-after.jpg',
      'https://example.com/rubbish-removed.jpg'
    ],
    location: { lat: 7.2571, lng: 5.1944 } // exact task location
  };

  try {
    info('Calling verifyTaskCompletion() with valid proof ...');
    const result = await verifyTaskCompletion(taskId, proof);

    console.log(`\n  verified   : ${result.verified ? G + 'true' + X : R + 'false' + X}`);
    console.log(`  confidence : ${result.confidence}`);
    console.log(`  details    : ${result.details}`);
    if (result.flags?.length) {
      console.log(`  flags      : ${result.flags.join(' | ')}`);
    }

    result.verified
      ? pass('Task correctly verified as PASS')
      : fail('Expected verified=true but got false');

    if (result.confidence >= 70) {
      pass(`Confidence ${result.confidence} ≥ 70`);
    } else {
      fail(`Low confidence: ${result.confidence}`);
    }
  } catch (err) {
    fail(`verifyTaskCompletion threw: ${err instanceof Error ? err.message : err}`);
  }
}

// ─── Test 3: Verification — FAIL ─────────────────────────────────────────────
async function testVerificationFail(taskId: number) {
  section('Test 3 — Proof Verification FAIL (vague proof + wrong location)');

  const proof = {
    text: 'Done',
    location: { lat: 6.5244, lng: 3.3792 } // Lagos — ~100km away from Akure
  };

  try {
    info('Calling verifyTaskCompletion() with weak proof from wrong location ...');
    const result = await verifyTaskCompletion(taskId, proof);

    console.log(`\n  verified   : ${result.verified ? G + 'true' + X : R + 'false' + X}`);
    console.log(`  confidence : ${result.confidence}`);
    console.log(`  details    : ${result.details}`);
    if (result.flags?.length) {
      console.log(`  flags      : ${Y}${result.flags.join(' | ')}${X}`);
    }

    !result.verified
      ? pass('Task correctly rejected (verified=false)')
      : fail('Expected verified=false but got true — AI may be too lenient');
  } catch (err) {
    fail(`verifyTaskCompletion threw: ${err instanceof Error ? err.message : err}`);
  }
}

// ─── Test 4: Gemini API directly ─────────────────────────────────────────────
async function testGeminiDirect() {
  section('Test 4 — Gemini API direct call (verifyProofWithAI)');

  const input = {
    task: {
      title: 'Deliver 10 parcels across town',
      description: 'Pick up parcels from warehouse and deliver to 10 addresses.',
      deliverable_spec: {
        delivery_confirmations_required: 10,
        signature_required: true
      },
      task_location: 'Akure, Ondo State'
    },
    proof: {
      text: 'Delivered all parcels. Got signatures from recipients.',
      images: ['https://example.com/delivery-receipt.jpg']
    },
    deterministicResult: {
      verified: true,
      confidence: 70,
      details: 'Deterministic checks passed.'
    }
  };

  try {
    info('Calling verifyProofWithAI() directly ...');
    const result = await verifyProofWithAI(input);

    console.log(`\n  verified   : ${result.verified ? G + 'true' + X : R + 'false' + X}`);
    console.log(`  confidence : ${result.confidence}`);
    console.log(`  details    : ${result.details}`);
    if (result.flags?.length) {
      console.log(`  flags      : ${result.flags.join(' | ')}`);
    }

    if (result.details.includes('AI synthesis unavailable')) {
      fail('Gemini API call failed — check GEMINI_API_KEY in .env');
    } else {
      pass('Gemini responded with AI-generated verdict');
    }
  } catch (err) {
    fail(`verifyProofWithAI threw: ${err instanceof Error ? err.message : err}`);
  }
}

// ─── Test 5: Audit Log check ─────────────────────────────────────────────────
async function testAuditLog() {
  section('Test 5 — Audit Log (decision_synthesis_logs)');
  try {
    const res = await query(
      `SELECT type, output_data->'recommended_workers'->0->>'worker_id' as worker, output_data->'recommended_workers'->0->>'confidence' as confidence, created_at
       FROM decision_synthesis_logs
       ORDER BY created_at DESC LIMIT 5`
    );
    if (res.rows.length === 0) {
      fail('No audit log entries found — synthesis may not have run yet');
      return;
    }
    console.log(`\n  Last ${res.rows.length} log entries:`);
    res.rows.forEach(r => {
      console.log(`  ${D}[${r.type}]${X}  worker=${r.worker ?? 'N/A'}  conf=${r.confidence ?? 'N/A'}  at=${r.created_at}`);
    });
    pass('Audit log is being written');
  } catch (err) {
    fail(`Audit log query failed: ${err instanceof Error ? err.message : err}`);
  }
}

// ─── Runner ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${B}╔═══════════════════════════════════════╗
║   TaskVerify  AI Layer  Smoke Test    ║
╚═══════════════════════════════════════╝${X}`);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log(`${R}  ✗ GEMINI_API_KEY not set in .env — AI calls will fallback to deterministic${X}\n`);
  } else {
    console.log(`${G}  ✓ GEMINI_API_KEY found${X}  (${apiKey.slice(0, 8)}...)`);
  }

  try {
    const taskId = await ensureTestTask();
    info(`Using test task ID: ${taskId}`);

    await testWorkerMatching(taskId);
    await testVerificationPass(taskId);
    await testVerificationFail(taskId);
    await testGeminiDirect();
    await testAuditLog();

    console.log(`\n${G}━━━ All tests complete ━━━${X}\n`);
  } catch (err) {
    console.error(`\n${R}Fatal error:${X}`, err);
  } finally {
    process.exit(0);
  }
}

main();
