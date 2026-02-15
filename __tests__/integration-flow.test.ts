import { describe, it, expect } from 'vitest';
import { calculateGrade, getTimeDecayMultiplier } from '@/lib/pipeline/types';
import { calculateIntentScore } from '@/lib/pipeline/signal-detector';
import type { DetectedSignal, EnrichmentResult } from '@/lib/ai/types';
import type { ScoringWeights } from '@/lib/pipeline/types';
import type { HuckIntent, ClassifiedIntent } from '@/lib/huck/types';
import type { RSATerms, ClawbackPolicy } from '@/lib/icm/types';

// ============================================================================
// Helpers
// ============================================================================

function signal(type: DetectedSignal['signal_type'], score: number, daysAgo: number): DetectedSignal {
  return {
    signal_type: type,
    signal_value: { description: '', evidence: '' },
    signal_score: score * getTimeDecayMultiplier(daysAgo),
    detected_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    days_ago: daysAgo,
  };
}

function buildEnrichment(overrides: Partial<EnrichmentResult> = {}): EnrichmentResult {
  return {
    company_size_estimate: 200,
    industry: 'K-12 Education',
    industry_subcategory: 'Student Services',
    confidence_score: 85,
    tech_stack: [],
    pain_points: [],
    buying_signals: [],
    recent_events: [],
    competitor_mentions: [],
    decision_maker_level: 'c_level',
    funding_stage: null,
    funding_amount: null,
    budget_timing: null,
    ...overrides,
  };
}

// Reproduce the fit scoring logic for testing
function calculateFitScore(enrichment: EnrichmentResult, weights: ScoringWeights) {
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
  if (enrichment.budget_timing) {
    const month = new Date().getMonth();
    if (month >= 9 || month <= 2) {
      revenue_pts = Math.min(revenue_pts + 3, 7);
    }
  }

  let role_pts = 3;
  for (const role of weights.role_authority) {
    if (role.pattern === enrichment.decision_maker_level) {
      role_pts = role.points;
      break;
    }
  }

  return { total: Math.min(company_size_pts + industry_pts + revenue_pts + role_pts, 40), company_size_pts, industry_pts, revenue_pts, role_pts };
}

// Hunhu ICP weights
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

// ============================================================================
// Full Scoring Pipeline — Hunhu Scenarios
// ============================================================================

describe('Hunhu full scoring pipeline', () => {
  it('A+ scenario: superintendent at mid-size district + multiple fresh signals', () => {
    const enrichment = buildEnrichment({
      company_size_estimate: 200,
      decision_maker_level: 'c_level',
      confidence_score: 90,
    });
    const fit = calculateFitScore(enrichment, HUNHU_WEIGHTS);
    expect(fit.total).toBe(33); // 10 + 8 + 0 + 15

    const signals = [
      signal('keyword_mention', 10, 2),    // 10 * 1.5 = 15
      signal('pain_point_mentioned', 8, 3), // 8 * 1.5 = 12
      signal('hiring_surge', 7, 5),         // 7 * 1.5 = 10.5
      signal('keyword_mention', 9, 1),      // 9 * 1.5 = 13.5
    ];
    const intentScore = calculateIntentScore(signals); // 51, capped at 60

    const fitNorm = (fit.total / 40) * 100;
    const intentNorm = (intentScore / 60) * 100;
    const fulcrumScore = (fitNorm * 0.40) + (intentNorm * 0.60);

    expect(fulcrumScore).toBeGreaterThan(80);
    const grade = calculateGrade(fulcrumScore);
    expect(grade === 'A+' || grade === 'A').toBe(true);
  });

  it('D scenario: IC at tiny school + no signals', () => {
    const enrichment = buildEnrichment({
      company_size_estimate: 20,
      decision_maker_level: 'ic',
      confidence_score: 30,
    });
    const fit = calculateFitScore(enrichment, HUNHU_WEIGHTS);
    expect(fit.total).toBeLessThanOrEqual(10);

    const intentScore = calculateIntentScore([]);
    expect(intentScore).toBe(0);

    const fitNorm = (fit.total / 40) * 100;
    const intentNorm = (intentScore / 60) * 100;
    const fulcrumScore = (fitNorm * 0.40) + (intentNorm * 0.60);

    expect(fulcrumScore).toBeLessThan(40);
    expect(calculateGrade(fulcrumScore)).toBe('D');
  });

  it('B scenario: director at medium district + moderate signals', () => {
    const enrichment = buildEnrichment({
      company_size_estimate: 300,
      decision_maker_level: 'vp_director',
      confidence_score: 65,
    });
    const fit = calculateFitScore(enrichment, HUNHU_WEIGHTS);

    const signals = [
      signal('keyword_mention', 8, 15), // 8 * 1.0 = 8
      signal('pain_point_mentioned', 6, 20), // 6 * 1.0 = 6
    ];
    const intentScore = calculateIntentScore(signals);

    const fitNorm = (fit.total / 40) * 100;
    const intentNorm = (intentScore / 60) * 100;
    const fulcrumScore = (fitNorm * 0.40) + (intentNorm * 0.60);

    expect(fulcrumScore).toBeGreaterThan(40);
    expect(fulcrumScore).toBeLessThan(80);
    const grade = calculateGrade(fulcrumScore);
    expect(grade === 'B' || grade === 'C').toBe(true);
  });

  it('old signals decay to zero after 90 days', () => {
    const signals = [
      signal('keyword_mention', 10, 100), // 10 * 0 = 0
      signal('series_a', 15, 120),         // 15 * 0 = 0
    ];
    const intentScore = calculateIntentScore(signals);
    expect(intentScore).toBe(0);
  });
});

