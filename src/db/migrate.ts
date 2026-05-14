import { query } from './pool';

async function runMigrations(): Promise<void> {
  try {
    console.log('[Migrate] Running migrations...');

    // ─── Users / Auth table (admins, buyers/hirers, workers) ────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'buyer'
          CHECK (role IN ('admin', 'buyer', 'worker')),
        full_name VARCHAR(100),
        phone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        worker_id INTEGER REFERENCES workers(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ─── Add dispute-window columns and new multi-worker columns to tasks ─────────────────────────────────
    // verified_at already exists; we add the 24-hour window expiry
    await query(`
      ALTER TABLE tasks
        ADD COLUMN IF NOT EXISTS dispute_window_expires TIMESTAMP,
        ADD COLUMN IF NOT EXISTS buyer_released_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS buyer_user_id INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS dispute_reason TEXT,
        ADD COLUMN IF NOT EXISTS admin_resolution TEXT,
        ADD COLUMN IF NOT EXISTS admin_resolved_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS admin_resolved_by INTEGER REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS shortlisted_workers JSONB,
        ADD COLUMN IF NOT EXISTS selected_worker_id INTEGER REFERENCES workers(id),
        ADD COLUMN IF NOT EXISTS buyer_confirmed BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS worker_confirmed BOOLEAN DEFAULT false
    `);

    // ─── Dispute logs table ───────────────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS dispute_logs (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        filed_by INTEGER REFERENCES users(id),
        reason TEXT NOT NULL,
        evidence_urls TEXT[],
        status VARCHAR(30) DEFAULT 'open'
          CHECK (status IN ('open', 'resolved_worker', 'resolved_buyer', 'escalated')),
        resolution_note TEXT,
        resolved_by INTEGER REFERENCES users(id),
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ─── Audit / activity log ────────────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        actor_id INTEGER REFERENCES users(id),
        actor_role VARCHAR(20),
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50),
        entity_id INTEGER,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ─── Task applications ───────────────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS task_applications (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        worker_id INTEGER NOT NULL REFERENCES workers(id),
        proposed_price DECIMAL(15, 2) NOT NULL,
        message TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(task_id, worker_id)
      )
    `);

    // ─── Decision synthesis logs (already referenced in server.ts) ──────────
    await query(`
      CREATE TABLE IF NOT EXISTS decision_synthesis_logs (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES tasks(id),
        stage VARCHAR(50),
        decision VARCHAR(50),
        confidence DECIMAL(5,2),
        reasoning TEXT,
        raw_response JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ─── Transfer logs (referenced in squad-service) ─────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS transfer_logs (
        id SERIAL PRIMARY KEY,
        squad_reference VARCHAR(100),
        status VARCHAR(50),
        error_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ─── Worker tier column ───────────────────────────────────────────────────
    await query(`
      ALTER TABLE workers
        ADD COLUMN IF NOT EXISTS tier VARCHAR(20) NOT NULL DEFAULT 'normal'
          CHECK (tier IN ('normal', 'verified'))
    `);

    // ─── Worker KYC table ─────────────────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS worker_kyc (
        id SERIAL PRIMARY KEY,
        worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
        nin_hash VARCHAR(64) NOT NULL,
        bvn_hash VARCHAR(64) NOT NULL,
        address_line1 VARCHAR(255) NOT NULL,
        address_line2 VARCHAR(255),
        city VARCHAR(100) NOT NULL,
        state VARCHAR(100) NOT NULL,
        country VARCHAR(100) NOT NULL DEFAULT 'Nigeria',
        nin_submitted BOOLEAN DEFAULT false,
        bvn_submitted BOOLEAN DEFAULT false,
        address_submitted BOOLEAN DEFAULT false,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected')),
        submitted_at TIMESTAMP DEFAULT NOW(),
        reviewed_at TIMESTAMP,
        reviewed_by INTEGER REFERENCES users(id),
        rejection_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ─── Worker loans table ───────────────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS worker_loans (
        id SERIAL PRIMARY KEY,
        worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
        amount_naira NUMERIC(12,2) NOT NULL,
        purpose TEXT NOT NULL,
        repayment_months INTEGER NOT NULL DEFAULT 6,
        credit_score_at_application INTEGER,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'approved', 'rejected', 'disbursed', 'repaid', 'defaulted')),
        approved_by INTEGER REFERENCES users(id),
        approved_at TIMESTAMP,
        disbursed_at TIMESTAMP,
        repaid_at TIMESTAMP,
        rejection_reason TEXT,
        admin_note TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // ─── Worker insurance table ───────────────────────────────────────────────
    await query(`
      CREATE TABLE IF NOT EXISTS worker_insurance (
        id SERIAL PRIMARY KEY,
        worker_id INTEGER NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
        insurance_type VARCHAR(30) NOT NULL
          CHECK (insurance_type IN ('health', 'income_protection', 'accident')),
        coverage_amount_naira NUMERIC(12,2),
        credit_score_at_application INTEGER,
        status VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'active', 'rejected', 'cancelled', 'expired')),
        approved_by INTEGER REFERENCES users(id),
        approved_at TIMESTAMP,
        expires_at TIMESTAMP,
        rejection_reason TEXT,
        admin_note TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('[Migrate] All migrations applied successfully');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Migrate] Migration error:', msg);
    throw error;
  }
}

runMigrations()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));

export { runMigrations };
