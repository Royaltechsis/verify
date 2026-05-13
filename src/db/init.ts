import { query } from './pool';

async function initializeDatabase(): Promise<void> {
  try {
    console.log('[DB] Creating tables...');

    // Workers table
    await query(`
      CREATE TABLE IF NOT EXISTS workers (
        id SERIAL PRIMARY KEY,
        external_id VARCHAR(50) UNIQUE,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20),
        avatar_url VARCHAR(255),
        skills TEXT[],
        bio TEXT,
        primary_location VARCHAR(200),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        trust_score INTEGER DEFAULT 500,
        tasks_completed INTEGER DEFAULT 0,
        tasks_successful INTEGER DEFAULT 0,
        on_time_rate DECIMAL(5, 2) DEFAULT 0,
        avg_rating DECIMAL(3, 2) DEFAULT 0,
        total_earnings DECIMAL(15, 2) DEFAULT 0,
        current_month_earnings DECIMAL(15, 2) DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tasks table
    await query(`
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        task_uuid VARCHAR(50) UNIQUE NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        client_name VARCHAR(100),
        client_email VARCHAR(100),
        required_skills TEXT[],
        amount_naira DECIMAL(15, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'posted',
        task_location VARCHAR(200) NOT NULL,
        location_latitude DECIMAL(10, 8),
        location_longitude DECIMAL(11, 8),
        due_date TIMESTAMP NOT NULL,
        deliverable_spec JSONB NOT NULL,
        assigned_worker_id INTEGER REFERENCES workers(id),
        assigned_at TIMESTAMP,
        proof_submission JSONB,
        submitted_at TIMESTAMP,
        ai_verification_result JSONB,
        verified_at TIMESTAMP,
        squad_va_account_number VARCHAR(20),
        squad_payment_ref VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Escrow accounts table
    await query(`
      CREATE TABLE IF NOT EXISTS escrow_accounts (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        squad_va_number VARCHAR(20) UNIQUE NOT NULL,
        squad_bank_code VARCHAR(10),
        squad_bank_name VARCHAR(100),
        amount_naira DECIMAL(15, 2) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        funded_at TIMESTAMP,
        released_to_worker_at TIMESTAMP,
        refunded_to_client_at TIMESTAMP,
        last_squad_event VARCHAR(100),
        last_squad_event_at TIMESTAMP,
        squad_webhook_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Task history table
    await query(`
      CREATE TABLE IF NOT EXISTS task_history (
        id SERIAL PRIMARY KEY,
        worker_id INTEGER NOT NULL REFERENCES workers(id),
        task_id INTEGER NOT NULL REFERENCES tasks(id),
        status VARCHAR(50),
        rating_by_client DECIMAL(3, 2),
        feedback_text TEXT,
        earned_naira DECIMAL(15, 2),
        bonus_for_on_time DECIMAL(15, 2) DEFAULT 0,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('[DB] All tables created successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[DB] Error initializing database:', errorMessage);
    throw error;
  }
}

export { initializeDatabase };
