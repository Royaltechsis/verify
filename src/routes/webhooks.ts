import { Router, Request, Response } from 'express';
import { query } from '../db/pool';
import { verifySquadWebhook, handleSquadEvent } from '../services/squad-service';

const router = Router();

// Squad webhook endpoint
router.post('/squad', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-squad-signature'] as string;
    const rawBody = (req as any).rawBody;

    if (!signature || !rawBody) {
      console.warn('[Webhooks] Missing signature or body');
      return res.status(400).json({ error: 'Missing signature' });
    }

    // Verify webhook signature
    const isValid = verifySquadWebhook(rawBody, signature);
    if (!isValid) {
      console.warn('[Webhooks] Invalid Squad webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    console.log('[Webhooks] Received Squad webhook:', event.event_type);

    // Handle different Squad events
    await handleSquadEvent(event);

    // Log webhook event
    await query(
      `INSERT INTO squad_webhook_logs (event_type, payload, status)
       VALUES ($1, $2, $3)`,
      [event.event_type, JSON.stringify(event), 'processed']
    );

    return res.json({ status: 'received' });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Webhooks] Error processing Squad webhook:', errorMessage);
    return res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Verification webhook endpoint
router.post('/verification', async (req: Request, res: Response) => {
  try {
    const { task_id, verification_result, ai_confidence } = req.body;

    if (!task_id || !verification_result) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Update task with verification result
    const result = await query(
      `UPDATE tasks SET ai_verification_result = $1, verified_at = NOW(), status = 'verified'
       WHERE id = $2 RETURNING *`,
      [JSON.stringify({ result: verification_result, confidence: ai_confidence }), task_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    return res.json({
      task: result.rows[0],
      message: 'Task verification recorded'
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Webhooks] Error processing verification:', errorMessage);
    return res.status(500).json({ error: 'Failed to process verification' });
  }
});

// Health check for webhooks
router.get('/health', (res: Response) => {
  return res.json({ status: 'webhook service healthy' });
});

export default router;
