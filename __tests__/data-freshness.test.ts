import { describe, it, expect } from 'vitest';
import { calculateFreshnessScore } from '@/lib/health/data-freshness';

describe('calculateFreshnessScore', () => {
  it('returns 100 for data enriched today', () => {
    const result = calculateFreshnessScore(new Date());
    expect(result.score).toBe(100);
    expect(result.label).toBe('fresh');
    expect(result.daysSinceEnrichment).toBe(0);
  });

  it('returns 100 for data enriched 3 days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400000);
    const result = calculateFreshnessScore(threeDaysAgo);
    expect(result.score).toBe(100);
    expect(result.label).toBe('fresh');
    expect(result.daysSinceEnrichment).toBe(3);
  });

  it('returns 100 for data enriched 7 days ago', () => {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const result = calculateFreshnessScore(sevenDaysAgo);
    expect(result.score).toBe(100);
    expect(result.label).toBe('fresh');
  });

  it('returns 70 for data enriched 8 days ago', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 86400000);
    const result = calculateFreshnessScore(eightDaysAgo);
    expect(result.score).toBe(70);
    expect(result.label).toBe('aging');
  });

  it('returns 70 for data enriched 14 days ago', () => {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000);
    const result = calculateFreshnessScore(fourteenDaysAgo);
    expect(result.score).toBe(70);
    expect(result.label).toBe('aging');
  });

  it('returns 40 for data enriched 15 days ago', () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 86400000);
    const result = calculateFreshnessScore(fifteenDaysAgo);
    expect(result.score).toBe(40);
    expect(result.label).toBe('stale');
  });

  it('returns 40 for data enriched 30 days ago', () => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    const result = calculateFreshnessScore(thirtyDaysAgo);
    expect(result.score).toBe(40);
    expect(result.label).toBe('stale');
  });

  it('returns 10 for data enriched 31 days ago', () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 86400000);
    const result = calculateFreshnessScore(thirtyOneDaysAgo);
    expect(result.score).toBe(10);
    expect(result.label).toBe('critical');
  });

  it('returns 10 for data enriched 90 days ago', () => {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);
    const result = calculateFreshnessScore(ninetyDaysAgo);
    expect(result.score).toBe(10);
    expect(result.label).toBe('critical');
  });

  it('returns 0 for null enrichment date', () => {
    const result = calculateFreshnessScore(null);
    expect(result.score).toBe(0);
    expect(result.label).toBe('critical');
    expect(result.daysSinceEnrichment).toBe(999);
  });

  it('freshness score decreases monotonically over time', () => {
    const scores = [0, 7, 8, 14, 15, 30, 31, 90].map((days) => {
      const date = new Date(Date.now() - days * 86400000);
      return calculateFreshnessScore(date).score;
    });

    // Check non-increasing (monotonic decrease with possible plateaus)
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });
});

describe('freshness boundaries', () => {
  it('boundary: 7 → 8 days transitions from fresh to aging', () => {
    const day7 = calculateFreshnessScore(new Date(Date.now() - 7 * 86400000));
    const day8 = calculateFreshnessScore(new Date(Date.now() - 8 * 86400000));
    expect(day7.label).toBe('fresh');
    expect(day8.label).toBe('aging');
    expect(day7.score).toBeGreaterThan(day8.score);
  });

  it('boundary: 14 → 15 days transitions from aging to stale', () => {
    const day14 = calculateFreshnessScore(new Date(Date.now() - 14 * 86400000));
    const day15 = calculateFreshnessScore(new Date(Date.now() - 15 * 86400000));
    expect(day14.label).toBe('aging');
    expect(day15.label).toBe('stale');
    expect(day14.score).toBeGreaterThan(day15.score);
  });

  it('boundary: 30 → 31 days transitions from stale to critical', () => {
    const day30 = calculateFreshnessScore(new Date(Date.now() - 30 * 86400000));
    const day31 = calculateFreshnessScore(new Date(Date.now() - 31 * 86400000));
    expect(day30.label).toBe('stale');
    expect(day31.label).toBe('critical');
    expect(day30.score).toBeGreaterThan(day31.score);
  });
});
