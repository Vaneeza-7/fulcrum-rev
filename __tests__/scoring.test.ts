import { describe, it, expect } from 'vitest';
import { getTimeDecayMultiplier, calculateGrade } from '@/lib/pipeline/types';
import { calculateIntentScore } from '@/lib/pipeline/signal-detector';
import { explainScore } from '@/lib/pipeline/explain';
import type { DetectedSignal } from '@/lib/ai/types';
import type { ScoreResult } from '@/lib/pipeline/types';

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
// TIME DECAY MULTIPLIERS
// =============================================================================
describe('getTimeDecayMultiplier', () => {
  it('returns 1.5x for signals within 7 days', () => {
    expect(getTimeDecayMultiplier(0)).toBe(1.5);
    expect(getTimeDecayMultiplier(1)).toBe(1.5);
    expect(getTimeDecayMultiplier(7)).toBe(1.5);
  });

  it('returns 1.0x for signals 8-30 days old', () => {
    expect(getTimeDecayMultiplier(8)).toBe(1.0);
    expect(getTimeDecayMultiplier(15)).toBe(1.0);
    expect(getTimeDecayMultiplier(30)).toBe(1.0);
  });

  it('returns 0.5x for signals 31-60 days old', () => {
    expect(getTimeDecayMultiplier(31)).toBe(0.5);
    expect(getTimeDecayMultiplier(45)).toBe(0.5);
    expect(getTimeDecayMultiplier(60)).toBe(0.5);
  });

  it('returns 0.2x for signals 61-90 days old', () => {
    expect(getTimeDecayMultiplier(61)).toBe(0.2);
    expect(getTimeDecayMultiplier(75)).toBe(0.2);
    expect(getTimeDecayMultiplier(90)).toBe(0.2);
  });

  it('returns 0 for signals older than 90 days', () => {
    expect(getTimeDecayMultiplier(91)).toBe(0);
    expect(getTimeDecayMultiplier(180)).toBe(0);
    expect(getTimeDecayMultiplier(365)).toBe(0);
  });
});

// =============================================================================
// GRADE CALCULATION
// =============================================================================
describe('calculateGrade', () => {
  it('assigns A+ for scores 90-100', () => {
    expect(calculateGrade(90)).toBe('A+');
    expect(calculateGrade(95)).toBe('A+');
    expect(calculateGrade(100)).toBe('A+');
  });

  it('assigns A for scores 80-89', () => {
    expect(calculateGrade(80)).toBe('A');
    expect(calculateGrade(85)).toBe('A');
    expect(calculateGrade(89)).toBe('A');
  });

  it('assigns B for scores 60-79', () => {
    expect(calculateGrade(60)).toBe('B');
    expect(calculateGrade(70)).toBe('B');
    expect(calculateGrade(79)).toBe('B');
  });

  it('assigns C for scores 40-59', () => {
    expect(calculateGrade(40)).toBe('C');
    expect(calculateGrade(50)).toBe('C');
    expect(calculateGrade(59)).toBe('C');
  });

  it('assigns D for scores below 40', () => {
    expect(calculateGrade(0)).toBe('D');
    expect(calculateGrade(20)).toBe('D');
    expect(calculateGrade(39)).toBe('D');
  });

  it('handles edge cases at grade boundaries', () => {
    expect(calculateGrade(89.99)).toBe('A');
    expect(calculateGrade(90.0)).toBe('A+');
    expect(calculateGrade(79.99)).toBe('B');
    expect(calculateGrade(80.0)).toBe('A');
  });
});

// =============================================================================
// INTENT SCORE CALCULATION
// =============================================================================
describe('calculateIntentScore', () => {
  it('sums signal scores', () => {
    const signals: DetectedSignal[] = [
      signal('job_change', 10, 5, ''),
      signal('series_a', 15, 10, ''),
    ];
    expect(calculateIntentScore(signals)).toBe(25);
  });

  it('caps total at 60', () => {
    const signals: DetectedSignal[] = [
      signal('job_change', 30, 1, ''),
      signal('series_a', 25, 2, ''),
      signal('hiring_surge', 20, 3, ''),
    ];
    // 30 + 25 + 20 = 75, capped at 60
    expect(calculateIntentScore(signals)).toBe(60);
  });

  it('returns 0 for empty signals', () => {
    expect(calculateIntentScore([])).toBe(0);
  });

  it('handles single signal', () => {
    const signals: DetectedSignal[] = [
      signal('keyword_mention', 8, 3, ''),
    ];
    expect(calculateIntentScore(signals)).toBe(8);
  });

  it('handles signals exactly at the cap', () => {
    const signals: DetectedSignal[] = [
      signal('job_change', 30, 1, ''),
      signal('series_a', 30, 2, ''),
    ];
    expect(calculateIntentScore(signals)).toBe(60);
  });
});

