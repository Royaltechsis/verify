import { Router, Request, Response } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { WalletService } from '../services/wallet-service';
import { createSquadEscrow } from '../services/squad-service';
import { query } from '../db/pool';

const router = Router();

// Get wallet balance
router.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role as 'buyer' | 'worker';
    
    const wallet = await WalletService.getWallet(userId, userRole);
    res.json(wallet);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch wallet', details: errorMessage });
  }
});

// Get earning reports / history
router.get('/transactions', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role as 'buyer' | 'worker';
    
    const transactions = await WalletService.getTransactionHistory(userId, userRole);
    res.json(transactions);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: 'Failed to fetch transactions', details: errorMessage });
  }
});

// Assign static virtual account to wallet
router.post('/virtual-account', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role as 'buyer' | 'worker';
    
    const wallet = await WalletService.getWallet(userId, userRole);
    
    if (wallet.squad_va_number) {
      return res.status(400).json({ error: 'Wallet already has a virtual account' });
    }

    // Call squad service to generate VA for this user via email
    // Since SquadService relies on task id, we might abstract it in production.
    // For now we'll mock or generate one directly.
    const va = await createSquadEscrow(
      wallet.id, 
      1000 // min amount config
    );
    
    await query(
      `UPDATE wallets SET squad_va_number = $1, squad_bank_code = $2, updated_at = NOW() WHERE id = $3`,
      [va.squad_va_number, '000', wallet.id]
    );
    
    return res.json({ success: true, virtualAccount: va.squad_va_number });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(500).json({ error: 'Failed to generate virtual account', details: errorMessage });
  }
});

// Process payout / withdrawal
router.post('/withdraw', authenticate, async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role as 'buyer' | 'worker';
    const { amount, bankCode, bankAccountNumber, bankName } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    const wallet = await WalletService.processWithdrawal(userId, userRole, amount, {
      bankCode, bankAccountNumber, bankName
    });
    
    return res.json({ success: true, wallet, message: 'Withdrawal processing' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: 'Withdrawal failed', details: errorMessage });
  }
});

// Admin: Manually deposit funds to wallet (dev/testing when Squad is down)
router.post('/deposit', authenticate, requireRole('admin'), async (req: Request, res: Response): Promise<any> => {
  try {
    const { wallet_id, amount, reference } = req.body;
    
    if (!wallet_id || !amount || amount <= 0) {
      return res.status(400).json({ error: 'wallet_id and amount (> 0) are required' });
    }
    
    const ref = reference || `MANUAL_DEPOSIT_${Date.now()}`;
    const updatedWallet = await WalletService.fundWallet(wallet_id, amount, ref);
    
    return res.json({ 
      success: true, 
      wallet: updatedWallet, 
      message: `Deposited ₦${amount} to wallet ${wallet_id}` 
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return res.status(400).json({ error: 'Deposit failed', details: errorMessage });
  }
});

export default router;