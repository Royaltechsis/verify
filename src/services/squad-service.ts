import axios, { AxiosInstance } from 'axios';
import { query } from '../db/pool';
import crypto from 'crypto';

interface SquadEscrowAccount {
  squad_va_number: string;
  squad_bank_code: string;
  squad_bank_name: string;
}

interface SquadWebhookEvent {
  event_type: string;
  data: any;
  reference: string;
  timestamp: string;
}

const SQUAD_API_KEY = process.env.SQUAD_API_KEY || '';
const SQUAD_WEBHOOK_SECRET = process.env.SQUAD_WEBHOOK_SECRET || '';
const SQUAD_BASE_URL = process.env.SQUAD_BASE_URL || 'https://api.squadco.com';

let squadClient: AxiosInstance;

function initSquadClient(): AxiosInstance {
  if (squadClient) {
    return squadClient;
  }

  squadClient = axios.create({
    baseURL: SQUAD_BASE_URL,
    headers: {
      'Authorization': `Bearer ${SQUAD_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });

  squadClient.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        console.error('[Squad] Unauthorized - check API key');
      }
      console.error('[Squad] API Error:', error.response?.data || error.message);
      throw error;
    }
  );

  return squadClient;
}

async function createSquadEscrow(taskId: number, amount: number): Promise<SquadEscrowAccount> {
  try {
    const client = initSquadClient();

    // Create virtual account for escrow
    const response = await client.post('/virtual-account/create', {
      amount: Math.round(amount), // Squad expects amount in kobo
      customer_identifier: `task_${taskId}`,
      payment_description: `TaskVerify Escrow - Task ${taskId}`
    });

    const escrowData = {
      squad_va_number: response.data.data.virtual_account_number,
      squad_bank_code: response.data.data.bank_code,
      squad_bank_name: response.data.data.bank_name
    };

    // Store escrow account in database
    await query(
      `INSERT INTO escrow_accounts (task_id, squad_va_number, squad_bank_code, squad_bank_name, amount_naira, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [taskId, escrowData.squad_va_number, escrowData.squad_bank_code, escrowData.squad_bank_name, amount]
    );

    console.log(`[Squad] Created escrow account ${escrowData.squad_va_number} for task ${taskId}`);

    return escrowData;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Squad] Error creating escrow account:', errorMessage);
    throw new Error(`Failed to create Squad escrow: ${errorMessage}`);
  }
}

async function releaseEscrowToWorker(escrowId: number, workerId: number): Promise<void> {
  try {
    const client = initSquadClient();

    // Get escrow details
    const escrowResult = await query(
      'SELECT * FROM escrow_accounts WHERE id = $1',
      [escrowId]
    );

    if (escrowResult.rows.length === 0) {
      throw new Error('Escrow account not found');
    }

    const escrow = escrowResult.rows[0];

    // Get worker bank details (this would need to be stored in workers table)
    const workerResult = await query(
      'SELECT * FROM workers WHERE id = $1',
      [workerId]
    );

    if (workerResult.rows.length === 0) {
      throw new Error('Worker not found');
    }

    // Release funds from virtual account to worker's bank
    // This is a simplified version - in production you'd need proper bank details
    await client.post('/virtual-account/fund-transfer', {
      virtual_account_number: escrow.squad_va_number,
      amount: Math.round(escrow.amount_naira),
      narration: `Payment for Task ${escrow.task_id}`
    });

    // Update escrow status
    await query(
      `UPDATE escrow_accounts SET status = 'released', released_to_worker_at = NOW(), last_squad_event = 'released'
       WHERE id = $1`,
      [escrowId]
    );

    console.log(`[Squad] Released escrow ${escrowId} to worker ${workerId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Squad] Error releasing escrow:', errorMessage);
    throw error;
  }
}

async function refundEscrowToClient(escrowId: number): Promise<void> {
  try {
    const client = initSquadClient();

    const escrowResult = await query(
      'SELECT * FROM escrow_accounts WHERE id = $1',
      [escrowId]
    );

    if (escrowResult.rows.length === 0) {
      throw new Error('Escrow account not found');
    }

    const escrow = escrowResult.rows[0];

    // Initiate refund
    await client.post('/virtual-account/refund', {
      virtual_account_number: escrow.squad_va_number,
      amount: Math.round(escrow.amount_naira)
    });

    // Update escrow status
    await query(
      `UPDATE escrow_accounts SET status = 'refunded', refunded_to_client_at = NOW(), last_squad_event = 'refunded'
       WHERE id = $1`,
      [escrowId]
    );

    console.log(`[Squad] Refunded escrow ${escrowId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Squad] Error refunding escrow:', errorMessage);
    throw error;
  }
}

function verifySquadWebhook(rawBody: string, signature: string): boolean {
  try {
    const hash = crypto
      .createHmac('sha256', SQUAD_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    return hash === signature;
  } catch (error) {
    console.error('[Squad] Webhook verification error:', error);
    return false;
  }
}

async function handleSquadEvent(event: SquadWebhookEvent): Promise<void> {
  try {
    switch (event.event_type) {
      case 'payment.successful':
        await handlePaymentSuccessful(event);
        break;
      case 'virtual_account.funded':
        await handleVirtualAccountFunded(event);
        break;
      case 'transfer.completed':
        await handleTransferCompleted(event);
        break;
      case 'transfer.failed':
        await handleTransferFailed(event);
        break;
      default:
        console.log(`[Squad] Unhandled event type: ${event.event_type}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Squad] Error handling webhook event:', errorMessage);
    throw error;
  }
}

async function handlePaymentSuccessful(event: SquadWebhookEvent): Promise<void> {
  try {
    const { reference, amount } = event.data;
    
    // Find escrow account by reference
    const result = await query(
      'SELECT * FROM escrow_accounts WHERE squad_va_number = $1',
      [reference]
    );

    if (result.rows.length > 0) {
      const escrow = result.rows[0];
      
      // Update escrow status
      await query(
        `UPDATE escrow_accounts SET status = 'funded', funded_at = NOW(), last_squad_event = 'payment.successful'
         WHERE id = $1`,
        [escrow.id]
      );

      // Update task status
      await query(
        'UPDATE tasks SET status = \'funded\' WHERE id = $1',
        [escrow.task_id]
      );

      console.log(`[Squad] Payment successful for escrow ${escrow.id}, amount: ₦${amount}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Squad] Error handling payment successful:', errorMessage);
  }
}

async function handleVirtualAccountFunded(event: SquadWebhookEvent): Promise<void> {
  try {
    const { virtual_account_number, amount } = event.data;
    
    const result = await query(
      'SELECT * FROM escrow_accounts WHERE squad_va_number = $1',
      [virtual_account_number]
    );

    if (result.rows.length > 0) {
      const escrow = result.rows[0];
      
      await query(
        `UPDATE escrow_accounts SET status = 'funded', funded_at = NOW(), last_squad_event = 'virtual_account.funded', squad_webhook_count = squad_webhook_count + 1
         WHERE id = $1`,
        [escrow.id]
      );

      console.log(`[Squad] Virtual account funded: ${virtual_account_number}, amount: ₦${amount}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Squad] Error handling VA funded:', errorMessage);
  }
}

async function handleTransferCompleted(event: SquadWebhookEvent): Promise<void> {
  try {
    const { reference } = event.data;
    
    const result = await query(
      'SELECT * FROM escrow_accounts WHERE id = (SELECT escrow_id FROM transfers WHERE squad_reference = $1)',
      [reference]
    );

    if (result.rows.length > 0) {
      const escrow = result.rows[0];
      
      await query(
        `UPDATE escrow_accounts SET status = 'transferred', last_squad_event = 'transfer.completed'
         WHERE id = $1`,
        [escrow.id]
      );

      console.log(`[Squad] Transfer completed: ${reference}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Squad] Error handling transfer completed:', errorMessage);
  }
}

async function handleTransferFailed(event: SquadWebhookEvent): Promise<void> {
  try {
    const { reference, reason } = event.data;
    
    console.warn(`[Squad] Transfer failed: ${reference}, reason: ${reason}`);
    
    // Log the failure for review
    await query(
      `INSERT INTO transfer_logs (squad_reference, status, error_reason)
       VALUES ($1, $2, $3)`,
      [reference, 'failed', reason]
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Squad] Error handling transfer failed:', errorMessage);
  }
}

async function getEscrowStatus(escrowId: number): Promise<any> {
  try {
    const result = await query(
      'SELECT * FROM escrow_accounts WHERE id = $1',
      [escrowId]
    );

    if (result.rows.length === 0) {
      throw new Error('Escrow not found');
    }

    return result.rows[0];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Squad] Error getting escrow status:', errorMessage);
    throw error;
  }
}

async function updateEscrowStatus(escrowId: number, status: string): Promise<void> {
  try {
    await query(
      'UPDATE escrow_accounts SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, escrowId]
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Squad] Error updating escrow status:', errorMessage);
    throw error;
  }
}

export {
  createSquadEscrow,
  releaseEscrowToWorker,
  refundEscrowToClient,
  verifySquadWebhook,
  handleSquadEvent,
  getEscrowStatus,
  updateEscrowStatus
};
