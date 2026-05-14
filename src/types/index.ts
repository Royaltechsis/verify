/**
 * TaskVerify Backend API - Type Definitions
 */

export interface Worker {
  id: number;
  external_id?: string;
  name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  skills: string[];
  bio?: string;
  primary_location: string;
  latitude: number;
  longitude: number;
  trust_score: number;
  tasks_completed: number;
  tasks_successful: number;
  on_time_rate: number;
  avg_rating: number;
  total_earnings: number;
  current_month_earnings: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: number;
  task_uuid: string;
  title: string;
  description: string;
  client_name?: string;
  client_email?: string;
  required_skills: string[];
  amount_naira: number;
  status: 'open' | 'shortlisted' | 'applications_open' | 'selection_in_progress' | 'assigned' | 'submitted' | 'verified' | 'funded' | 'completed' | 'disputed' | 'cancelled' | 'flagged_for_dispute' | 'pending_release_of_funds' | 'complaint_filed' | 'buyer_disputed';
  task_location: string;
  location_latitude: number;
  location_longitude: number;
  due_date: string;
  deliverable_spec: any;
  ai_recommendations?: any;
  buyer_user_id?: number;
  assigned_worker_id?: number;
  assigned_at?: string;
  proof_submission?: any;
  submitted_at?: string;
  ai_verification_result?: any;
  verified_at?: string;
  squad_va_account_number?: string;
  squad_payment_ref?: string;
  shortlisted_workers?: any;
  selected_worker_id?: number;
  buyer_confirmed?: boolean;
  worker_confirmed?: boolean;
  created_at: string;
  updated_at: string;
}

export interface EscrowAccount {
  id: number;
  task_id: number;
  squad_va_number: string;
  squad_bank_code: string;
  squad_bank_name: string;
  amount_naira: number;
  status: 'pending' | 'funded' | 'released' | 'refunded' | 'transferred';
  funded_at?: string;
  released_to_worker_at?: string;
  refunded_to_client_at?: string;
  last_squad_event?: string;
  last_squad_event_at?: string;
  squad_webhook_count: number;
  created_at: string;
  updated_at: string;
}

export interface TaskHistory {
  id: number;
  worker_id: number;
  task_id: number;
  status: string;
  rating_by_client?: number;
  feedback_text?: string;
  earned_naira: number;
  bonus_for_on_time: number;
  completed_at?: string;
  created_at: string;
}

export interface WorkerMatch {
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

export interface TaskVerificationResult {
  verified: boolean;
  confidence: number;
  details: string;
}

export interface SquadWebhookEvent {
  event_type: string;
  data: any;
  reference: string;
  timestamp: string;
}
