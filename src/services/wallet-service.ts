import { query } from '../db/pool';

export class WalletService {
  /**
   * Initialize a wallet for a user if they don't have one
   */
  static async initializeWallet(userId: number, userType: 'buyer' | 'worker') {
    const existing = await query('SELECT * FROM wallets WHERE owner_id = $1 AND owner_type = $2', [userId, userType]);
    
    if (existing.rows.length > 0) {
      return existing.rows[0];
    }
    
    // Create new wallet
    const result = await query(
      `INSERT INTO wallets (owner_id, owner_type) VALUES ($1, $2) RETURNING *`,
      [userId, userType]
    );
    
    return result.rows[0];
  }

  /**
   * Get wallet balance
   */
  static async getWallet(userId: number, userType: 'buyer' | 'worker') {
    const result = await query('SELECT * FROM wallets WHERE owner_id = $1 AND owner_type = $2', [userId, userType]);
    return result.rows[0] || await this.initializeWallet(userId, userType);
  }

  /**
   * Fund wallet
   */
  static async fundWallet(walletId: number, amount: number, reference: string) {
    // Start transaction
    await query('BEGIN');
    try {
      // Update balance
      const updateResult = await query(
        `UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [amount, walletId]
      );
      
      // Log transaction
      await query(
        `INSERT INTO wallet_transactions (wallet_id, type, amount, reference) VALUES ($1, 'deposit', $2, $3)`,
        [walletId, amount, reference]
      );
      
      await query('COMMIT');
      return updateResult.rows[0];
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Lock funds in escrow for a task
   */
  static async lockFundsForTask(userId: number, userType: 'buyer' | 'worker', amount: number, taskId: number) {
    await query('BEGIN');
    try {
      const wallet = await this.getWallet(userId, userType);
      
      if (wallet.balance < amount) {
        throw new Error('Insufficient wallet balance to fund this task');
      }
      
      const reference = `ESCROW_LOCK_${taskId}_${Date.now()}`;
      
      // Deduct balance, add to locked_balance
      const updateResult = await query(
        `UPDATE wallets 
         SET balance = balance - $1, locked_balance = locked_balance + $1, updated_at = NOW() 
         WHERE id = $2 RETURNING *`,
        [amount, wallet.id]
      );
      
      // Log transaction
      await query(
        `INSERT INTO wallet_transactions (wallet_id, type, amount, reference, task_id) 
         VALUES ($1, 'escrow_lock', $2, $3, $4)`,
        [wallet.id, amount, reference, taskId]
      );
      
      await query('COMMIT');
      return updateResult.rows[0];
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Release escrowed funds to a worker after task approval
   */
  static async releaseEscrowToWorker(buyerId: number, workerId: number, amount: number, taskId: number) {
    await query('BEGIN');
    try {
      const buyerWallet = await this.getWallet(buyerId, 'buyer');
      const workerWallet = await this.getWallet(workerId, 'worker');
      
      if (buyerWallet.locked_balance < amount) {
        throw new Error('Insufficient locked balance to release');
      }
      
      const releaseRef = `ESCROW_RELEASE_${taskId}_${Date.now()}`;
      const earningRef = `EARNING_${taskId}_${Date.now()}`;
      
      // Deduct locked balance from buyer
      await query(
        `UPDATE wallets 
         SET locked_balance = locked_balance - $1, updated_at = NOW() 
         WHERE id = $2`,
        [amount, buyerWallet.id]
      );
      
      // Add balance to worker
      await query(
        `UPDATE wallets 
         SET balance = balance + $1, updated_at = NOW() 
         WHERE id = $2`,
        [amount, workerWallet.id]
      );
      
      // Log buyer transaction
      await query(
        `INSERT INTO wallet_transactions (wallet_id, type, amount, reference, task_id) 
         VALUES ($1, 'escrow_release', $2, $3, $4)`,
        [buyerWallet.id, -amount, releaseRef, taskId]
      );
      
      // Log worker transaction
      await query(
        `INSERT INTO wallet_transactions (wallet_id, type, amount, reference, task_id) 
         VALUES ($1, 'earning', $2, $3, $4)`,
        [workerWallet.id, amount, earningRef, taskId]
      );
      
      await query('COMMIT');
      return true;
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Request withdrawal (payout)
   */
  static async processWithdrawal(userId: number, userType: 'buyer' | 'worker', amount: number, _bankDetails?: any) {
    await query('BEGIN');
    try {
      const wallet = await this.getWallet(userId, userType);
      
      if (wallet.balance < amount) {
        throw new Error('Insufficient wallet balance');
      }
      
      const reference = `WITHDRAWAL_${Date.now()}`;
      
      // Update balance
      const updateResult = await query(
        `UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
        [amount, wallet.id]
      );
      
      // Log transaction
      await query(
        `INSERT INTO wallet_transactions (wallet_id, type, amount, reference) VALUES ($1, 'withdrawal', $2, $3)`,
        [wallet.id, -amount, reference]
      );
      
      await query('COMMIT');
      return updateResult.rows[0];
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Get transaction history with earning reports
   */
  static async getTransactionHistory(userId: number, userType: 'buyer' | 'worker') {
    const wallet = await this.getWallet(userId, userType);
    
    const result = await query(
      `SELECT * FROM wallet_transactions WHERE wallet_id = $1 ORDER BY created_at DESC`,
      [wallet.id]
    );
    
    return result.rows;
  }
}