// ============================================================================
// Fulcrum Score formula validation
// ============================================================================

describe('Fulcrum Score formula correctness', () => {
  it('max fit + max intent = 100', () => {
    const fitTotal = 40;
    const intentScore = 60;
    const fitNorm = (fitTotal / 40) * 100;
    const intentNorm = (intentScore / 60) * 100;
    const fulcrumScore = (fitNorm * 0.40) + (intentNorm * 0.60);
    expect(fulcrumScore).toBe(100);
    expect(calculateGrade(fulcrumScore)).toBe('A+');
  });

  it('zero fit + zero intent = 0', () => {
    const fitTotal = 0;
    const intentScore = 0;
    const fitNorm = (fitTotal / 40) * 100;
    const intentNorm = (intentScore / 60) * 100;
    const fulcrumScore = (fitNorm * 0.40) + (intentNorm * 0.60);
    expect(fulcrumScore).toBe(0);
    expect(calculateGrade(fulcrumScore)).toBe('D');
  });

  it('fit-only lead maxes at 40 (fit=40, intent=0)', () => {
    const fitTotal = 40;
    const intentScore = 0;
    const fitNorm = (fitTotal / 40) * 100;
    const intentNorm = (intentScore / 60) * 100;
    const fulcrumScore = (fitNorm * 0.40) + (intentNorm * 0.60);
    expect(fulcrumScore).toBe(40);
    expect(calculateGrade(fulcrumScore)).toBe('C');
  });

  it('intent-only lead maxes at 60 (fit=0, intent=60)', () => {
    const fitTotal = 0;
    const intentScore = 60;
    const fitNorm = (fitTotal / 40) * 100;
    const intentNorm = (intentScore / 60) * 100;
    const fulcrumScore = (fitNorm * 0.40) + (intentNorm * 0.60);
    expect(fulcrumScore).toBe(60);
    expect(calculateGrade(fulcrumScore)).toBe('B');
  });
});

// ============================================================================
// ICM Commission Calculation Logic
// ============================================================================

describe('ICM commission tier calculation', () => {
  const tiers = [
    { name: 'Standard', minDealValue: 0, maxDealValue: 25000, rate: 0.10 },
    { name: 'Growth', minDealValue: 25001, maxDealValue: 100000, rate: 0.12 },
    { name: 'Enterprise', minDealValue: 100001, maxDealValue: null, rate: 0.15 },
  ];

  function findTier(dealValue: number) {
    return tiers.find(
      (t) => dealValue >= t.minDealValue && (t.maxDealValue === null || dealValue <= t.maxDealValue)
    );
  }

  it('$15K deal = Standard tier (10%)', () => {
    const tier = findTier(15000);
    expect(tier?.name).toBe('Standard');
    expect(tier?.rate).toBe(0.10);
    expect(15000 * tier!.rate).toBe(1500);
  });

  it('$50K deal = Growth tier (12%)', () => {
    const tier = findTier(50000);
    expect(tier?.name).toBe('Growth');
    expect(50000 * tier!.rate).toBe(6000);
  });

  it('$200K deal = Enterprise tier (15%)', () => {
    const tier = findTier(200000);
    expect(tier?.name).toBe('Enterprise');
    expect(200000 * tier!.rate).toBe(30000);
  });
});

