import { prisma } from '@/lib/db';
import { jobLogger } from '@/lib/logger';

const log = jobLogger('cold-start-init');

const COLD_START_DURATION_DAYS = 30;

/**
 * Initialize cold-start state for a new tenant.
 * Call this immediately after creating a new Tenant record.
 * Uses upsert for idempotency — safe to call multiple times.
 */
export async function initializeColdStart(tenantId: string): Promise<void> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + COLD_START_DURATION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.tenantOnboardingState.upsert({
    where: { tenantId },
    create: {
      tenantId,
      coldStartActive: true,
      coldStartStartedAt: now,
      coldStartExpiresAt: expiresAt,
      confidenceFloorBoost: 0.20,
      requiresManualApproval: true,
      calibrationSignificance: 0.0,
    },
    update: {}, // don't overwrite if already exists
  });

  log.info({ tenantId, expiresAt: expiresAt.toISOString() }, 'Cold-start initialized');
}
