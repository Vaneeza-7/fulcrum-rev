import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateCommission } from '@/lib/icm/commission-calculator';
import type { CommissionCalculation } from '@/lib/icm/types';

// Mock Prisma and retry module
vi.mock('@/lib/db', () => ({
  prisma: {
    commissionTracker: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    commissionLedger: {
      create: vi.fn(),
    },
  },
  auditLog: vi.fn(),
}));

vi.mock('@/lib/retry', () => ({
  withRetry: vi.fn((fn) => fn()),
}));

// Import mocked prisma
import { prisma } from '@/lib/db';

// =============================================================================
// TIER SELECTION TESTS
// =============================================================================
describe('tier selection based on deal value', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects standard tier (10%) for $30,000 deal', async () => {
    const mockTracker = {
      id: 'tracker_1',
      tenantId: 'tenant_1',
      status: 'ready_for_calculation',
      dealValue: 30000,
      closedWonAt: new Date('2026-01-15'),
      cancellationWindowEndsAt: new Date('2026-01-01'), // Past date
      attributionProof: {},
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);
    vi.mocked(prisma.commissionLedger.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result = await calculateCommission('tracker_1');

    expect(result).toBeTruthy();
    expect(result?.tier.name).toBe('standard');
    expect(result?.tier.rate).toBe(0.10);
    expect(result?.commissionRate).toBe(0.10);
  });

  it('selects growth tier (8%) for $80,000 deal', async () => {
    const mockTracker = {
      id: 'tracker_2',
      tenantId: 'tenant_1',
      status: 'ready_for_calculation',
      dealValue: 80000,
      closedWonAt: new Date('2026-01-15'),
      cancellationWindowEndsAt: new Date('2026-01-01'),
      attributionProof: {},
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);
    vi.mocked(prisma.commissionLedger.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result = await calculateCommission('tracker_2');

    expect(result).toBeTruthy();
    expect(result?.tier.name).toBe('growth');
    expect(result?.tier.rate).toBe(0.08);
    expect(result?.commissionRate).toBe(0.08);
  });

  it('selects enterprise tier (6%) for $200,000 deal', async () => {
    const mockTracker = {
      id: 'tracker_3',
      tenantId: 'tenant_1',
      status: 'ready_for_calculation',
      dealValue: 200000,
      closedWonAt: new Date('2026-01-15'),
      cancellationWindowEndsAt: new Date('2026-01-01'),
      attributionProof: {},
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);
    vi.mocked(prisma.commissionLedger.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result = await calculateCommission('tracker_3');

    expect(result).toBeTruthy();
    expect(result?.tier.name).toBe('enterprise');
    expect(result?.tier.rate).toBe(0.06);
    expect(result?.commissionRate).toBe(0.06);
  });

  it('selects growth tier (8%) for $50,000 boundary (at min of growth)', async () => {
    const mockTracker = {
      id: 'tracker_4',
      tenantId: 'tenant_1',
      status: 'ready_for_calculation',
      dealValue: 50000,
      closedWonAt: new Date('2026-01-15'),
      cancellationWindowEndsAt: new Date('2026-01-01'),
      attributionProof: {},
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);
    vi.mocked(prisma.commissionLedger.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result = await calculateCommission('tracker_4');

    expect(result).toBeTruthy();
    expect(result?.tier.name).toBe('growth');
    expect(result?.tier.rate).toBe(0.08);
    expect(result?.commissionRate).toBe(0.08);
  });

  it('selects enterprise tier (6%) for $150,000 boundary (at min of enterprise)', async () => {
    const mockTracker = {
      id: 'tracker_5',
      tenantId: 'tenant_1',
      status: 'ready_for_calculation',
      dealValue: 150000,
      closedWonAt: new Date('2026-01-15'),
      cancellationWindowEndsAt: new Date('2026-01-01'),
      attributionProof: {},
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);
    vi.mocked(prisma.commissionLedger.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result = await calculateCommission('tracker_5');

    expect(result).toBeTruthy();
    expect(result?.tier.name).toBe('enterprise');
    expect(result?.tier.rate).toBe(0.06);
    expect(result?.commissionRate).toBe(0.06);
  });
});

// =============================================================================
// COMMISSION CALCULATION TESTS
// =============================================================================
describe('commission amount calculation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calculates $3,000 commission for $30,000 × 10%', async () => {
    const mockTracker = {
      id: 'tracker_calc_1',
      tenantId: 'tenant_1',
      status: 'ready_for_calculation',
      dealValue: 30000,
      closedWonAt: new Date('2026-01-15'),
      cancellationWindowEndsAt: new Date('2026-01-01'),
      attributionProof: {},
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);
    vi.mocked(prisma.commissionLedger.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result = await calculateCommission('tracker_calc_1');

    expect(result).toBeTruthy();
    expect(result?.dealValue).toBe(30000);
    expect(result?.commissionRate).toBe(0.10);
    expect(result?.calculatedAmount).toBe(3000);
  });

  it('calculates $6,400 commission for $80,000 × 8%', async () => {
    const mockTracker = {
      id: 'tracker_calc_2',
      tenantId: 'tenant_1',
      status: 'ready_for_calculation',
      dealValue: 80000,
      closedWonAt: new Date('2026-01-15'),
      cancellationWindowEndsAt: new Date('2026-01-01'),
      attributionProof: {},
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);
    vi.mocked(prisma.commissionLedger.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result = await calculateCommission('tracker_calc_2');

    expect(result).toBeTruthy();
    expect(result?.dealValue).toBe(80000);
    expect(result?.commissionRate).toBe(0.08);
    expect(result?.calculatedAmount).toBe(6400);
  });

  it('calculates $12,000 commission for $200,000 × 6%', async () => {
    const mockTracker = {
      id: 'tracker_calc_3',
      tenantId: 'tenant_1',
      status: 'ready_for_calculation',
      dealValue: 200000,
      closedWonAt: new Date('2026-01-15'),
      cancellationWindowEndsAt: new Date('2026-01-01'),
      attributionProof: {},
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);
    vi.mocked(prisma.commissionLedger.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result = await calculateCommission('tracker_calc_3');

    expect(result).toBeTruthy();
    expect(result?.dealValue).toBe(200000);
    expect(result?.commissionRate).toBe(0.06);
    expect(result?.calculatedAmount).toBe(12000);
  });
});

// =============================================================================
// QUARTER KEY TESTS
// =============================================================================
describe('quarter key generation from date', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps January to Q1', async () => {
    const mockTracker = {
      id: 'tracker_q1',
      tenantId: 'tenant_1',
      status: 'ready_for_calculation',
      dealValue: 50000,
      closedWonAt: new Date('2026-01-15'), // January
      cancellationWindowEndsAt: new Date('2026-01-01'),
      attributionProof: {},
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);
    vi.mocked(prisma.commissionLedger.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result = await calculateCommission('tracker_q1');

    expect(result).toBeTruthy();
    expect(result?.quarterKey).toBe('2026-Q1');
  });

  it('maps April to Q2', async () => {
    const mockTracker = {
      id: 'tracker_q2',
      tenantId: 'tenant_1',
      status: 'ready_for_calculation',
      dealValue: 50000,
      closedWonAt: new Date('2026-04-15'), // April
      cancellationWindowEndsAt: new Date('2026-01-01'),
      attributionProof: {},
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);
    vi.mocked(prisma.commissionLedger.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result = await calculateCommission('tracker_q2');

    expect(result).toBeTruthy();
    expect(result?.quarterKey).toBe('2026-Q2');
  });

  it('maps July to Q3', async () => {
    const mockTracker = {
      id: 'tracker_q3',
      tenantId: 'tenant_1',
      status: 'ready_for_calculation',
      dealValue: 50000,
      closedWonAt: new Date('2026-07-15'), // July
      cancellationWindowEndsAt: new Date('2026-01-01'),
      attributionProof: {},
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);
    vi.mocked(prisma.commissionLedger.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result = await calculateCommission('tracker_q3');

    expect(result).toBeTruthy();
    expect(result?.quarterKey).toBe('2026-Q3');
  });

  it('maps October to Q4', async () => {
    const mockTracker = {
      id: 'tracker_q4',
      tenantId: 'tenant_1',
      status: 'ready_for_calculation',
      dealValue: 50000,
      closedWonAt: new Date('2026-10-15'), // October
      cancellationWindowEndsAt: new Date('2026-01-01'),
      attributionProof: {},
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);
    vi.mocked(prisma.commissionLedger.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result = await calculateCommission('tracker_q4');

    expect(result).toBeTruthy();
    expect(result?.quarterKey).toBe('2026-Q4');
  });
});

// =============================================================================
// INTEGRITY HASH TESTS
// =============================================================================
describe('integrity hash generation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('generates SHA-256 hash with 64 hex characters', async () => {
    const mockTracker = {
      id: 'tracker_hash_1',
      tenantId: 'tenant_1',
      status: 'ready_for_calculation',
      dealValue: 50000,
      closedWonAt: new Date('2026-01-15'),
      cancellationWindowEndsAt: new Date('2026-01-01'),
      attributionProof: {},
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);
    vi.mocked(prisma.commissionLedger.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result = await calculateCommission('tracker_hash_1');

    expect(result).toBeTruthy();
    expect(result?.integrityHash).toBeTruthy();
    expect(result?.integrityHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates deterministic hash for same inputs', async () => {
    const mockTracker = {
      id: 'tracker_hash_2',
      tenantId: 'tenant_1',
      status: 'ready_for_calculation',
      dealValue: 75000,
      closedWonAt: new Date('2026-02-10'),
      cancellationWindowEndsAt: new Date('2026-01-01'),
      attributionProof: {},
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);
    vi.mocked(prisma.commissionLedger.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result1 = await calculateCommission('tracker_hash_2');

    // Reset mocks and calculate again with same data
    vi.clearAllMocks();
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);
    vi.mocked(prisma.commissionLedger.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result2 = await calculateCommission('tracker_hash_2');

    expect(result1?.integrityHash).toBe(result2?.integrityHash);
  });
});

// =============================================================================
// GUARD CONDITION TESTS
// =============================================================================
describe('guard conditions and status checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when tracker status is not ready_for_calculation', async () => {
    const mockTracker = {
      id: 'tracker_wrong_status',
      tenantId: 'tenant_1',
      status: 'tracking', // Wrong status
      dealValue: 50000,
      closedWonAt: new Date('2026-01-15'),
      cancellationWindowEndsAt: new Date('2026-01-01'),
      attributionProof: {},
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);

    const result = await calculateCommission('tracker_wrong_status');

    expect(result).toBeNull();
    // Should not create ledger entry or update tracker
    expect(prisma.commissionLedger.create).not.toHaveBeenCalled();
    expect(prisma.commissionTracker.update).not.toHaveBeenCalled();
  });

  it('returns null when cancellation window has not passed', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10); // 10 days in the future

    const mockTracker = {
      id: 'tracker_in_window',
      tenantId: 'tenant_1',
      status: 'ready_for_calculation',
      dealValue: 50000,
      closedWonAt: new Date('2026-01-15'),
      cancellationWindowEndsAt: futureDate, // Still in cancellation window
      attributionProof: {},
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);

    const result = await calculateCommission('tracker_in_window');

    expect(result).toBeNull();
    // Should not create ledger entry or update tracker
    expect(prisma.commissionLedger.create).not.toHaveBeenCalled();
    expect(prisma.commissionTracker.update).not.toHaveBeenCalled();
  });
});

