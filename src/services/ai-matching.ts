import { query } from '../db/pool';
import { synthesizeDecision, verifyProofWithAI, SynthesisInput } from '../ai/decisionSynthesizer';

interface Task {
  id: number;
  title: string;
  description: string;
  required_skills: string[];
  task_location: string;
  location_latitude: number;
  location_longitude: number;
  amount_naira: number;
  due_date: string;
}

interface Worker {
  id: number;
  name: string;
  skills: string[];
  primary_location: string;
  latitude: number;
  longitude: number;
  avg_rating: number;
  trust_score: number;
  tasks_completed: number;
  economic_profile: any;
  financial_profile: any;
}

interface MatchResult {
  worker_id: number;
  name: string;
  match_score: number;
  rank?: number;
  recommendation_reason?: string;
  strengths?: string[];
  risks?: string[];
  confidence?: number;
  distance_km: number;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function getWorkerMatches(task: Task, limit: number = 5): Promise<MatchResult[]> {
  try {
    // Get all active workers
    const result = await query<Worker>('SELECT * FROM workers WHERE is_active = true');
    const workers: Worker[] = result.rows;

    // DETERMINISTIC ENGINE LAYER
    // Calculate initial scores using rigid logic (Matching Engine + Trust Engine + Fraud Engine simulated)
    const engineCandidates = workers.map((worker) => {
      let matchScore = 50; 

      // Skill matching
      const matchedSkills = (worker.skills || []).filter((skill: string) =>
        (task.required_skills || []).includes(skill)
      );
      matchScore += matchedSkills.length * 15;

      // Rating bonus
      matchScore += Math.min(worker.avg_rating * 10, 30);

      // Trust Engine Score 
      const trustScore = worker.trust_score;
      matchScore += Math.min((trustScore / 1000) * 20, 20);

      // Location proximity
      const distance = calculateDistance(
        task.location_latitude,
        task.location_longitude,
        worker.latitude,
        worker.longitude
      );
      const distanceScore = Math.max(0, 20 - (distance / 2));
      matchScore += distanceScore;

      // Experience factor
      const experienceBonus = Math.min(worker.tasks_completed / 10, 10);
      matchScore += experienceBonus;

      // Simulated fraud risk engine (0-100)
      const fraudRisk = Math.max(0, 100 - worker.tasks_completed * 2);

      return {
        worker,
        distance,
        candidateData: {
          worker_id: worker.id,
          name: worker.name,
          match_score: matchScore,
          trust_score: trustScore,
          distance_score: distanceScore,
          fraud_risk: fraudRisk,
          verification_confidence: 0,
          economic_profile: worker.economic_profile,
          financial_profile: worker.financial_profile
        }
      };
    }).sort((a, b) => b.candidateData.match_score - a.candidateData.match_score).slice(0, limit);

    // AI DECISION SYNTHESIS LAYER
    const synthesisInput: SynthesisInput = {
      task: {
        id: task.id,
        title: task.title,
        description: task.description,
        required_skills: task.required_skills,
        task_location: task.task_location,
        amount_naira: task.amount_naira,
        due_date: task.due_date
      },
      candidates: engineCandidates.map(c => c.candidateData)
    };

    const finalizedDecision = await synthesizeDecision(synthesisInput);

    // Reconstruct MatchResult array, ensuring the chosen candidate is first and reasons are returned
    const finalRanked = finalizedDecision.recommended_workers.map(r => {
      const ec = engineCandidates.find(c => c.candidateData.worker_id.toString() === r.worker_id);
      if (!ec) return null;
      return {
        worker_id: ec.worker.id,
        name: ec.worker.name,
        match_score: typeof r.score === 'number' ? r.score : parseFloat(r.score as string) || ec.candidateData.match_score,
        distance_km: Math.round(ec.distance * 100) / 100,
        rank: r.rank,
        recommendation_reason: r.recommendation_reason,
        strengths: r.strengths,
        risks: r.risks,
        confidence: r.confidence
      };
    }).filter(Boolean) as MatchResult[];

    return finalRanked.length > 0 ? finalRanked : engineCandidates.map(ec => ({
      worker_id: ec.worker.id,
      name: ec.worker.name,
      match_score: ec.candidateData.match_score,
      distance_km: Math.round(ec.distance * 100) / 100,
      recommendation_reason: "Fallback candidate from deterministic engine.",
      risks: ["AI synthesis unavailable"]
    }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Engine] Error getting worker matches:', errorMessage);
    throw error;
  }
}

async function verifyTaskCompletion(taskId: number, proofData: any): Promise<{
  verified: boolean;
  confidence: number;
  details: string;
  flags?: string[];
}> {
  try {
    const taskResult = await query('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (taskResult.rows.length === 0) {
      throw new Error('Task not found');
    }
    const task = taskResult.rows[0];

    // ── STAGE 1: Deterministic Pre-check ────────────────────────────────────
    // Fast, rule-based checks that run before the AI call.
    let deterministicVerified = false;
    let deterministicConfidence = 0;
    const missingItems: string[] = [];

    // 1a. Proof content check — must have at least one of: file_url, images, text
    if (proofData && (proofData.file_url || proofData.images || proofData.text)) {
      deterministicVerified = true;
      deterministicConfidence = 70;
    } else {
      missingItems.push('Missing core proof content (file_url, images, or text required).');
    }

    // 1b. GPS proximity check — optional but boosts or penalises confidence
    if (proofData?.location?.lat != null && proofData?.location?.lng != null) {
      const dist = calculateDistance(
        task.location_latitude,
        task.location_longitude,
        proofData.location.lat,
        proofData.location.lng
      );
      if (dist <= 1.0) {
        deterministicConfidence += 20; // Within 1 km — strong signal
      } else if (dist <= 5.0) {
        deterministicConfidence += 5;  // Nearby — weak signal
        missingItems.push(`Proof submitted ${Math.round(dist)}km from task location (expected ≤1km).`);
      } else {
        deterministicVerified = false;
        missingItems.push(`Proof submitted ${Math.round(dist)}km away — location mismatch.`);
      }
    }

    const deterministicResult = {
      verified: deterministicVerified && missingItems.length === 0,
      confidence: deterministicConfidence,
      details: missingItems.length
        ? missingItems.join(' ')
        : 'Deterministic checks passed (content present, location valid).'
    };

    console.log(`[Engine] Deterministic verification → verified=${deterministicResult.verified} confidence=${deterministicResult.confidence}`);

    // ── STAGE 2: AI Synthesis (Gemini) ──────────────────────────────────────
    // Gemini evaluates the proof against the task's deliverable_spec
    // and refines the verdict with natural-language reasoning.
    const aiResult = await verifyProofWithAI({
      task: {
        title: task.title,
        description: task.description,
        deliverable_spec: task.deliverable_spec,
        task_location: task.task_location
      },
      proof: proofData,
      deterministicResult
    });

    return {
      verified: aiResult.verified,
      confidence: aiResult.confidence,
      details: aiResult.details,
      flags: aiResult.flags
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Engine] Error verifying task completion:', errorMessage);
    throw error;
  }
}

export { getWorkerMatches, verifyTaskCompletion };
