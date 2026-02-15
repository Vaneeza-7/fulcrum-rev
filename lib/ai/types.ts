export interface EnrichmentResult {
  company_size_estimate: number;
  industry: string;
  industry_subcategory: string;
  funding_stage: string | null;
  funding_amount: number | null;
  tech_stack: string[];
  pain_points: string[];
  buying_signals: string[];
  recent_events: string[];
  decision_maker_level: 'c_level' | 'vp_director' | 'manager' | 'ic';
  budget_timing: string | null;
  competitor_mentions: string[];
  confidence_score: number;
}

export interface DetectedSignal {
  signal_type:
    | 'job_change'
    | 'series_a'
    | 'series_b'
    | 'seed_funding'
    | 'hiring_surge'
    | 'keyword_mention'
    | 'pain_point_mentioned'
    | 'competitor_research';
  signal_value: { description: string; evidence: string };
  signal_score: number;
  detected_at: string;
  days_ago: number;
}

export interface ReengagementResult {
  diagnosis: string;
  reengagement_email: string;
  internal_note: string;
  suggested_actions: string[];
}
