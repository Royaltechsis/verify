import { query } from '../db/pool';

async function migrate(): Promise<void> {
  try {
    console.log('[Migration] Starting database migrations...');

    // Create squad_webhook_logs table
    await query(`
      CREATE TABLE IF NOT EXISTS squad_webhook_logs (
        id SERIAL PRIMARY KEY,
        event_type VARCHAR(100) NOT NULL,
        payload JSONB NOT NULL,
        status VARCHAR(50) DEFAULT 'processed',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create transfer_logs table
    await query(`
      CREATE TABLE IF NOT EXISTS transfer_logs (
        id SERIAL PRIMARY KEY,
        squad_reference VARCHAR(100) UNIQUE,
        status VARCHAR(50),
        error_reason TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Add additional columns to tasks if they don't exist
    await query(`
      ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ai_verification_result JSONB
    `);

    console.log('[Migration] All migrations completed successfully');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Migration] Error running migrations:', errorMessage);
    throw error;
  }
}

migrate().then(() => {
  console.log('[Migration] Migration script completed');
  process.exit(0);
}).catch((error) => {
  console.error('[Migration] Migration script failed:', error);
  process.exit(1);
});
