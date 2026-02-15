import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fileDispute, attemptAutoResolution, resolveDispute } from '@/lib/icm/dispute-handler';
import type { DisputeResolution } from '@/lib/icm/types';

// Mock the database
vi.mock('@/lib/db', () => ({
  prisma: {
    commissionTracker: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    dispute: {
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    commissionLedger: {
      findFirst: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
  auditLog: vi.fn(),
}));

import { prisma } from '@/lib/db';

// Helper to create mock tracker
function createMockTracker(attributionProof: Record<string, unknown> = {}) {
  return {
    id: 'tracker-123',
    tenantId: 'tenant-abc',
    dealName: 'Test Deal',
    dealValue: 100000,
    status: 'calculated',
    attributionProof,
    tenant: {
      id: 'tenant-abc',
      name: 'Test Tenant',
    },
  };
}

// Helper to create mock dispute
function createMockDispute(
  disputeType: string,
  evidence: Record<string, unknown> = {}
) {
  return {
    id: 'dispute-456',
    tenantId: 'tenant-abc',
    trackerId: 'tracker-123',
    disputeType,
    status: 'open',
    clientReason: 'Test dispute reason',
    evidence,
    tracker: {
      id: 'tracker-123',
      dealValue: 100000,
    },
  };
}

describe('Dispute Handler - Attribution Challenge Auto-Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-resolves when Fulcrum alert is before CRM activity', async () => {
    const evidence = {
      clientClaim: 'We found this lead ourselves',
      fulcrumEvidence: {
        fulcrumAlertAt: '2024-01-01T10:00:00Z',
        pushedToCrmAt: '2024-01-02T10:00:00Z',
      },
      autoResolutionAttempted: false,
    };

    const dispute = createMockDispute('attribution_challenge', evidence);
    vi.mocked(prisma.dispute.findUniqueOrThrow).mockResolvedValue(dispute as any);
    vi.mocked(prisma.dispute.update).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result = await attemptAutoResolution('dispute-456');

    expect(result).toBe(true);
    expect(prisma.dispute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dispute-456' },
        data: expect.objectContaining({
          status: 'auto_resolved',
          resolvedBy: 'auto',
        }),
      })
    );

    // Verify tracker status restored
    expect(prisma.commissionTracker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tracker-123' },
        data: expect.objectContaining({
          status: 'calculated',
        }),
      })
    );
  });

  it('escalates when no Fulcrum alert timestamp', async () => {
    const evidence = {
      clientClaim: 'We found this lead ourselves',
      fulcrumEvidence: {
        pushedToCrmAt: '2024-01-02T10:00:00Z',
      },
      autoResolutionAttempted: false,
    };

    const dispute = createMockDispute('attribution_challenge', evidence);
    vi.mocked(prisma.dispute.findUniqueOrThrow).mockResolvedValue(dispute as any);
    vi.mocked(prisma.dispute.update).mockResolvedValue({} as any);

    const result = await attemptAutoResolution('dispute-456');

    expect(result).toBe(false);
    expect(prisma.dispute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dispute-456' },
        data: expect.objectContaining({
          status: 'escalated',
        }),
      })
    );
  });

  it('escalates when timeline is ambiguous (alert after CRM)', async () => {
    const evidence = {
      clientClaim: 'We found this lead ourselves',
      fulcrumEvidence: {
        fulcrumAlertAt: '2024-01-03T10:00:00Z',
        pushedToCrmAt: '2024-01-02T10:00:00Z',
      },
      autoResolutionAttempted: false,
    };

    const dispute = createMockDispute('attribution_challenge', evidence);
    vi.mocked(prisma.dispute.findUniqueOrThrow).mockResolvedValue(dispute as any);
    vi.mocked(prisma.dispute.update).mockResolvedValue({} as any);

    const result = await attemptAutoResolution('dispute-456');

    expect(result).toBe(false);
    expect(prisma.dispute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dispute-456' },
        data: expect.objectContaining({
          status: 'escalated',
        }),
      })
    );
  });
});

describe('Dispute Handler - Value Discrepancy Auto-Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-resolves within 2% tolerance (1% discrepancy)', async () => {
    const evidence = {
      clientClaim: 'Deal value is incorrect',
      fulcrumEvidence: {},
      autoResolutionAttempted: false,
    };

    const dispute = createMockDispute('value_discrepancy', evidence);
    const tracker = {
      id: 'tracker-123',
      dealValue: 100000,
    };
    const ledger = {
      id: 'ledger-789',
      trackerId: 'tracker-123',
      dealValue: 99000, // 1% difference
      calculatedAmount: 9900,
    };

    vi.mocked(prisma.dispute.findUniqueOrThrow).mockResolvedValue(dispute as any);
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);
    vi.mocked(prisma.commissionLedger.findFirst).mockResolvedValue(ledger as any);
    vi.mocked(prisma.dispute.update).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    const result = await attemptAutoResolution('dispute-456');

    expect(result).toBe(true);
    expect(prisma.dispute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dispute-456' },
        data: expect.objectContaining({
          status: 'auto_resolved',
          resolvedBy: 'auto',
        }),
      })
    );

    expect(prisma.commissionTracker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tracker-123' },
        data: expect.objectContaining({
          status: 'calculated',
        }),
      })
    );
  });

  it('escalates when >2% tolerance (5% discrepancy)', async () => {
    const evidence = {
      clientClaim: 'Deal value is incorrect',
      fulcrumEvidence: {},
      autoResolutionAttempted: false,
    };

    const dispute = createMockDispute('value_discrepancy', evidence);
    const tracker = {
      id: 'tracker-123',
      dealValue: 100000,
    };
    const ledger = {
      id: 'ledger-789',
      trackerId: 'tracker-123',
      dealValue: 95000, // 5% difference
      calculatedAmount: 9500,
    };

    vi.mocked(prisma.dispute.findUniqueOrThrow).mockResolvedValue(dispute as any);
    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);
    vi.mocked(prisma.commissionLedger.findFirst).mockResolvedValue(ledger as any);
    vi.mocked(prisma.dispute.update).mockResolvedValue({} as any);

    const result = await attemptAutoResolution('dispute-456');

    expect(result).toBe(false);
    expect(prisma.dispute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dispute-456' },
        data: expect.objectContaining({
          status: 'escalated',
        }),
      })
    );
  });
});

