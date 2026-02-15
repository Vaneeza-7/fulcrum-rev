import { describe, it, expect, vi, beforeEach } from 'vitest';
import { detectClawback } from '@/lib/icm/clawback-manager';
import type { ClawbackTrigger } from '@/lib/icm/types';

// Mock the database
vi.mock('@/lib/db', () => ({
  prisma: {
    commissionTracker: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    commissionLedger: {
      update: vi.fn(),
    },
    clawback: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
  auditLog: vi.fn(),
}));

import { prisma } from '@/lib/db';

// Helper to create a mock tracker with specific payment date
function createMockTracker(daysSincePayment: number) {
  const now = new Date();
  const paymentDate = new Date(now.getTime() - daysSincePayment * 24 * 60 * 60 * 1000);

  return {
    id: 'tracker-123',
    tenantId: 'tenant-abc',
    status: 'calculated',
    dealName: 'Test Deal',
    dealValue: 100000,
    closedWonAt: paymentDate,
    match3At: paymentDate,
    attributionProof: {},
    tenant: {
      id: 'tenant-abc',
      name: 'Test Tenant',
      rsaConfig: null,
    },
    ledger: [
      {
        id: 'ledger-456',
        calculatedAmount: 10000,
        dealValue: 100000,
        createdAt: paymentDate,
        status: 'active',
      },
    ],
  };
}

// Helper to get the clawback created in the last call
function getLastClawbackCreated() {
  const createMock = vi.mocked(prisma.clawback.create);
  const lastCall = createMock.mock.calls[createMock.mock.calls.length - 1];
  return lastCall?.[0]?.data;
}

describe('Clawback Manager - Full Clawback Window (0-30 days)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies 100% clawback at day 0', async () => {
    const tracker = createMockTracker(0);
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);
    vi.mocked(prisma.clawback.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionLedger.update).mockResolvedValue({} as any);

    const result = await detectClawback('tracker-123', 'refund', new Date());

    expect(result).not.toBeNull();
    expect(result?.clawbackRate).toBe(1.0);
    expect(result?.clawbackAmount).toBe(10000);
    expect(result?.policyApplied).toBe('full');
    expect(result?.daysSincePayment).toBe(0);

    const clawback = getLastClawbackCreated();
    expect(clawback?.clawbackAmount).toBe(10000);
    expect(clawback?.clawbackRate).toBe(1.0);
    expect(clawback?.policyApplied).toBe('full');
  });

  it('applies 100% clawback at day 15', async () => {
    const tracker = createMockTracker(15);
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);
    vi.mocked(prisma.clawback.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionLedger.update).mockResolvedValue({} as any);

    const result = await detectClawback('tracker-123', 'cancellation', new Date());

    expect(result).not.toBeNull();
    expect(result?.clawbackRate).toBe(1.0);
    expect(result?.clawbackAmount).toBe(10000);
    expect(result?.policyApplied).toBe('full');
    expect(result?.daysSincePayment).toBe(15);

    const clawback = getLastClawbackCreated();
    expect(clawback?.clawbackAmount).toBe(10000);
    expect(clawback?.clawbackRate).toBe(1.0);
  });

  it('applies 100% clawback at day 30 (boundary)', async () => {
    const tracker = createMockTracker(30);
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);
    vi.mocked(prisma.clawback.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionLedger.update).mockResolvedValue({} as any);

    const result = await detectClawback('tracker-123', 'churn', new Date());

    expect(result).not.toBeNull();
    expect(result?.clawbackRate).toBe(1.0);
    expect(result?.clawbackAmount).toBe(10000);
    expect(result?.policyApplied).toBe('full');
    expect(result?.daysSincePayment).toBe(30);
  });
});