// =============================================================================
// FULL COMMISSION CALCULATION OBJECT TEST
// =============================================================================
describe('full commission calculation object', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns complete CommissionCalculation object with all required fields', async () => {
    const mockAttributionProof = {
      fulcrumLeadId: 'lead_123',
      fulcrumAlertAt: '2026-01-01T10:00:00Z',
      firstCrmActivityAt: '2026-01-02T10:00:00Z',
      leadDiscoveredAt: '2025-12-28T10:00:00Z',
      leadPushedToCrmAt: '2025-12-29T10:00:00Z',
      matchMethod: 'exact_crm_id' as const,
      matchConfidence: 0.95,
    };

    const mockTracker = {
      id: 'tracker_full',
      tenantId: 'tenant_1',
      status: 'ready_for_calculation',
      dealValue: 100000,
      closedWonAt: new Date('2026-01-15'),
      cancellationWindowEndsAt: new Date('2026-01-01'),
      attributionProof: mockAttributionProof,
      tenant: {
        rsaConfig: null,
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(mockTracker as any);
    vi.mocked(prisma.commissionLedger.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result = await calculateCommission('tracker_full');

    expect(result).toBeTruthy();

    // Verify all required fields
    expect(result?.dealValue).toBe(100000);
    expect(result?.tier).toMatchObject({
      name: 'growth',
      minDealValue: 50000,
      maxDealValue: 150000,
      rate: 0.08,
    });
    expect(result?.commissionRate).toBe(0.08);
    expect(result?.calculatedAmount).toBe(8000);
    expect(result?.quarterKey).toBe('2026-Q1');

    // Verify calculationProof
    expect(result?.calculationProof).toBeTruthy();
    expect(result?.calculationProof.formula).toContain('100000');
    expect(result?.calculationProof.formula).toContain('0.08');
    expect(result?.calculationProof.formula).toContain('8000');
    expect(result?.calculationProof.inputs).toMatchObject({
      dealValue: 100000,
      commissionRate: 0.08,
      calculatedAmount: 8000,
    });
    expect(result?.calculationProof.rsaVersion).toMatch(/^rsa_tenant_1_\d{4}-\d{2}-\d{2}$/);

    // Verify attributionProof
    expect(result?.attributionProof).toMatchObject(mockAttributionProof);

    // Verify rsaTermsSnapshot
    expect(result?.rsaTermsSnapshot).toBeTruthy();
    expect(result?.rsaTermsSnapshot.tiers).toHaveLength(3);
    expect(result?.rsaTermsSnapshot.cancellationWindowDays).toBe(30);
    expect(result?.rsaTermsSnapshot.paymentSchedule).toBe('quarterly');

    // Verify integrityHash
    expect(result?.integrityHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
