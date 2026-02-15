export interface LinkedInProfile {
  linkedin_url: string;
  full_name: string;
  title?: string;
  company?: string;
  location?: string;
  profile_data: Record<string, unknown>;
}

export interface ScoringWeights {
  company_size: Array<{ min: number; max: number; points: number }>;
  industry_fit: Array<{ match: string; points: number }>;
  role_authority: Array<{ pattern: string; points: number }>;
  revenue_signals: Array<{ signal: string; points: number }>;
}

export interface ScoreResult {
  fit_score: number;
  intent_score: number;
  fulcrum_score: number;
  fulcrum_grade: string;
  breakdown: {
    company_size_pts: number;
    industry_pts: number;
    revenue_pts: number;
    role_pts: number;
    signals: Array<{ type: string; raw_score: number; decayed_score: number }>;
  };
}

export interface PipelineResult {
  tenant_id: string;
  profiles_scraped: number;
  profiles_new: number;
  profiles_enriched: number;
  profiles_scored: number;
  first_lines_generated: number;
  grade_distribution: Record<string, number>;
  errors: string[];
  duration_ms: number;
}

export const TIME_DECAY_MULTIPLIERS: Array<{ maxDays: number; multiplier: number }> = [
  { maxDays: 7, multiplier: 1.5 },
  { maxDays: 30, multiplier: 1.0 },
  { maxDays: 60, multiplier: 0.5 },
  { maxDays: 90, multiplier: 0.2 },
];

export function getTimeDecayMultiplier(daysAgo: number): number {
  if (daysAgo > 90) return 0;
  for (const tier of TIME_DECAY_MULTIPLIERS) {
    if (daysAgo <= tier.maxDays) return tier.multiplier;
  }
  return 0;
}

export function calculateGrade(fulcrumScore: number): string {
  if (fulcrumScore >= 90) return 'A+';
  if (fulcrumScore >= 80) return 'A';
  if (fulcrumScore >= 60) return 'B';
  if (fulcrumScore >= 40) return 'C';
  return 'D';
}
