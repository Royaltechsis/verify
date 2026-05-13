import { query } from '../db/pool';

/**
 * AI Decision Synthesizer
 *
 * Two jobs:
 *  1. synthesizeDecision  — interprets deterministic engine scores to rank & explain worker matches
 *  2. verifyProofWithAI   — evaluates submitted proof against task deliverable_spec using Gemini
 *
 * The LLM NEVER computes raw scores — it only interprets, ranks, and explains.
 * Every decision (AI or fallback) is written to `decision_synthesis_logs`.
 */

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface CandidateData {
  worker_id: number;
  name?: string;
  match_score: number;
  trust_score: number;
  distance_score: number;
  fraud_risk?: number;
  verification_confidence?: number;
  economic_profile?: any;
  financial_profile?: any;
}

export interface TaskData {
  id?: number;
  title: string;
  description: string;
  required_skills: string[];
  task_location: string;
  amount_naira: number;
  due_date: string;
}

export interface SynthesisInput {
  task: TaskData;
  candidates: CandidateData[];
}

export interface SynthesisOutput {
  selected_worker_id: string;
  ranking: Array<{ worker_id: string; score: number }>;
  reasoning: string;
  risk_analysis: string[];
  confidence: number;
}

export interface ProofVerificationInput {
  task: {
    title: string;
    description: string;
    deliverable_spec: any;
    task_location: string;
  };
  proof: any;
  deterministicResult: {
    verified: boolean;
    confidence: number;
    details: string;
  };
}

export interface ProofVerificationOutput {
  verified: boolean;
  confidence: number;
  details: string;
  flags: string[];
}

// ─── Core LLM call ──────────────────────────────────────────────────────────

