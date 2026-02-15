import { describe, it, expect } from 'vitest';
import { calculateIntentScore } from '@/lib/pipeline/signal-detector';
import { getTimeDecayMultiplier, TIME_DECAY_MULTIPLIERS } from '@/lib/pipeline/types';
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

describe('TIME_DECAY_MULTIPLIERS', () => {
  it('has 4 tiers', () => {
    expect(TIME_DECAY_MULTIPLIERS).toHaveLength(4);
  });

  it('tiers are in ascending order by maxDays', () => {
    for (let i = 1; i < TIME_DECAY_MULTIPLIERS.length; i++) {
      expect(TIME_DECAY_MULTIPLIERS[i].maxDays).toBeGreaterThan(
        TIME_DECAY_MULTIPLIERS[i - 1].maxDays
      );
    }
  });

  it('multipliers decrease as days increase', () => {
    for (let i = 1; i < TIME_DECAY_MULTIPLIERS.length; i++) {
      expect(TIME_DECAY_MULTIPLIERS[i].multiplier).toBeLessThan(
        TIME_DECAY_MULTIPLIERS[i - 1].multiplier
      );
    }
  });
});

describe('signal scoring scenarios', () => {
  it('high-value fresh signals score well', () => {
    const signals: DetectedSignal[] = [
      signal('series_a', 15, 2, 'Raised $5M Series A'),
      signal('job_change', 12, 5, 'New VP role'),
      signal('keyword_mention', 8, 1, 'Mentioned churn reduction'),
    ];
    const score = calculateIntentScore(signals);
    expect(score).toBe(35); // 15 + 12 + 8 = 35, under cap
  });

  it('stale signals with high raw scores still cap at 60', () => {
    // Even with many signals, intent is capped at 60
    const signals: DetectedSignal[] = Array.from({ length: 10 }, (_, i) =>
      signal('keyword_mention', 10, i * 5, `Signal ${i}`)
    );
    const score = calculateIntentScore(signals);
    expect(score).toBe(60); // 10 * 10 = 100, capped at 60
  });

  it('realistic Hunhu lead scenario', () => {
    // A superintendent who recently posted about student mental health
    const signals: DetectedSignal[] = [
      signal(
        'keyword_mention',
        9 * getTimeDecayMultiplier(3), // "student mental health crisis" - 3 days old
        3,
        'Mentioned student mental health crisis'
      ),
      signal(
        'pain_point_mentioned',
        7 * getTimeDecayMultiplier(10), // "attendance intervention" - 10 days old
        10,
        'Discussed attendance challenges'
      ),
    ];
    // 9 * 1.5 = 13.5, 7 * 1.0 = 7 → 20.5
    expect(calculateIntentScore(signals)).toBe(20.5);
  });

  it('realistic Pulse lead scenario', () => {
    // A SaaS founder researching churn reduction
    const signals: DetectedSignal[] = [
      signal(
        'keyword_mention',
        9 * getTimeDecayMultiplier(1), // "reduce SaaS churn" - 1 day old
        1,
        'Searched for SaaS churn solutions'
      ),
      signal(
        'series_a',
        8 * getTimeDecayMultiplier(15), // Raised Series A 15 days ago
        15,
        'Completed Series A funding'
      ),
      signal(
        'hiring_surge',
        6 * getTimeDecayMultiplier(7), // Hiring surge this week
        7,
        'Posted 5 new roles'
      ),
    ];
    // 9 * 1.5 = 13.5, 8 * 1.0 = 8, 6 * 1.5 = 9 → 30.5
    expect(calculateIntentScore(signals)).toBe(30.5);
  });
});