// =============================================================================
// TIME DECAY INTEGRATION WITH SCORING
// =============================================================================
describe('time decay applied to intent scores', () => {
  it('fresh signals get boosted by 1.5x', () => {
    const rawScore = 10;
    const daysAgo = 3;
    const decayedScore = rawScore * getTimeDecayMultiplier(daysAgo);
    expect(decayedScore).toBe(15); // 10 * 1.5 = 15
  });

  it('30-day-old signals keep full value', () => {
    const rawScore = 10;
    const daysAgo = 30;
    const decayedScore = rawScore * getTimeDecayMultiplier(daysAgo);
    expect(decayedScore).toBe(10); // 10 * 1.0 = 10
  });

  it('60-day-old signals lose half value', () => {
    const rawScore = 10;
    const daysAgo = 45;
    const decayedScore = rawScore * getTimeDecayMultiplier(daysAgo);
    expect(decayedScore).toBe(5); // 10 * 0.5 = 5
  });

  it('90-day-old signals nearly worthless', () => {
    const rawScore = 10;
    const daysAgo = 80;
    const decayedScore = rawScore * getTimeDecayMultiplier(daysAgo);
    expect(decayedScore).toBe(2); // 10 * 0.2 = 2
  });

  it('old signals contribute nothing', () => {
    const rawScore = 10;
    const daysAgo = 100;
    const decayedScore = rawScore * getTimeDecayMultiplier(daysAgo);
    expect(decayedScore).toBe(0); // 10 * 0 = 0
  });
});

// =============================================================================
// explainScore — score explanation / transparency layer
// =============================================================================

/** Minimal valid ScoreResult for use in explanation tests. */
function makeScoreResult(overrides: Partial<ScoreResult> = {}): ScoreResult {
  return {
    fit_score: 33,
    intent_score: 31,
    fulcrum_score: 64,
    fulcrum_grade: 'B',
    breakdown: {
      company_size_pts: 10,
      industry_pts: 8,
      revenue_pts: 0,
      role_pts: 15,
      signals: [
        { type: 'keyword_mention',     raw_score: 9,  decayed_score: 13.5, days_ago: 3  },
        { type: 'pain_point_mentioned', raw_score: 7,  decayed_score: 7,   days_ago: 10 },
        { type: 'keyword_mention',     raw_score: 7,  decayed_score: 10.5, days_ago: 5  },
      ],
    },
    ...overrides,
  };
}

