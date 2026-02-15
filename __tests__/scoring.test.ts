import { describe, it, expect } from 'vitest';
import { getTimeDecayMultiplier, calculateGrade } from '@/lib/pipeline/types';
import { calculateIntentScore } from '@/lib/pipeline/signal-detector';
import type { DetectedSignal } from '@/lib/ai/types';

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