describe('Clawback Manager - Prorated Window (31-90 days)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies ~98.3% clawback at day 31', async () => {
    const tracker = createMockTracker(31);
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);
    vi.mocked(prisma.clawback.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionLedger.update).mockResolvedValue({} as any);

    const result = await detectClawback('tracker-123', 'refund', new Date());

    expect(result).not.toBeNull();
    expect(result?.policyApplied).toBe('prorated');
    expect(result?.daysSincePayment).toBe(31);

    // daysIntoProratedWindow = 31 - 30 = 1
    // daysInProratedWindow = 90 - 30 = 60
    // clawbackRate = 1.0 - (1 / 60) = 0.9833
    expect(result?.clawbackRate).toBeCloseTo(0.9833, 4);
    expect(result?.clawbackAmount).toBeCloseTo(9833.33, 2);

    const clawback = getLastClawbackCreated();
    expect(clawback?.policyApplied).toBe('prorated');
  });

  it('applies 50% clawback at day 60 (midpoint)', async () => {
    const tracker = createMockTracker(60);
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);
    vi.mocked(prisma.clawback.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionLedger.update).mockResolvedValue({} as any);

    const result = await detectClawback('tracker-123', 'deal_reversal', new Date());

    expect(result).not.toBeNull();
    expect(result?.policyApplied).toBe('prorated');
    expect(result?.daysSincePayment).toBe(60);

    // daysIntoProratedWindow = 60 - 30 = 30
    // daysInProratedWindow = 90 - 30 = 60
    // clawbackRate = 1.0 - (30 / 60) = 0.5
    expect(result?.clawbackRate).toBe(0.5);
    expect(result?.clawbackAmount).toBe(5000);

    const clawback = getLastClawbackCreated();
    expect(clawback?.clawbackAmount).toBe(5000);
    expect(clawback?.clawbackRate).toBe(0.5);
  });

  it('applies ~1.67% clawback at day 89', async () => {
    const tracker = createMockTracker(89);
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);
    vi.mocked(prisma.clawback.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionLedger.update).mockResolvedValue({} as any);

    const result = await detectClawback('tracker-123', 'invoice_void', new Date());

    expect(result).not.toBeNull();
    expect(result?.policyApplied).toBe('prorated');
    expect(result?.daysSincePayment).toBe(89);

    // daysIntoProratedWindow = 89 - 30 = 59
    // daysInProratedWindow = 90 - 30 = 60
    // clawbackRate = 1.0 - (59 / 60) = 0.0167
    expect(result?.clawbackRate).toBeCloseTo(0.0167, 4);
    expect(result?.clawbackAmount).toBeCloseTo(166.67, 2);

    const clawback = getLastClawbackCreated();
    expect(clawback?.policyApplied).toBe('prorated');
  });

  it('applies 0% clawback at day 90 (boundary edge case)', async () => {
    const tracker = createMockTracker(90);
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);
    vi.mocked(prisma.clawback.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionLedger.update).mockResolvedValue({} as any);

    const result = await detectClawback('tracker-123', 'refund', new Date());

    expect(result).not.toBeNull();
    expect(result?.policyApplied).toBe('prorated');
    expect(result?.daysSincePayment).toBe(90);

    // daysIntoProratedWindow = 90 - 30 = 60
    // daysInProratedWindow = 90 - 30 = 60
    // clawbackRate = 1.0 - (60 / 60) = 0.0
    expect(result?.clawbackRate).toBe(0);
    expect(result?.clawbackAmount).toBe(0);
  });
});

describe('Clawback Manager - No Clawback Window (91+ days)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('applies no clawback at day 91', async () => {
    const tracker = createMockTracker(91);
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);

    const result = await detectClawback('tracker-123', 'cancellation', new Date());

    expect(result).toBeNull();
    expect(prisma.clawback.create).not.toHaveBeenCalled();
    expect(prisma.commissionTracker.update).not.toHaveBeenCalled();
  });

  it('applies no clawback at day 180', async () => {
    const tracker = createMockTracker(180);
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);

    const result = await detectClawback('tracker-123', 'refund', new Date());

    expect(result).toBeNull();
    expect(prisma.clawback.create).not.toHaveBeenCalled();
    expect(prisma.commissionTracker.update).not.toHaveBeenCalled();
  });
});

describe('Clawback Manager - Trigger Types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles cancellation trigger', async () => {
    const tracker = createMockTracker(15);
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);
    vi.mocked(prisma.clawback.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionLedger.update).mockResolvedValue({} as any);

    const result = await detectClawback('tracker-123', 'cancellation', new Date());

    expect(result).not.toBeNull();
    const clawback = getLastClawbackCreated();
    expect(clawback?.triggerType).toBe('cancellation');
  });

  it('handles refund trigger', async () => {
    const tracker = createMockTracker(15);
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);
    vi.mocked(prisma.clawback.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionLedger.update).mockResolvedValue({} as any);

    const result = await detectClawback('tracker-123', 'refund', new Date());

    expect(result).not.toBeNull();
    const clawback = getLastClawbackCreated();
    expect(clawback?.triggerType).toBe('refund');
  });

  it('handles churn trigger', async () => {
    const tracker = createMockTracker(15);
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);
    vi.mocked(prisma.clawback.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionLedger.update).mockResolvedValue({} as any);

    const result = await detectClawback('tracker-123', 'churn', new Date());

    expect(result).not.toBeNull();
    const clawback = getLastClawbackCreated();
    expect(clawback?.triggerType).toBe('churn');
  });

  it('handles deal_reversal trigger', async () => {
    const tracker = createMockTracker(15);
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);
    vi.mocked(prisma.clawback.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionLedger.update).mockResolvedValue({} as any);

    const result = await detectClawback('tracker-123', 'deal_reversal', new Date());

    expect(result).not.toBeNull();
    const clawback = getLastClawbackCreated();
    expect(clawback?.triggerType).toBe('deal_reversal');
  });

  it('handles invoice_void trigger', async () => {
    const tracker = createMockTracker(15);
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);
    vi.mocked(prisma.clawback.create).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionLedger.update).mockResolvedValue({} as any);

    const result = await detectClawback('tracker-123', 'invoice_void', new Date());

    expect(result).not.toBeNull();
    const clawback = getLastClawbackCreated();
    expect(clawback?.triggerType).toBe('invoice_void');
  });
});