describe('explainScore', () => {
  it('returns the correct formula string', () => {
    const explanation = explainScore(makeScoreResult());
    expect(explanation.formula).toContain('Fit Score');
    expect(explanation.formula).toContain('Intent Score');
    expect(explanation.formula).toContain('0.40');
    expect(explanation.formula).toContain('0.60');
  });

  it('mirrors the fulcrum_score and grade from the input ScoreResult', () => {
    const result = makeScoreResult({ fulcrum_score: 64, fulcrum_grade: 'B' });
    const explanation = explainScore(result);
    expect(explanation.fulcrum_score).toBe(64);
    expect(explanation.fulcrum_grade).toBe('B');
  });

  it('includes a grade_reason string for every grade', () => {
    const grades: Array<[string, number]> = [
      ['A+', 95], ['A', 85], ['B', 70], ['C', 50], ['D', 25],
    ];
    for (const [grade, score] of grades) {
      const exp = explainScore(makeScoreResult({ fulcrum_grade: grade, fulcrum_score: score }));
      expect(exp.grade_reason).toContain(grade);
      expect(exp.grade_reason).toContain(String(score));
    }
  });

  it('fit axis: score and max are correct', () => {
    const explanation = explainScore(makeScoreResult());
    expect(explanation.fit_axis.score).toBe(33);
    expect(explanation.fit_axis.max_score).toBe(40);
    expect(explanation.fit_axis.weight_pct).toBe(40);
  });

  it('fit axis: weighted contribution equals fit_score (algebraic identity)', () => {
    // (fit/40)*100*0.40 = fit — so the weighted contribution is always numerically
    // equal to the fit score itself.
    const explanation = explainScore(makeScoreResult({ fit_score: 33 }));
    expect(explanation.fit_axis.weighted_contribution).toBeCloseTo(33, 2);
  });

  it('fit axis: exposes all four components with names', () => {
    const explanation = explainScore(makeScoreResult());
    const names = explanation.fit_axis.components.map((c) => c.name);
    expect(names).toContain('Company Size');
    expect(names).toContain('Industry Fit');
    expect(names).toContain('Revenue Signals');
    expect(names).toContain('Role Authority');
  });

  it('fit axis: component points match breakdown', () => {
    const explanation = explainScore(makeScoreResult());
    const byName = Object.fromEntries(
      explanation.fit_axis.components.map((c) => [c.name, c.points]),
    );
    expect(byName['Company Size']).toBe(10);
    expect(byName['Industry Fit']).toBe(8);
    expect(byName['Revenue Signals']).toBe(0);
    expect(byName['Role Authority']).toBe(15);
  });

  it('fit axis: zero revenue points produces "no matching" reason', () => {
    const explanation = explainScore(makeScoreResult());
    const revenue = explanation.fit_axis.components.find((c) => c.name === 'Revenue Signals')!;
    expect(revenue.reason).toMatch(/no matching|0 pts/i);
  });

  it('intent axis: score, max, and weight are correct', () => {
    const explanation = explainScore(makeScoreResult());
    expect(explanation.intent_axis.score).toBe(31);
    expect(explanation.intent_axis.max_score).toBe(60);
    expect(explanation.intent_axis.weight_pct).toBe(60);
  });

  it('intent axis: weighted contribution equals intent_score (algebraic identity)', () => {
    const explanation = explainScore(makeScoreResult({ intent_score: 31 }));
    expect(explanation.intent_axis.weighted_contribution).toBeCloseTo(31, 2);
  });

  it('intent axis: signal list length matches breakdown signals', () => {
    const explanation = explainScore(makeScoreResult());
    expect(explanation.intent_axis.signals).toHaveLength(3);
  });

  it('intent axis: each signal carries days_ago and decay_note', () => {
    const explanation = explainScore(makeScoreResult());
    for (const s of explanation.intent_axis.signals) {
      expect(typeof s.days_ago).toBe('number');
      expect(typeof s.decay_note).toBe('string');
      expect(s.decay_note.length).toBeGreaterThan(0);
    }
  });

  it('decay_note: fresh signal (≤7 days) is described as boosted 1.5×', () => {
    const result = makeScoreResult({
      breakdown: {
        company_size_pts: 10, industry_pts: 8, revenue_pts: 0, role_pts: 15,
        signals: [{ type: 'job_change', raw_score: 10, decayed_score: 15, days_ago: 3 }],
      },
    });
    const exp = explainScore(result);
    expect(exp.intent_axis.signals[0].decay_note).toMatch(/1\.5/);
  });

  it('decay_note: 30-day signal is described as no decay 1.0×', () => {
    const result = makeScoreResult({
      breakdown: {
        company_size_pts: 10, industry_pts: 8, revenue_pts: 0, role_pts: 15,
        signals: [{ type: 'hiring_surge', raw_score: 8, decayed_score: 8, days_ago: 25 }],
      },
    });
    const exp = explainScore(result);
    expect(exp.intent_axis.signals[0].decay_note).toMatch(/1\.0/);
  });

  it('decay_note: 45-day signal is described as halved 0.5×', () => {
    const result = makeScoreResult({
      breakdown: {
        company_size_pts: 10, industry_pts: 8, revenue_pts: 0, role_pts: 15,
        signals: [{ type: 'series_a', raw_score: 10, decayed_score: 5, days_ago: 45 }],
      },
    });
    const exp = explainScore(result);
    expect(exp.intent_axis.signals[0].decay_note).toMatch(/0\.5/);
  });

  it('decay_note: 80-day signal is described as minimal 0.2×', () => {
    const result = makeScoreResult({
      breakdown: {
        company_size_pts: 10, industry_pts: 8, revenue_pts: 0, role_pts: 15,
        signals: [{ type: 'competitor_research', raw_score: 10, decayed_score: 2, days_ago: 80 }],
      },
    });
    const exp = explainScore(result);
    expect(exp.intent_axis.signals[0].decay_note).toMatch(/0\.2/);
  });

  it('decay_note: expired signal (>90 days) is described as expired', () => {
    const result = makeScoreResult({
      breakdown: {
        company_size_pts: 10, industry_pts: 8, revenue_pts: 0, role_pts: 15,
        signals: [{ type: 'keyword_mention', raw_score: 10, decayed_score: 0, days_ago: 120 }],
      },
    });
    const exp = explainScore(result);
    expect(exp.intent_axis.signals[0].decay_note).toMatch(/expired/i);
  });

  it('works correctly with zero intent signals', () => {
    const result = makeScoreResult({ intent_score: 0, breakdown: {
      company_size_pts: 8, industry_pts: 5, revenue_pts: 0, role_pts: 3,
      signals: [],
    }});
    const exp = explainScore(result);
    expect(exp.intent_axis.signals).toHaveLength(0);
    expect(exp.intent_axis.score).toBe(0);
    expect(exp.intent_axis.weighted_contribution).toBe(0);
  });

  it('A+ grade reason mentions top-priority and auto-push', () => {
    const exp = explainScore(makeScoreResult({ fulcrum_grade: 'A+', fulcrum_score: 95 }));
    expect(exp.grade_reason).toMatch(/top-priority/i);
    expect(exp.grade_reason).toMatch(/auto-push/i);
  });

  it('fulcrum_score = fit_score + intent_score (algebraic proof)', () => {
    // This identity always holds because of the weight normalization.
    const fit = 28;
    const intent = 45;
    const expectedFulcrumScore = fit + intent; // 73
    const result = makeScoreResult({ fit_score: fit, intent_score: intent, fulcrum_score: expectedFulcrumScore });
    const exp = explainScore(result);
    expect(exp.fit_axis.weighted_contribution + exp.intent_axis.weighted_contribution)
      .toBeCloseTo(expectedFulcrumScore, 1);
  });
});
