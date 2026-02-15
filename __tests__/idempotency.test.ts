import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindFirst, mockCreate } = vi.hoisted(() => ({
  mockFindFirst: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    auditLog: {
      findFirst: mockFindFirst,
      create: mockCreate,
    },
  },
}));

import { hasJobRunForPeriod, markJobComplete } from '@/lib/jobs/idempotency';

describe('idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('hasJobRunForPeriod', () => {
    it('should return false when no matching record exists', async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await hasJobRunForPeriod('daily-sync', 'daily');

      expect(result).toBe(false);
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          actionType: 'job_completed_daily-sync',
          createdAt: { gte: expect.any(Date) },
        },
      });
    });

    it('should return true when matching record exists in current period', async () => {
      mockFindFirst.mockResolvedValue({
        id: '1',
        actionType: 'job_completed_weekly-report',
        createdAt: new Date(),
        tenantId: 'tenant-123',
      });

      const result = await hasJobRunForPeriod(
        'weekly-report',
        'weekly',
        'tenant-123'
      );

      expect(result).toBe(true);
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          actionType: 'job_completed_weekly-report',
          tenantId: 'tenant-123',
          createdAt: { gte: expect.any(Date) },
        },
      });
    });
  });

  describe('markJobComplete', () => {
    it('should create an audit log entry with correct actionType', async () => {
      mockCreate.mockResolvedValue({
        id: '1',
        actionType: 'job_completed_monthly-cleanup',
        createdAt: new Date(),
        tenantId: null,
        details: {},
      });

      await markJobComplete('monthly-cleanup');

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          tenantId: null,
          actionType: 'job_completed_monthly-cleanup',
          details: {},
        },
      });
    });

    it('should include tenantId and details when provided', async () => {
      const details = { recordsProcessed: 42, duration: 1500 };

      mockCreate.mockResolvedValue({
        id: '2',
        actionType: 'job_completed_data-export',
        createdAt: new Date(),
        tenantId: 'tenant-456',
        details,
      });

      await markJobComplete('data-export', 'tenant-456', details);

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          tenantId: 'tenant-456',
          actionType: 'job_completed_data-export',
          details,
        },
      });
    });
  });

  describe('period calculations', () => {
    it('should calculate daily period start as midnight UTC of current day', async () => {
      mockFindFirst.mockResolvedValue(null);

      await hasJobRunForPeriod('test-job', 'daily');

      const callArgs = mockFindFirst.mock.calls[0][0];
      const periodStart = callArgs.where.createdAt.gte;

      // Verify it's midnight UTC today
      expect(periodStart.getUTCHours()).toBe(0);
      expect(periodStart.getUTCMinutes()).toBe(0);
      expect(periodStart.getUTCSeconds()).toBe(0);
      expect(periodStart.getUTCMilliseconds()).toBe(0);

      const now = new Date();
      expect(periodStart.getUTCFullYear()).toBe(now.getUTCFullYear());
      expect(periodStart.getUTCMonth()).toBe(now.getUTCMonth());
      expect(periodStart.getUTCDate()).toBe(now.getUTCDate());
    });

    it('should calculate weekly period start as Monday midnight UTC', async () => {
      mockFindFirst.mockResolvedValue(null);

      await hasJobRunForPeriod('test-job', 'weekly');

      const callArgs = mockFindFirst.mock.calls[0][0];
      const periodStart = callArgs.where.createdAt.gte;

      // Verify it's midnight UTC
      expect(periodStart.getUTCHours()).toBe(0);
      expect(periodStart.getUTCMinutes()).toBe(0);
      expect(periodStart.getUTCSeconds()).toBe(0);
      expect(periodStart.getUTCMilliseconds()).toBe(0);

      // Verify it's a Monday (getUTCDay() returns 1 for Monday)
      expect(periodStart.getUTCDay()).toBe(1);
    });

    it('should calculate monthly period start as 1st of month midnight UTC', async () => {
      mockFindFirst.mockResolvedValue(null);

      await hasJobRunForPeriod('test-job', 'monthly');

      const callArgs = mockFindFirst.mock.calls[0][0];
      const periodStart = callArgs.where.createdAt.gte;

      // Verify it's the 1st of the month at midnight UTC
      expect(periodStart.getUTCDate()).toBe(1);
      expect(periodStart.getUTCHours()).toBe(0);
      expect(periodStart.getUTCMinutes()).toBe(0);
      expect(periodStart.getUTCSeconds()).toBe(0);
      expect(periodStart.getUTCMilliseconds()).toBe(0);

      const now = new Date();
      expect(periodStart.getUTCFullYear()).toBe(now.getUTCFullYear());
      expect(periodStart.getUTCMonth()).toBe(now.getUTCMonth());
    });

    it('should calculate biweekly period start correctly', async () => {
      mockFindFirst.mockResolvedValue(null);

      await hasJobRunForPeriod('test-job', 'biweekly');

      const callArgs = mockFindFirst.mock.calls[0][0];
      const periodStart = callArgs.where.createdAt.gte;

      // Verify it's midnight UTC
      expect(periodStart.getUTCHours()).toBe(0);
      expect(periodStart.getUTCMinutes()).toBe(0);
      expect(periodStart.getUTCSeconds()).toBe(0);
      expect(periodStart.getUTCMilliseconds()).toBe(0);

      // Verify it's either 1st or 15th of the month
      const date = periodStart.getUTCDate();
      expect([1, 15]).toContain(date);

      const now = new Date();
      const currentDay = now.getUTCDate();

      // If current day is 1-14, period should start on 1st
      // If current day is 15-31, period should start on 15th
      if (currentDay <= 14) {
        expect(date).toBe(1);
      } else {
        expect(date).toBe(15);
      }
    });
  });
});
