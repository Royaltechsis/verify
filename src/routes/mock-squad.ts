import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// In-memory store for mocks
const mockAccounts = new Map<string, any>();

/**
 * MOCK: Squad Create Virtual Account
 * Based on Squad Virtual Account API specification.
 */
router.post('/virtual-account/create', (req: Request, res: Response) => {
  const { amount, customer_identifier, payment_description } = req.body;

  // Generate a mock 10-digit NUBAN
  const mockAccountNumber = Math.floor(1000000000 + Math.random() * 9000000000).toString();
  
  const mockResponse = {
    status: 200,
    success: true,
    message: "Virtual Account created successfully",
    data: {
      virtual_account_number: mockAccountNumber,
      beneficiary_name: payment_description || "Mock TaskVerify Escrow",
      bank_code: "033",
      bank_name: "Mocked UBA Bank",
      customer_identifier: customer_identifier,
      amount: amount,
      merchant_reference: uuidv4()
    }
  };

  mockAccounts.set(mockAccountNumber, { ...mockResponse.data, balance: amount });

  console.log(`[Mock Squad API] Created Virtual Account: ${mockAccountNumber}`);
  
  // Squad usually triggers a webhook after creation/funding in test mode
  simulateWebhookFunding(mockAccountNumber, amount);

  return res.status(200).json(mockResponse);
});

/**
 * MOCK: Squad Fund Transfer (from Virtual Account to Worker's Bank)
 */
router.post('/virtual-account/fund-transfer', (req: Request, res: Response) => {
  const { virtual_account_number, amount, narration } = req.body;

  if (!mockAccounts.has(virtual_account_number)) {
    return res.status(404).json({
      status: 404,
      success: false,
      message: "Virtual Account not found"
    });
  }

  const mockResponse = {
    status: 200,
    success: true,
    message: "Transfer successful",
    data: {
      reference: uuidv4(),
      amount_transferred: amount,
      status: "success",
      narration
    }
  };

  console.log(`[Mock Squad API] Released funds from VA ${virtual_account_number}: ${amount}`);

  return res.status(200).json(mockResponse);
});

/**
 * MOCK: Squad Refund (back to Client)
 */
router.post('/virtual-account/refund', (req: Request, res: Response) => {
  const { virtual_account_number, amount } = req.body;

  if (!mockAccounts.has(virtual_account_number)) {
    return res.status(404).json({
      status: 404,
      success: false,
      message: "Virtual Account not found"
    });
  }

  const mockResponse = {
    status: 200,
    success: true,
    message: "Refund successful",
    data: {
      reference: uuidv4(),
      amount_refunded: amount,
      status: "success"
    }
  };

  console.log(`[Mock Squad API] Refunded VA ${virtual_account_number}: ${amount}`);

  return res.status(200).json(mockResponse);
});

// Helper to simulate a funding webhook arriving slightly after creation
function simulateWebhookFunding(vaNumber: string, amount: number) {
  setTimeout(async () => {
    try {
      const webhookPayload = {
        event_type: "virtual_account.funded",
        data: {
          virtual_account_number: vaNumber,
          amount: amount,
          transaction_reference: uuidv4(),
          currency: "NGN",
          status: "success"
        },
        reference: uuidv4(),
        timestamp: new Date().toISOString()
      };

      // Mock signature calculation matching our own secret 
      // Replace with your local port if different
      const webhookUrl = process.env.SQUAD_WEBHOOK_URL || 'http://localhost:3001/api/v1/webhooks/squad';
      
      const crypto = await import('crypto');
      const secret = process.env.SQUAD_WEBHOOK_SECRET || 'mock_secret';
      const signature = crypto
        .createHmac('sha256', secret)
        .update(JSON.stringify(webhookPayload))
        .digest('hex');

      await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-squad-signature': signature
        },
        body: JSON.stringify(webhookPayload)
      });
      console.log(`[Mock Squad API] Dispatched virtual_account.funded webhook to ${webhookUrl}`);
    } catch (err) {
      console.warn('[Mock Squad API] Failed to simulate webhook', err);
    }
  }, 5000); // 5 second delay to simulate bank processing time
}

export default router;