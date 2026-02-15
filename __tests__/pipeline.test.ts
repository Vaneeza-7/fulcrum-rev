import { describe, it, expect } from 'vitest';
import { calculateGrade, getTimeDecayMultiplier } from '@/lib/pipeline/types';
import { calculateIntentScore } from '@/lib/pipeline/signal-detector';
import type { DetectedSignal, EnrichmentResult } from '@/lib/ai/types';
import type { ScoringWeights } from '@/lib/pipeline/types';

// Helper to create a DetectedSignal with required fields
function signal(type: DetectedSignal['signal_type'], score: number, daysAgo: number, desc: string): DetectedSignal {
  return {
    signal_type: type,
    signal_value: { description: desc, evidence: '' },
    signal_score: score,
    detected_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    days_ago: daysAgo,
  };
}

// =============================================================================
// FULL SCORING PIPELINE (unit-testable parts)
// =============================================================================

// Reproduce the fit score calculation logic from scorer.ts for testing
// without requiring a DB connection
function calculateFitScore(
  enrichment: EnrichmentResult,
  weights: ScoringWeights
): { total: number; company_size_pts: number; industry_pts: number; revenue_pts: number; role_pts: number } {
  let company_size_pts = 0;
  for (const range of weights.company_size) {
    if (enrichment.company_size_estimate >= range.min && enrichment.company_size_estimate <= range.max) {
      company_size_pts = range.points;
      break;
    }
  }

  let industry_pts = 3;
  for (const fit of weights.industry_fit) {
    if (fit.match === 'perfect' && enrichment.industry) {
      if (enrichment.confidence_score >= 70) industry_pts = 8;
      else if (enrichment.confidence_score >= 40) industry_pts = 5;
      break;
    }
  }

  let revenue_pts = 0;
  if (enrichment.funding_stage) {
    for (const sig of weights.revenue_signals) {
      if (enrichment.funding_stage === sig.signal) {
        revenue_pts = sig.points;
        break;
      }
    }
  }

  let role_pts = 3;
  for (const role of weights.role_authority) {
    if (role.pattern === enrichment.decision_maker_level) {
      role_pts = role.points;
      break;
    }
  }

  const total = Math.min(company_size_pts + industry_pts + revenue_pts + role_pts, 40);
  return { total, company_size_pts, industry_pts, revenue_pts, role_pts };
}

// =============================================================================
// HUNHU ICP SCORING WEIGHTS (from seed data)
// =============================================================================
const HUNHU_WEIGHTS: ScoringWeights = {
  company_size: [
    { min: 51, max: 500, points: 10 },
    { min: 501, max: 5000, points: 7 },
    { min: 1, max: 50, points: 3 },
  ],
  industry_fit: [
    { match: 'perfect', points: 8 },
    { match: 'adjacent', points: 5 },
    { match: 'neutral', points: 3 },
  ],
  role_authority: [
    { pattern: 'c_level', points: 15 },
    { pattern: 'vp_director', points: 12 },
    { pattern: 'manager', points: 7 },
    { pattern: 'ic', points: 3 },
  ],
  revenue_signals: [
    { signal: 'series_a', points: 7 },
    { signal: 'seed', points: 5 },
    { signal: 'budget_season', points: 3 },
  ],
};

// =============================================================================
// PULSE ICP SCORING WEIGHTS (from seed data)
// =============================================================================
const PULSE_WEIGHTS: ScoringWeights = {
  company_size: [
    { min: 1, max: 50, points: 10 },
    { min: 51, max: 200, points: 7 },
    { min: 201, max: 500, points: 5 },
  ],
  industry_fit: [
    { match: 'perfect', points: 8 },
    { match: 'adjacent', points: 5 },
    { match: 'neutral', points: 3 },
  ],
  role_authority: [
    { pattern: 'c_level', points: 15 },
    { pattern: 'vp_director', points: 12 },
    { pattern: 'manager', points: 7 },
    { pattern: 'ic', points: 3 },
  ],
  revenue_signals: [
    { signal: 'series_a', points: 7 },
    { signal: 'seed', points: 5 },
    { signal: 'budget_season', points: 3 },
  ],
};

