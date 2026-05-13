import { query } from '../db/pool';

/**
 * AI Decision Synthesizer
 * 
 * Takes structured outputs from deterministic engines (Matching, Trust, Fraud, Verification)
 * and uses an LLM purely for interpreting, ranking, and explaining.
 * It DOES NOT make the raw decisions or compute scores.
 */

export interface CandidateData {
  worker_id: number;
  match_score: number;
  trust_score: number;
  distance_score: number;
  fraud_risk?: number;
  verification_confidence?: number;
  // added context
  name?: string;
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

export async function synthesizeDecision(input: SynthesisInput): Promise<SynthesisOutput> {
  const prompt = `
You are an AI Decision Synthesis Engine.
Your role: Decision Interpreter + Ranking + Explanation Engine.
You MUST NOT override raw score computation data. You must rank the provided candidates based ONLY on the metrics provided.

Task Context:
${JSON.stringify(input.task, null, 2)}

Candidates (from Deterministic Engines):
${JSON.stringify(input.candidates, null, 2)}

Provide a JSON response with the following exact structure NO MARKDOWN OR OTHER TEXT:
{
  "selected_worker_id": "string",
  "ranking": [
    { "worker_id": "string", "score": number }
  ],
  "reasoning": "string",
  "risk_analysis": ["string"],
  "confidence": number
}
`;

  try {
    const aiResponse = await callLLM(prompt);
    
    // Parse response
    let jsonStr = aiResponse.trim();
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }
    
    const arrayMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (arrayMatch) {
      jsonStr = arrayMatch[0];
    }

    const synthesized: SynthesisOutput = JSON.parse(jsonStr);

    // Logging for auditability
    await logSynthesisDecision(input, synthesized);

    return synthesized;
  } catch (error) {
    console.error('[DecisionSynthesizer] Failed to synthesize decision or invalid JSON. Falling back to deterministic.', error);
    
    // Fallback: deterministic ranking based on match_score
    const sorted = [...input.candidates].sort((a, b) => b.match_score - a.match_score);
    const topCandidate = sorted[0];

    const fallback: SynthesisOutput = {
      selected_worker_id: topCandidate ? topCandidate.worker_id.toString() : "",
      ranking: sorted.map(c => ({ worker_id: c.worker_id.toString(), score: c.match_score })),
      reasoning: "Fallback strictly to matching engine scores due to synthesis error.",
      risk_analysis: ["Fallback utilized. No AI risk interpretation available."],
      confidence: 100
    };

    await logSynthesisDecision(input, fallback);
    return fallback;
  }
}

async function callLLM(prompt: string): Promise<string> {
  // Support for multiple providers
  if (process.env.GEMINI_API_KEY) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });
    if (!res.ok) throw new Error('Gemini API Error');
    const data: any = await res.json();
    return data.candidates[0].content.parts[0].text;
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
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: "json_object" }
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
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!res.ok) throw new Error('OpenRouter API Error');
    const data: any = await res.json();
    return data.choices[0].message.content;
  }

  throw new Error('No supported AI provider configured (GEMINI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY)');
}

async function logSynthesisDecision(input: SynthesisInput, output: SynthesisOutput) {
  try {
    // We create the table if it doesn't exist just as a safety net, 
    // or assume it's created via migrations. Let's create it if not exists.
    await query(`
      CREATE TABLE IF NOT EXISTS decision_synthesis_logs (
        id SERIAL PRIMARY KEY,
        task_id INTEGER,
        input_data JSONB,
        output_data JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    await query(
      `INSERT INTO decision_synthesis_logs (task_id, input_data, output_data) VALUES ($1, $2, $3)`,
      [input.task.id || null, JSON.stringify(input), JSON.stringify(output)]
    );
  } catch (error) {
    console.error('[DecisionSynthesizer] Failed to log decision:', error);
  }
}