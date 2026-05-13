import { query } from '../db/pool';

async function migrate(): Promise<void> {
  try {
    console.log('[Migration] Starting database migrations...');
    await query(`CREATE TABLE IF NOT EXISTS squad_webhook_logs (id SERIAL PRIMARY KEY, event_type VARCHAR(100) NOT NULL, payload JSONB NOT NULL, status VARCHAR(50) DEFAULT 'processed', created_at TIMESTAMP DEFAULT NOW())`);
    await query(`CREATE TABLE IF NOT EXISTS transfer_logs (id SERIAL PRIMARY KEY, squad_reference VARCHAR(100) UNIQUE, status VARCHAR(50), error_reason TEXT, created_at TIMESTAMP DEFAULT NOW())`);
    await query(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ai_verification_result JSONB`);
    await query(`ALTER TABLE workers ADD COLUMN IF NOT EXISTS economic_profile JSONB DEFAULT '{}'::jsonb, ADD COLUMN IF NOT EXISTS financial_profile JSONB DEFAULT '{}'::jsonb`);
    await query(`CREATE TABLE IF NOT EXISTS learning_weights (id SERIAL PRIMARY KEY, success_weight DECIMAL(10, 4) DEFAULT 1.0, dispute_penalty DECIMAL(10, 4) DEFAULT 1.0, last_updated TIMESTAMP DEFAULT NOW())`);
    const lwCheck = await query('SELECT COUNT(*) FROM learning_weights');
    if (parseInt(lwCheck.rows[0].count) === 0) { await query(`INSERT INTO learning_weights (success_weight, dispute_penalty) VALUES (1.0, 1.0)`); }
    
    // Extend decision_synthesis_logs to include snapshots
    await query(`
      ALTER TABLE decision_synthesis_logs 
        ADD COLUMN IF NOT EXISTS credit_score_snapshot INTEGER,
        ADD COLUMN IF NOT EXISTS economic_profile_snapshot JSONB
    `);
    
    console.log('[Migration] All migrations completed successfully');
  } catch (error) {
    throw error;
  }
}

migrate().then(() => { process.exit(0); }).catch((_error) => { process.exit(1); });
