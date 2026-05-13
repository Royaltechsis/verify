import { Router, Request, Response } from 'express';
import { query } from '../db/pool';

const router = Router();

// Get all workers
router.get('/', async (req: Request, res: Response) => {
  try {
    const location = req.query.location as string;
    const skill = req.query.skill as string;
    const minRating = req.query.minRating as string;

    let sql = 'SELECT * FROM workers WHERE is_active = true';
    const params: any[] = [];

    if (location) {
      sql += ' AND primary_location ILIKE $' + (params.length + 1);
      params.push(`%${location}%`);
    }

    if (skill) {
      sql += ' AND $' + (params.length + 1) + ' = ANY(skills)';
      params.push(skill);
    }

    if (minRating) {
      sql += ' AND avg_rating >= $' + (params.length + 1);
      params.push(parseFloat(minRating));
    }

    sql += ' ORDER BY trust_score DESC';
    const result = await query(sql, params);
    return res.json(result.rows);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Workers] Error fetching workers:', errorMessage);
    return res.status(500).json({ error: 'Failed to fetch workers' });
  }
});

// Get worker by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM workers WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Workers] Error fetching worker:', errorMessage);
    return res.status(500).json({ error: 'Failed to fetch worker' });
  }
});

// Create new worker
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      name,
      email,
      phone,
      skills,
      bio,
      primary_location,
      latitude,
      longitude,
      avatar_url
    } = req.body;

    if (!name || !email || !primary_location) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const result = await query(
      `INSERT INTO workers (name, email, phone, skills, bio, primary_location, latitude, longitude, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (email) DO UPDATE SET updated_at = NOW() RETURNING *`,
      [name, email, phone, skills || [], bio, primary_location, latitude, longitude, avatar_url]
    );

    return res.status(201).json(result.rows[0]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Workers] Error creating worker:', errorMessage);
    return res.status(500).json({ error: 'Failed to create worker' });
  }
});

// Update worker profile
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Build dynamic update query
    const allowedFields = ['name', 'phone', 'skills', 'bio', 'avatar_url', 'primary_location', 'latitude', 'longitude'];
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    for (const field of allowedFields) {
      if (field in updates) {
        updateFields.push(`${field} = $${paramCount}`);
        values.push(updates[field]);
        paramCount++;
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updateFields.push(`updated_at = NOW()`);
    values.push(id);

    const sql = `UPDATE workers SET ${updateFields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await query(sql, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Workers] Error updating worker:', errorMessage);
    return res.status(500).json({ error: 'Failed to update worker' });
  }
});

// Get worker statistics
router.get('/:id/stats', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT 
        tasks_completed, tasks_successful, on_time_rate, avg_rating, 
        total_earnings, current_month_earnings, trust_score
       FROM workers WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    return res.json(result.rows[0]);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Workers] Error fetching worker stats:', errorMessage);
    return res.status(500).json({ error: 'Failed to fetch worker stats' });
  }
});

export default router;