describe('Hunhu lead scoring', () => {
  it('scores a perfect-fit Superintendent highly', () => {
    const enrichment: EnrichmentResult = {
      company_size_estimate: 200, // 51-500 = 10 pts
      industry: 'K-12 Education',
      industry_subcategory: 'Student Services',
      confidence_score: 85,       // perfect match = 8 pts
      tech_stack: ['Canvas', 'PowerSchool'],
      pain_points: ['student mental health', 'attendance tracking'],
      buying_signals: ['budget allocated for SEL tools'],
      recent_events: [],
      competitor_mentions: [],
      decision_maker_level: 'c_level', // 15 pts
      funding_stage: null,              // 0 pts
      funding_amount: null,
      budget_timing: null,
    };

    const fit = calculateFitScore(enrichment, HUNHU_WEIGHTS);
    // 10 + 8 + 0 + 15 = 33, capped at 40
    expect(fit.company_size_pts).toBe(10);
    expect(fit.industry_pts).toBe(8);
    expect(fit.revenue_pts).toBe(0);
    expect(fit.role_pts).toBe(15);
    expect(fit.total).toBe(33);
  });

  it('scores an IC at a small school lower', () => {
    const enrichment: EnrichmentResult = {
      company_size_estimate: 30,  // 1-50 = 3 pts
      industry: 'Education',
      industry_subcategory: 'General',
      confidence_score: 50,       // adjacent = 5 pts
      tech_stack: [],
      pain_points: [],
      buying_signals: [],
      recent_events: [],
      competitor_mentions: [],
      decision_maker_level: 'ic', // 3 pts
      funding_stage: null,        // 0 pts
      funding_amount: null,
      budget_timing: null,
    };

    const fit = calculateFitScore(enrichment, HUNHU_WEIGHTS);
    expect(fit.total).toBe(11); // 3 + 5 + 0 + 3 = 11
  });

  it('full scoring produces correct Fulcrum score and grade', () => {
    const fitTotal = 33; // From test above
    const signals: DetectedSignal[] = [
      signal('keyword_mention', 13.5, 3, 'student mental health crisis'),
      signal('pain_point_mentioned', 7, 10, 'attendance intervention'),
      signal('keyword_mention', 10.5, 5, 'SEL assessment tools'),
    ];
    const intentScore = calculateIntentScore(signals); // 13.5 + 7 + 10.5 = 31

    // Fulcrum Score = (Fit/40)*100*0.40 + (Intent/60)*100*0.60
    const fitNorm = (fitTotal / 40) * 100;   // 82.5
    const intentNorm = (intentScore / 60) * 100; // 51.67
    const fulcrumScore = (fitNorm * 0.40) + (intentNorm * 0.60); // 33 + 31 = 64

    expect(fulcrumScore).toBeCloseTo(64.0, 0);
    expect(calculateGrade(fulcrumScore)).toBe('B');
  });
});

describe('Pulse lead scoring', () => {
  it('scores a SaaS founder at a small startup highly', () => {
    const enrichment: EnrichmentResult = {
      company_size_estimate: 15,   // 1-50 = 10 pts
      industry: 'SaaS',
      industry_subcategory: 'Analytics',
      confidence_score: 90,        // perfect = 8 pts
      tech_stack: ['React', 'Node.js', 'Stripe'],
      pain_points: ['customer churn', 'revenue forecasting'],
      buying_signals: ['evaluating analytics tools'],
      recent_events: [],
      competitor_mentions: [],
      decision_maker_level: 'c_level', // 15 pts
      funding_stage: 'series_a',       // 7 pts
      funding_amount: null,
      budget_timing: null,
    };

    const fit = calculateFitScore(enrichment, PULSE_WEIGHTS);
    // 10 + 8 + 7 + 15 = 40, capped at 40
    expect(fit.total).toBe(40);
  });

  it('scores a manager at a 300-person company moderately', () => {
    const enrichment: EnrichmentResult = {
      company_size_estimate: 300,  // 201-500 = 5 pts
      industry: 'Software',
      industry_subcategory: 'Enterprise',
      confidence_score: 60,        // adjacent = 5 pts (>=40 but <70)
      tech_stack: ['Java'],
      pain_points: [],
      buying_signals: [],
      recent_events: [],
      competitor_mentions: [],
      decision_maker_level: 'manager', // 7 pts
      funding_stage: null,             // 0 pts
      funding_amount: null,
      budget_timing: null,
    };

    const fit = calculateFitScore(enrichment, PULSE_WEIGHTS);
    expect(fit.total).toBe(17); // 5 + 5 + 0 + 7 = 17
  });

  it('A+ lead: perfect fit + strong intent = 90+', () => {
    const fitTotal = 40; // Max fit
    const signals: DetectedSignal[] = [
      signal('keyword_mention', 13.5, 1, 'reduce SaaS churn'),
      signal('series_a', 12, 5, 'Raised Series A'),
      signal('hiring_surge', 9, 2, '10 new roles posted'),
      signal('keyword_mention', 12, 3, 'predictive churn model'),
      signal('pain_point_mentioned', 10.5, 4, 'mentioned customer health'),
    ];
    const intentScore = calculateIntentScore(signals); // 13.5+12+9+12+10.5 = 57

    const fitNorm = (fitTotal / 40) * 100;  // 100
    const intentNorm = (intentScore / 60) * 100; // 95
    const fulcrumScore = (fitNorm * 0.40) + (intentNorm * 0.60); // 40 + 57 = 97

    expect(fulcrumScore).toBeGreaterThanOrEqual(90);
    expect(calculateGrade(fulcrumScore)).toBe('A+');
  });

  it('D lead: poor fit + no intent = below 40', () => {
    const fitTotal = 8; // Low fit
    const signals: DetectedSignal[] = []; // No signals
    const intentScore = calculateIntentScore(signals); // 0

    const fitNorm = (fitTotal / 40) * 100;  // 20
    const intentNorm = (intentScore / 60) * 100; // 0
    const fulcrumScore = (fitNorm * 0.40) + (intentNorm * 0.60); // 8 + 0 = 8

    expect(fulcrumScore).toBeLessThan(40);
    expect(calculateGrade(fulcrumScore)).toBe('D');
  });
});

describe('fit score caps at 40', () => {
  it('even with maximum points in all categories, total is capped', () => {
    const enrichment: EnrichmentResult = {
      company_size_estimate: 15,
      industry: 'SaaS',
      industry_subcategory: 'Analytics',
      confidence_score: 95,
      tech_stack: [],
      pain_points: [],
      buying_signals: [],
      recent_events: [],
      competitor_mentions: [],
      decision_maker_level: 'c_level',
      funding_stage: 'series_a',
      funding_amount: null,
      budget_timing: 'Q1 2026',
    };

    const fit = calculateFitScore(enrichment, PULSE_WEIGHTS);
    expect(fit.total).toBeLessThanOrEqual(40);
  });
});