describe('Dispute Handler - Always Escalate Dispute Types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('payment status disputes always escalate', async () => {
    const evidence = {
      clientClaim: 'Payment was never received',
      fulcrumEvidence: {},
      autoResolutionAttempted: false,
    };

    const dispute = createMockDispute('payment_status', evidence);
    vi.mocked(prisma.dispute.findUniqueOrThrow).mockResolvedValue(dispute as any);
    vi.mocked(prisma.dispute.update).mockResolvedValue({} as any);

    const result = await attemptAutoResolution('dispute-456');

    expect(result).toBe(false);
    expect(prisma.dispute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dispute-456' },
        data: expect.objectContaining({
          status: 'escalated',
        }),
      })
    );
  });

  it('split credit disputes always escalate', async () => {
    const evidence = {
      clientClaim: 'Another vendor deserves partial credit',
      fulcrumEvidence: {},
      autoResolutionAttempted: false,
    };

    const dispute = createMockDispute('split_credit', evidence);
    vi.mocked(prisma.dispute.findUniqueOrThrow).mockResolvedValue(dispute as any);
    vi.mocked(prisma.dispute.update).mockResolvedValue({} as any);

    const result = await attemptAutoResolution('dispute-456');

    expect(result).toBe(false);
    expect(prisma.dispute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dispute-456' },
        data: expect.objectContaining({
          status: 'escalated',
        }),
      })
    );
  });
});

describe('Dispute Handler - Manual Resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('manual dispute resolution works', async () => {
    const dispute = {
      id: 'dispute-456',
      tenantId: 'tenant-abc',
      trackerId: 'tracker-123',
      disputeType: 'attribution_challenge',
      status: 'escalated',
    };

    const resolution: DisputeResolution = {
      resolvedBy: 'joe',
      resolution: 'Resolved in favor of Fulcrum after reviewing evidence',
      adjustmentAmount: null,
      resolvedAt: new Date(),
    };

    vi.mocked(prisma.dispute.findUniqueOrThrow).mockResolvedValue(dispute as any);
    vi.mocked(prisma.dispute.update).mockResolvedValue({} as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    await resolveDispute('dispute-456', resolution);

    expect(prisma.dispute.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'dispute-456' },
        data: expect.objectContaining({
          status: 'resolved_for_fulcrum',
          resolution: 'Resolved in favor of Fulcrum after reviewing evidence',
          resolvedBy: 'joe',
        }),
      })
    );

    expect(prisma.commissionTracker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tracker-123' },
        data: expect.objectContaining({
          status: 'calculated',
        }),
      })
    );
  });
});

describe('Dispute Handler - Filing Disputes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filing a dispute creates record and attempts auto-resolution', async () => {
    const tracker = createMockTracker({
      leadDiscoveredAt: '2024-01-01T09:00:00Z',
      fulcrumAlertAt: '2024-01-01T10:00:00Z',
      leadPushedToCrmAt: '2024-01-02T10:00:00Z',
    });

    const createdDispute = {
      id: 'dispute-new',
      tenantId: 'tenant-abc',
      trackerId: 'tracker-123',
      disputeType: 'attribution_challenge',
      status: 'open',
      clientReason: 'We found this lead ourselves',
      evidence: {
        clientClaim: 'We found this lead ourselves',
        fulcrumEvidence: {
          leadDiscoveredAt: '2024-01-01T09:00:00Z',
          fulcrumAlertAt: '2024-01-01T10:00:00Z',
          pushedToCrmAt: '2024-01-02T10:00:00Z',
        },
        autoResolutionAttempted: false,
      },
      tracker: {
        id: 'tracker-123',
      },
    };

    vi.mocked(prisma.commissionTracker.findUniqueOrThrow).mockResolvedValue(tracker as any);
    vi.mocked(prisma.dispute.create).mockResolvedValue(createdDispute as any);
    vi.mocked(prisma.commissionTracker.update).mockResolvedValue({} as any);

    // Mock attemptAutoResolution internals
    vi.mocked(prisma.dispute.findUniqueOrThrow).mockResolvedValue(createdDispute as any);
    vi.mocked(prisma.dispute.update).mockResolvedValue({} as any);

    const disputeId = await fileDispute(
      'tracker-123',
      'attribution_challenge',
      'We found this lead ourselves'
    );

    expect(disputeId).toBe('dispute-new');

    // Verify dispute was created
    expect(prisma.dispute.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-abc',
          trackerId: 'tracker-123',
          disputeType: 'attribution_challenge',
          clientReason: 'We found this lead ourselves',
          status: 'open',
        }),
      })
    );

    // Verify tracker was marked as disputed
    expect(prisma.commissionTracker.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tracker-123' },
        data: expect.objectContaining({
          status: 'disputed',
        }),
      })
    );

    // Verify auto-resolution was attempted (dispute.update called means it tried)
    expect(prisma.dispute.update).toHaveBeenCalled();
  });
});