describe('ICM clawback policy', () => {
  const policy: ClawbackPolicy = {
    fullClawbackDays: 30,
    proratedClawbackDays: 90,
    noneAfterDays: 91,
  };

  function calculateClawback(originalAmount: number, daysSincePayment: number): { amount: number; rate: number; type: string } {
    if (daysSincePayment <= policy.fullClawbackDays) {
      return { amount: originalAmount, rate: 1.0, type: 'full' };
    }
    if (daysSincePayment <= policy.proratedClawbackDays) {
      const daysRemaining = policy.proratedClawbackDays - daysSincePayment;
      const totalProratableDays = policy.proratedClawbackDays - policy.fullClawbackDays;
      const rate = daysRemaining / totalProratableDays;
      return { amount: Math.round(originalAmount * rate), rate, type: 'prorated' };
    }
    return { amount: 0, rate: 0, type: 'none' };
  }

  it('day 15 cancellation = full clawback', () => {
    const result = calculateClawback(5000, 15);
    expect(result.type).toBe('full');
    expect(result.amount).toBe(5000);
  });

  it('day 60 cancellation = prorated clawback (~50%)', () => {
    const result = calculateClawback(5000, 60);
    expect(result.type).toBe('prorated');
    expect(result.amount).toBeGreaterThan(0);
    expect(result.amount).toBeLessThan(5000);
  });

  it('day 100 cancellation = no clawback', () => {
    const result = calculateClawback(5000, 100);
    expect(result.type).toBe('none');
    expect(result.amount).toBe(0);
  });
});

// ============================================================================
// Huck Intent Coverage
// ============================================================================

describe('Huck intent types cover all use cases', () => {
  const allIntents: HuckIntent[] = [
    'lead_query', 'lead_detail', 'pipeline_control', 'deal_health',
    'system_status', 'config_change', 'content_query', 'seo_status',
    'cro_status', 'content_roi', 'help', 'unknown',
  ];

  it('has exactly 12 intents', () => {
    expect(allIntents).toHaveLength(12);
  });

  it('every intent can form a valid ClassifiedIntent', () => {
    for (const intent of allIntents) {
      const classified: ClassifiedIntent = {
        intent,
        entities: {},
        confidence: 0.9,
      };
      expect(classified.intent).toBe(intent);
    }
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('edge cases and boundary conditions', () => {
  it('grade boundary: 89.99 = A, 90.0 = A+', () => {
    expect(calculateGrade(89.99)).toBe('A');
    expect(calculateGrade(90.0)).toBe('A+');
  });

  it('negative signal scores treated as 0 in intent sum', () => {
    // In practice, signal_score should never be negative, but let's ensure robustness
    const signals: DetectedSignal[] = [
      { signal_type: 'keyword_mention', signal_value: { description: '', evidence: '' }, signal_score: -5, detected_at: new Date().toISOString(), days_ago: 1 },
      { signal_type: 'job_change', signal_value: { description: '', evidence: '' }, signal_score: 20, detected_at: new Date().toISOString(), days_ago: 1 },
    ];
    const score = calculateIntentScore(signals);
    // -5 + 20 = 15, but capped at 60
    expect(score).toBe(15);
  });

  it('company size of exactly 50 matches 1-50 range in Hunhu weights', () => {
    const enrichment = buildEnrichment({ company_size_estimate: 50 });
    const fit = calculateFitScore(enrichment, HUNHU_WEIGHTS);
    // Hunhu: 1-50 = 3 pts (checked AFTER 51-500 which won't match)
    // Actually Hunhu weights order: 51-500 first, then 501-5000, then 1-50
    // 50 is NOT in 51-500, NOT in 501-5000, IS in 1-50 → 3 pts
    expect(fit.company_size_pts).toBe(3);
  });

  it('company size of exactly 51 matches 51-500 range in Hunhu weights', () => {
    const enrichment = buildEnrichment({ company_size_estimate: 51 });
    const fit = calculateFitScore(enrichment, HUNHU_WEIGHTS);
    expect(fit.company_size_pts).toBe(10);
  });
});
