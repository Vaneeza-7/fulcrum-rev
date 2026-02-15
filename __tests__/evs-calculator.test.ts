import { describe, it, expect } from 'vitest';
import { calculateEVS, calculateProfitabilityScore, allocateContentSlots } from '@/lib/content/evs-calculator';
import { EVSInput, ProfitabilityScore } from '@/lib/content/types';

describe('EVS Calculator', () => {
  describe('calculateEVS', () => {
    it('should calculate high EVS for high-value keyword', () => {
      const input: EVSInput = {
        searchVolume: 1000,
        difficulty: 30,
        dealSize: 50000,
        closeRate: 0.1,
        conversionRate: 0.02,
        ltv: 150000,
        cac: 15000,
        margin: 0.5,
        salesCycleDays: 45,
        contentCost: 500,
      };

      const result = calculateEVS(input);

      // Verify calculation steps:
      // revenuePerVisitor = 50000 * 0.1 * 0.02 = 100
      expect(result.revenuePerVisitor).toBe(100);

      // estimatedMonthlyTraffic = 1000 * (1 - 30/100) * 0.3 = 1000 * 0.7 * 0.3 = 210
      expect(result.estimatedMonthlyTraffic).toBe(210);

      // estimatedMonthlyRevenue = 210 * 100 = 21000
      expect(result.estimatedMonthlyRevenue).toBe(21000);

      // roi18Month = (21000 * 18 - 500) / 500 = (378000 - 500) / 500 = 755
      expect(result.roi18Month).toBe(755);

      // ltvCacRatio = 150000 / 15000 = 10
      expect(result.ltvCacRatio).toBe(10);

      // ltvCacMultiplier = min(10 / 3, 2.0) = min(3.33, 2.0) = 2.0
      // adjustedROI = 755 * 2.0 = 1510
      expect(result.adjustedROI).toBe(1510);

      // evs = min(1510 / 10, 100) = min(151, 100) = 100
      expect(result.evs).toBe(100);

      // tier should be 1 (80+)
      expect(result.tier).toBe(1);
    });

    it('should calculate low EVS for low-value keyword', () => {
      const input: EVSInput = {
        searchVolume: 50,
        difficulty: 80,
        dealSize: 5000,
        closeRate: 0.05,
        conversionRate: 0.01,
        ltv: 10000,
        cac: 8000,
        margin: 0.2,
        salesCycleDays: 60,
        contentCost: 500,
      };

      const result = calculateEVS(input);

      // revenuePerVisitor = 5000 * 0.05 * 0.01 = 2.5
      expect(result.revenuePerVisitor).toBe(2.5);

      // estimatedMonthlyTraffic = 50 * (1 - 80/100) * 0.3 = 50 * 0.2 * 0.3 = 3
      expect(result.estimatedMonthlyTraffic).toBe(3);

      // estimatedMonthlyRevenue = 3 * 2.5 = 7.5
      expect(result.estimatedMonthlyRevenue).toBe(7.5);

      // roi18Month = (7.5 * 18 - 500) / 500 = (135 - 500) / 500 = -0.73
      expect(result.roi18Month).toBe(-0.73);

      // ltvCacRatio = 10000 / 8000 = 1.25
      expect(result.ltvCacRatio).toBe(1.25);

      // ltvCacMultiplier = min(1.25 / 3, 2.0) = 0.4167
      // adjustedROI = -0.73 * 0.4167 = ~-0.3
      expect(result.adjustedROI).toBeCloseTo(-0.3, 1);

      // evs = max(min(-0.3 / 10, 100), 0) = max(-0.03, 0) = 0
      expect(result.evs).toBe(0);

      // tier should be 0 (<40)
      expect(result.tier).toBe(0);
    });

    it('should return EVS of 0 for zero search volume', () => {
      const input: EVSInput = {
        searchVolume: 0,
        difficulty: 30,
        dealSize: 50000,
        closeRate: 0.1,
        conversionRate: 0.02,
        ltv: 150000,
        cac: 15000,
        margin: 0.5,
        salesCycleDays: 45,
        contentCost: 500,
      };

      const result = calculateEVS(input);

      expect(result.estimatedMonthlyTraffic).toBe(0);
      expect(result.estimatedMonthlyRevenue).toBe(0);
      expect(result.evs).toBe(0);
      expect(result.tier).toBe(0);
    });

    it('should return EVS of 0 for 100% difficulty', () => {
      const input: EVSInput = {
        searchVolume: 1000,
        difficulty: 100,
        dealSize: 50000,
        closeRate: 0.1,
        conversionRate: 0.02,
        ltv: 150000,
        cac: 15000,
        margin: 0.5,
        salesCycleDays: 45,
        contentCost: 500,
      };

      const result = calculateEVS(input);

      // estimatedMonthlyTraffic = 1000 * (1 - 100/100) * 0.3 = 0
      expect(result.estimatedMonthlyTraffic).toBe(0);
      expect(result.estimatedMonthlyRevenue).toBe(0);
      expect(result.evs).toBe(0);
      expect(result.tier).toBe(0);
    });

    it('should default ltvCacRatio to 1 when CAC is zero', () => {
      const input: EVSInput = {
        searchVolume: 1000,
        difficulty: 30,
        dealSize: 50000,
        closeRate: 0.1,
        conversionRate: 0.02,
        ltv: 150000,
        cac: 0,
        margin: 0.5,
        salesCycleDays: 45,
        contentCost: 500,
      };

      const result = calculateEVS(input);

      // ltvCacRatio should be 1 (fallback)
      expect(result.ltvCacRatio).toBe(1);

      // ltvCacMultiplier = min(1 / 3, 2.0) = 0.33
      // This will reduce the adjustedROI significantly
      expect(result.adjustedROI).toBeGreaterThan(0);
    });

    it('should cap EVS at 100 for extreme inputs', () => {
      const input: EVSInput = {
        searchVolume: 100000,
        difficulty: 10,
        dealSize: 1000000,
        closeRate: 0.5,
        conversionRate: 0.1,
        ltv: 5000000,
        cac: 10000,
        margin: 0.9,
        salesCycleDays: 10,
        contentCost: 100,
      };

      const result = calculateEVS(input);

      // EVS should be capped at 100
      expect(result.evs).toBe(100);
      expect(result.tier).toBe(1);
    });

    it('should never return negative EVS', () => {
      const input: EVSInput = {
        searchVolume: 10,
        difficulty: 95,
        dealSize: 1000,
        closeRate: 0.01,
        conversionRate: 0.001,
        ltv: 2000,
        cac: 5000,
        margin: 0.05,
        salesCycleDays: 120,
        contentCost: 10000,
      };

      const result = calculateEVS(input);

      // EVS should never go below 0
      expect(result.evs).toBeGreaterThanOrEqual(0);
      expect(result.tier).toBe(0);
    });
  });

  describe('calculateProfitabilityScore', () => {
    it('should calculate high score for high-margin service', () => {
      const service = {
        id: 'svc-1',
        name: 'Premium Consulting',
        margin: 0.7,
        ltv: 100000,
        cac: 10000,
        dealSize: 80000,
        salesCycleDays: 30,
      };

      const result = calculateProfitabilityScore(service);

      expect(result.serviceId).toBe('svc-1');
      expect(result.serviceName).toBe('Premium Consulting');

      // marginComponent = 0.7 * 40 = 28
      expect(result.components.marginComponent).toBe(28);

      // ltvCacRatio = 100000 / 10000 = 10
      // ltvCacComponent = min(10 / 30, 1.0) * 30 = 0.333 * 30 = 10
      expect(result.components.ltvCacComponent).toBe(10);

      // dealSizeComponent = min(80000 / 100000, 1.0) * 20 = 0.8 * 20 = 16
      expect(result.components.dealSizeComponent).toBe(16);

      // speedComponent = (1 - 30/90) * 10 = 0.667 * 10 = 6.67
      expect(result.components.speedComponent).toBeCloseTo(6.67, 2);

      // total score = 28 + 10 + 16 + 6.67 = 60.67
      expect(result.score).toBeCloseTo(60.67, 2);

      // allocationPercentage should be 0 (not calculated yet)
      expect(result.allocationPercentage).toBe(0);
    });

    it('should calculate low score for low-margin service', () => {
      const service = {
        id: 'svc-2',
        name: 'Budget Product',
        margin: 0.1,
        ltv: 5000,
        cac: 5000,
        dealSize: 5000,
        salesCycleDays: 90,
      };

      const result = calculateProfitabilityScore(service);

      // marginComponent = 0.1 * 40 = 4
      expect(result.components.marginComponent).toBe(4);

      // ltvCacRatio = 5000 / 5000 = 1
      // ltvCacComponent = min(1 / 30, 1.0) * 30 = 0.033 * 30 = 1
      expect(result.components.ltvCacComponent).toBeCloseTo(1, 2);

      // dealSizeComponent = min(5000 / 100000, 1.0) * 20 = 0.05 * 20 = 1
      expect(result.components.dealSizeComponent).toBe(1);

      // speedComponent = (1 - 90/90) * 10 = 0
      expect(result.components.speedComponent).toBe(0);

      // total score = 4 + 1 + 1 + 0 = 6
      expect(result.score).toBeCloseTo(6, 2);
    });

    it('should give max speed component for sales cycle of 0', () => {
      const service = {
        id: 'svc-3',
        name: 'Instant Service',
        margin: 0.5,
        ltv: 50000,
        cac: 10000,
        dealSize: 40000,
        salesCycleDays: 0,
      };

      const result = calculateProfitabilityScore(service);

      // speedComponent = (1 - 0/90) * 10 = 1 * 10 = 10
      expect(result.components.speedComponent).toBe(10);
    });
  });

  describe('allocateContentSlots', () => {
    it('should distribute slots proportionally based on profitability scores', () => {
      const services: ProfitabilityScore[] = [
        {
          serviceId: 'svc-1',
          serviceName: 'Service A',
          score: 60,
          components: {
            marginComponent: 28,
            ltvCacComponent: 10,
            dealSizeComponent: 16,
            speedComponent: 6,
          },
          allocationPercentage: 0,
        },
        {
          serviceId: 'svc-2',
          serviceName: 'Service B',
          score: 30,
          components: {
            marginComponent: 12,
            ltvCacComponent: 8,
            dealSizeComponent: 6,
            speedComponent: 4,
          },
          allocationPercentage: 0,
        },
        {
          serviceId: 'svc-3',
          serviceName: 'Service C',
          score: 10,
          components: {
            marginComponent: 4,
            ltvCacComponent: 2,
            dealSizeComponent: 2,
            speedComponent: 2,
          },
          allocationPercentage: 0,
        },
      ];

      const result = allocateContentSlots(services, 100);

      // Total score = 60 + 30 + 10 = 100
      // Service A: 60/100 = 60%
      expect(result[0].allocationPercentage).toBe(60);

      // Service B: 30/100 = 30%
      expect(result[1].allocationPercentage).toBe(30);

      // Service C: 10/100 = 10%
      expect(result[2].allocationPercentage).toBe(10);

      // Total should be 100%
      const totalAllocation = result.reduce((sum, s) => sum + s.allocationPercentage, 0);
      expect(totalAllocation).toBe(100);
    });
  });
});
