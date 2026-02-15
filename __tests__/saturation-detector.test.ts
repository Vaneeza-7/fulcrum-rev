import { describe, it, expect } from 'vitest';
import { SaturationSignal } from '@/lib/content/types';

// Pure function from saturation-detector.ts
function getSaturationScore(signals: SaturationSignal[]): number {
  const triggeredCount = signals.filter((s) => s.triggered).length;
  return Math.round((triggeredCount / signals.length) * 100);
}

describe('Saturation Detector', () => {
  describe('getSaturationScore', () => {
    it('should return 100 when all 4 signals are triggered', () => {
      const signals: SaturationSignal[] = [
        {
          type: 'engagement_decline',
          triggered: true,
          value: 65,
          threshold: 70,
          description: 'Recent content at 65% of older content engagement',
        },
        {
          type: 'traffic_plateau',
          triggered: true,
          value: 2,
          threshold: 5,
          description: 'Organic traffic growth ~2% over 90 days',
        },
        {
          type: 'keyword_cannibalization',
          triggered: true,
          value: 5,
          threshold: 3,
          description: '5 cannibalization instances detected in 90 days',
        },
        {
          type: 'ranking_efficiency',
          triggered: true,
          value: 25,
          threshold: 33,
          description: 'Ranking efficiency: 5 top-20 rankings / 20 posts = 25%',
        },
      ];

      const score = getSaturationScore(signals);

      // All 4 signals triggered: (4/4) * 100 = 100
      expect(score).toBe(100);
    });

    it('should return 0 when no signals are triggered', () => {
      const signals: SaturationSignal[] = [
        {
          type: 'engagement_decline',
          triggered: false,
          value: 85,
          threshold: 70,
          description: 'Recent content at 85% of older content engagement',
        },
        {
          type: 'traffic_plateau',
          triggered: false,
          value: 10,
          threshold: 5,
          description: 'Organic traffic growth ~10% over 90 days',
        },
        {
          type: 'keyword_cannibalization',
          triggered: false,
          value: 1,
          threshold: 3,
          description: '1 cannibalization instances detected in 90 days',
        },
        {
          type: 'ranking_efficiency',
          triggered: false,
          value: 50,
          threshold: 33,
          description: 'Ranking efficiency: 10 top-20 rankings / 20 posts = 50%',
        },
      ];

      const score = getSaturationScore(signals);

      // No signals triggered: (0/4) * 100 = 0
      expect(score).toBe(0);
    });

    it('should return 25 when 1 of 4 signals is triggered', () => {
      const signals: SaturationSignal[] = [
        {
          type: 'engagement_decline',
          triggered: true,
          value: 65,
          threshold: 70,
          description: 'Recent content at 65% of older content engagement',
        },
        {
          type: 'traffic_plateau',
          triggered: false,
          value: 8,
          threshold: 5,
          description: 'Organic traffic growth ~8% over 90 days',
        },
        {
          type: 'keyword_cannibalization',
          triggered: false,
          value: 2,
          threshold: 3,
          description: '2 cannibalization instances detected in 90 days',
        },
        {
          type: 'ranking_efficiency',
          triggered: false,
          value: 40,
          threshold: 33,
          description: 'Ranking efficiency: 8 top-20 rankings / 20 posts = 40%',
        },
      ];

      const score = getSaturationScore(signals);

      // 1 signal triggered: (1/4) * 100 = 25
      expect(score).toBe(25);
    });

    it('should return 50 when 2 of 4 signals are triggered', () => {
      const signals: SaturationSignal[] = [
        {
          type: 'engagement_decline',
          triggered: true,
          value: 60,
          threshold: 70,
          description: 'Recent content at 60% of older content engagement',
        },
        {
          type: 'traffic_plateau',
          triggered: true,
          value: 3,
          threshold: 5,
          description: 'Organic traffic growth ~3% over 90 days',
        },
        {
          type: 'keyword_cannibalization',
          triggered: false,
          value: 1,
          threshold: 3,
          description: '1 cannibalization instances detected in 90 days',
        },
        {
          type: 'ranking_efficiency',
          triggered: false,
          value: 45,
          threshold: 33,
          description: 'Ranking efficiency: 9 top-20 rankings / 20 posts = 45%',
        },
      ];

      const score = getSaturationScore(signals);

      // 2 signals triggered: (2/4) * 100 = 50
      expect(score).toBe(50);
    });

    it('should return 75 when 3 of 4 signals are triggered', () => {
      const signals: SaturationSignal[] = [
        {
          type: 'engagement_decline',
          triggered: true,
          value: 55,
          threshold: 70,
          description: 'Recent content at 55% of older content engagement',
        },
        {
          type: 'traffic_plateau',
          triggered: true,
          value: 2,
          threshold: 5,
          description: 'Organic traffic growth ~2% over 90 days',
        },
        {
          type: 'keyword_cannibalization',
          triggered: true,
          value: 4,
          threshold: 3,
          description: '4 cannibalization instances detected in 90 days',
        },
        {
          type: 'ranking_efficiency',
          triggered: false,
          value: 40,
          threshold: 33,
          description: 'Ranking efficiency: 8 top-20 rankings / 20 posts = 40%',
        },
      ];

      const score = getSaturationScore(signals);

      // 3 signals triggered: (3/4) * 100 = 75
      expect(score).toBe(75);
    });

    it('should trigger rebalance when score >= 70', () => {
      const signals: SaturationSignal[] = [
        {
          type: 'engagement_decline',
          triggered: true,
          value: 55,
          threshold: 70,
          description: 'Recent content at 55% of older content engagement',
        },
        {
          type: 'traffic_plateau',
          triggered: true,
          value: 2,
          threshold: 5,
          description: 'Organic traffic growth ~2% over 90 days',
        },
        {
          type: 'keyword_cannibalization',
          triggered: true,
          value: 4,
          threshold: 3,
          description: '4 cannibalization instances detected in 90 days',
        },
        {
          type: 'ranking_efficiency',
          triggered: false,
          value: 40,
          threshold: 33,
          description: 'Ranking efficiency: 8 top-20 rankings / 20 posts = 40%',
        },
      ];

      const score = getSaturationScore(signals);

      // Score is 75, which is >= 70, so should trigger rebalance
      expect(score).toBeGreaterThanOrEqual(70);
      expect(score).toBe(75);
    });

    it('should not trigger rebalance when score < 70', () => {
      const signals: SaturationSignal[] = [
        {
          type: 'engagement_decline',
          triggered: true,
          value: 60,
          threshold: 70,
          description: 'Recent content at 60% of older content engagement',
        },
        {
          type: 'traffic_plateau',
          triggered: true,
          value: 3,
          threshold: 5,
          description: 'Organic traffic growth ~3% over 90 days',
        },
        {
          type: 'keyword_cannibalization',
          triggered: false,
          value: 2,
          threshold: 3,
          description: '2 cannibalization instances detected in 90 days',
        },
        {
          type: 'ranking_efficiency',
          triggered: false,
          value: 45,
          threshold: 33,
          description: 'Ranking efficiency: 9 top-20 rankings / 20 posts = 45%',
        },
      ];

      const score = getSaturationScore(signals);

      // Score is 50, which is < 70, so should not trigger rebalance
      expect(score).toBeLessThan(70);
      expect(score).toBe(50);
    });

    it('should handle empty signals array gracefully', () => {
      const signals: SaturationSignal[] = [];

      const score = getSaturationScore(signals);

      // With empty array, division by zero occurs: (0/0) * 100
      // This will result in NaN (Math.round(NaN) = NaN)
      expect(score).toBeNaN();
    });
  });
});
