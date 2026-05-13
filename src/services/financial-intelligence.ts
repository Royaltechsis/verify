import { query } from '../db/pool';

/**
 * Calculates a determinisic credit score for a worker.
 * Normalized to 300 - 850 scale.
 */
function calculateCreditScore(trust_score: number, tasks_completed: number, on_time_rate: number, dispute_rate: number, earnings_consistency: number): number {
  let score = 
    (trust_score * 0.4) + 
    (on_time_rate * 100 * 0.2) + 
    (tasks_completed * 0.1) - 
    (dispute_rate * 50) + 
    (earnings_consistency * 0.3);
  
  if (score < 300) score = 300;
  if (score > 850) score = 850;
  
  return Math.round(score);
}

/**
 * Process task outcome, updating worker financial profiles and updating learning weights
 */
export async function processTaskOutcome(workerId: number, isSuccess: boolean, earningsAmount: number = 0) {
  try {
    // 1. Get learning weights
    const lwCheck = await query('SELECT success_weight, dispute_penalty FROM learning_weights ORDER BY id DESC LIMIT 1');
    let successWeight = 1.0;
    let disputePenalty = 1.0;
    if (lwCheck.rows.length > 0) {
      successWeight = parseFloat(lwCheck.rows[0].success_weight);
      disputePenalty = parseFloat(lwCheck.rows[0].dispute_penalty);
    }

    // 2. Fetch worker info
    const workerResult = await query('SELECT * FROM workers WHERE id = $1', [workerId]);
    if (workerResult.rows.length === 0) return;
    const worker = workerResult.rows[0];

    // existing stats
    let { 
      trust_score = 500, 
      tasks_completed = 0, 
      tasks_successful = 0,
      on_time_rate = 0,
      total_earnings = 0
    } = worker;

    tasks_completed = Number(tasks_completed) + 1;
    if (isSuccess) tasks_successful = Number(tasks_successful) + 1;
    total_earnings = Number(total_earnings) + Number(earningsAmount);

    let dispute_rate = tasks_completed > 0 ? (tasks_completed - tasks_successful) / tasks_completed : 0;
    
    // adjust trust score based on weights
    trust_score = isSuccess 
      ? trust_score + (10 * successWeight) 
      : trust_score - (20 * disputePenalty);

    // 3. Update learning loop weights
    if (isSuccess) {
      successWeight += 0.05; // slightly increase
    } else {
      disputePenalty += 0.1; // adjust penalty heavily if disputes happen
    }
    await query('UPDATE learning_weights SET success_weight = $1, dispute_penalty = $2, last_updated = NOW()', [successWeight, disputePenalty]);

    // 4. Update economic profile
    const economic = worker.economic_profile || {
      identity_verified: false,
      verification_sources: [],
      behavioral_score: 50,
      reliability_score: 50,
      earning_pattern: [],
      risk_level: 'medium'
    };

    economic.reliability_score = isSuccess 
      ? Math.min(100, economic.reliability_score + 5) 
      : Math.max(0, economic.reliability_score - 10);
    
    // push earnings pattern (keep last 5)
    economic.earning_pattern.push(Number(earningsAmount));
    if (economic.earning_pattern.length > 5) economic.earning_pattern.shift();
    
    // earnings_consistency logic for credit score (variance, mock simple sum/avg here)
    const earnings_consistency = economic.earning_pattern.reduce((a: number,b: number) => a+b, 0) / (economic.earning_pattern.length || 1);

    economic.risk_level = dispute_rate > 0.3 ? 'high' : (dispute_rate < 0.1 ? 'low' : 'medium');
    economic.behavioral_score = economic.reliability_score; // simplified

    // 5. Update financial profile & calc credit score
    const newCreditScore = calculateCreditScore(trust_score, tasks_completed, Number(on_time_rate), dispute_rate, earnings_consistency);
    
    const financial = worker.financial_profile || {};
    financial.credit_score = newCreditScore;
    
    // 6. Save back to worker
    await query(
      `UPDATE workers 
       SET trust_score = $1, tasks_completed = $2, tasks_successful = $3, total_earnings = $4,
           economic_profile = $5, financial_profile = $6, updated_at = NOW()
       WHERE id = $7`,
      [
        trust_score, tasks_completed, tasks_successful, total_earnings,
        JSON.stringify(economic), JSON.stringify(financial), workerId
      ]
    );

  } catch (error) {
    console.error('[FinancialIntelligence] Error processing task outcome:', error);
  }
}