async function callGemini(systemInstruction: string, userPrompt: string, imageUrls: string[] = [], retryOnRateLimit = true): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set');
  }

  const model = 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

  // v1beta: fold system instruction into user turn for broadest compatibility
  const fullPrompt = `${systemInstruction}\n\n${userPrompt}`;

  // Fetch images if provided
  const imageParts: any[] = [];
  for (const imgUrl of imageUrls) {
    try {
      if (imgUrl.startsWith('http')) {
        const response = await fetch(imgUrl);
        const buffer = await response.arrayBuffer();
        const mimeType = response.headers.get('content-type') || 'image/jpeg';
        imageParts.push({
          inlineData: {
            data: Buffer.from(buffer).toString("base64"),
            mimeType: mimeType,
          }
        });
      } else {
        // Fallback for paths that might be local
        const fs = require('fs');
        const path = require('path');
        const buffer = fs.readFileSync(imgUrl);
        const ext = path.extname(imgUrl).toLowerCase();
        let mimeType = 'image/jpeg';
        if (ext === '.png') mimeType = 'image/png';
        if (ext === '.webp') mimeType = 'image/webp';
        
        imageParts.push({
          inlineData: {
            data: buffer.toString('base64'),
            mimeType: mimeType
          }
        });
      }
    } catch (e) {
      console.warn(`[DecisionSynthesizer] Failed to load image ${imgUrl}:`, e);
    }
  }

  const payload = {
    contents: [
      { 
        role: 'user', 
        parts: [
          { text: fullPrompt },
          ...imageParts
        ] 
      }
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
      maxOutputTokens: 2048  // 1024 was too small for multi-candidate matching responses
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  // Auto-retry once on rate limit (429) or transient overload (503)
  if ((res.status === 429 || res.status === 503) && retryOnRateLimit) {
    const errData: any = await res.json().catch(() => ({}));
    const retryDelay = errData?.error?.details?.find((d: any) => d.retryDelay)?.retryDelay;
    const delayMs = retryDelay ? parseInt(retryDelay) * 1000 : 15000;
    console.warn(`[DecisionSynthesizer] ${res.status} — retrying in ${delayMs / 1000}s ...`);
    await new Promise(r => setTimeout(r, delayMs));
    return callGemini(systemInstruction, userPrompt, imageUrls, false); // no second retry
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errBody}`);
  }

  const data: any = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned empty response');
  return text;
}

/** Fallback: tries Groq or OpenRouter if Gemini key not present */
async function callLLM(systemInstruction: string, userPrompt: string, imageUrls: string[] = []): Promise<string> {
  if (process.env.GEMINI_API_KEY) {
    return callGemini(systemInstruction, userPrompt, imageUrls);
  }

  if (process.env.GROQ_API_KEY) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' }
      })
    });
    if (!res.ok) throw new Error('Groq API Error');
    const data: any = await res.json();
    return data.choices[0].message.content;
  }

  if (process.env.OPENROUTER_API_KEY) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'mistralai/mixtral-8x7b-instruct',
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userPrompt }
        ]
      })
    });
    if (!res.ok) throw new Error('OpenRouter API Error');
    const data: any = await res.json();
    return data.choices[0].message.content;
  }

  throw new Error('No AI provider configured. Set GEMINI_API_KEY, GROQ_API_KEY, or OPENROUTER_API_KEY.');
}

/** Safely extract a JSON object from raw LLM text (handles accidental markdown fences) */
function extractJSON(raw: string): string {
  let s = raw.trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) s = fenced[1].trim();
  const obj = s.match(/\{[\s\S]*\}/);
  if (obj) s = obj[0];
  return s;
}

// ─── 1. Worker Matching Synthesizer ─────────────────────────────────────────

const MATCHING_SYSTEM = `You are the AI Decision Synthesis Engine for TaskVerify, an AI-powered economic identity and financial trust platform for informal workers.
Your ONLY job is to interpret pre-computed deterministic scores and profiles to produce a ranked worker recommendation.
Rules:
- Do NOT alter or invent scores; base ranking strictly on the provided metrics and profiles (especially credit_score, risk_level, and behavioral_score).
- Return pure JSON, no markdown, no explanation outside the JSON structure.
- Be concise in "reasoning" — one clear sentence explaining the top pick based on trust and financial identity.
- "risk_analysis" should list 1-3 specific risk factors derived from the data (fraud_risk, economic_profile risk_level, low trust_score, distance, etc).`;

export async function synthesizeDecision(input: SynthesisInput): Promise<SynthesisOutput> {
  const userPrompt = `Task:
${JSON.stringify(input.task, null, 2)}

Candidates (from deterministic engines):
${JSON.stringify(input.candidates, null, 2)}

Return this exact JSON shape:
{
  "selected_worker_id": "<string id of best candidate>",
  "ranking": [{ "worker_id": "<string>", "score": <number> }],
  "reasoning": "<one sentence why top candidate was chosen>",
  "risk_analysis": ["<risk 1>", "<risk 2>"],
  "confidence": <0-100>
}`;

  try {
    const raw = await callLLM(MATCHING_SYSTEM, userPrompt);
    const synthesized: SynthesisOutput = JSON.parse(extractJSON(raw));
    console.log(`[DecisionSynthesizer] Matched → worker ${synthesized.selected_worker_id} (confidence: ${synthesized.confidence})`);
    await logSynthesisDecision('matching', input, synthesized);
    return synthesized;
  } catch (error) {
    console.error('[DecisionSynthesizer] Synthesis failed — falling back to deterministic ranking:', error instanceof Error ? error.message : error);

    const sorted = [...input.candidates].sort((a, b) => b.match_score - a.match_score);
    const top = sorted[0];
    const fallback: SynthesisOutput = {
      selected_worker_id: top ? top.worker_id.toString() : '',
      ranking: sorted.map(c => ({ worker_id: c.worker_id.toString(), score: c.match_score })),
      reasoning: 'Fallback to deterministic engine scores (AI synthesis unavailable).',
      risk_analysis: ['AI synthesis unavailable — manual review recommended.'],
      confidence: 100
    };

    await logSynthesisDecision('matching', input, fallback);
    return fallback;
  }
}

// ─── 2. Proof Verification Synthesizer ──────────────────────────────────────

const VERIFICATION_SYSTEM = `You are the Proof Verification Engine.
Your task is to perform a VISUAL INSPECTION of the provided images.
1. COMPARE: Check if the images visually represent a valid deliverable according to the task spec. (e.g. FUTA ID card).
2. REJECT: If the image is a towel, a random object, or does not clearly display the expected visual proof, you MUST return verified: false.
3. ADVISE: If verified is false, provide a specific flag describing what was seen instead (e.g., "Image contains towels, not an ID card").
Return ONLY valid JSON, no markdown, no extra text.`;

export async function verifyProofWithAI(input: ProofVerificationInput): Promise<ProofVerificationOutput> {
  const userPrompt = `Task Details:
${JSON.stringify(input.task, null, 2)}

Worker's Submitted Proof:
${JSON.stringify(input.proof, null, 2)}

Deterministic Pre-check:
${JSON.stringify(input.deterministicResult, null, 2)}

Return this exact JSON shape:
{
  "verified": <true|false>,
  "confidence": <0-100>,
  "details": "<one clear sentence summarising the verdict>",
  "flags": ["<concern 1>", "<concern 2>"]
}

Guidelines:
- "verified" = true only if proof clearly satisfies the deliverable_spec requirements.
- "confidence" reflects how certain you are; use the deterministic confidence as a starting baseline.
- "flags" lists specific missing items or concerns; empty array if all good.`;

  try {
    // Extract images if provided in proof
    let imageUrls: string[] = [];
    if (input.proof && Array.isArray(input.proof.files)) {
      imageUrls = input.proof.files;
    } else if (input.proof && typeof input.proof === 'string' && input.proof.startsWith('http')) {
      imageUrls = [input.proof];
    } else if (input.proof && input.proof.fileUrl) {
      imageUrls = [input.proof.fileUrl];
    }

    const raw = await callLLM(VERIFICATION_SYSTEM, userPrompt, imageUrls);
    const result: ProofVerificationOutput = JSON.parse(extractJSON(raw));
    console.log(`[DecisionSynthesizer] Proof verification → verified=${result.verified} confidence=${result.confidence}`);
    await logSynthesisDecision('verification', input, result);
    return result;
  } catch (error) {
    console.error('[DecisionSynthesizer] Proof verification AI failed — using deterministic fallback:', error instanceof Error ? error.message : error);
    return {
      verified: input.deterministicResult.verified,
      confidence: input.deterministicResult.confidence,
      details: `${input.deterministicResult.details} (AI synthesis unavailable — deterministic result used.)`,
      flags: ['AI synthesis unavailable.']
    };
  }
}

// ─── Audit Logger ────────────────────────────────────────────────────────────

async function logSynthesisDecision(type: 'matching' | 'verification', input: any, output: any) {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS decision_synthesis_logs (
        id          SERIAL PRIMARY KEY,
        type        TEXT NOT NULL DEFAULT 'matching',
        task_id     INTEGER,
        input_data  JSONB,
        output_data JSONB,
        created_at  TIMESTAMP DEFAULT NOW()
      )
    `);

    // Patch existing tables that were created before the 'type' column was added
    await query(`
      ALTER TABLE decision_synthesis_logs
        ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'matching',
        ADD COLUMN IF NOT EXISTS credit_score_snapshot INTEGER,
        ADD COLUMN IF NOT EXISTS economic_profile_snapshot JSONB
    `);

    const taskId = input?.task?.id ?? null;
    let credit_score_snapshot = null;
    let economic_profile_snapshot = null;

    if (type === 'matching' && input?.candidates && input.candidates.length > 0) {
      // Just taking the snapshot of the highest ranked candidate or first available
      const topCand = input.candidates[0];
      if (topCand.financial_profile) credit_score_snapshot = topCand.financial_profile.credit_score;
      if (topCand.economic_profile) economic_profile_snapshot = topCand.economic_profile;
    }

    await query(
      `INSERT INTO decision_synthesis_logs (type, task_id, input_data, output_data, credit_score_snapshot, economic_profile_snapshot) VALUES ($1, $2, $3, $4, $5, $6)`,
      [type, taskId, JSON.stringify(input), JSON.stringify(output), credit_score_snapshot, economic_profile_snapshot ? JSON.stringify(economic_profile_snapshot) : null]
    );
  } catch (error) {
    // Non-fatal — never let logging break the main flow
    console.error('[DecisionSynthesizer] Failed to write audit log:', error instanceof Error ? error.message : error);
  }
}