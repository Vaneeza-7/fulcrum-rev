import { prisma } from '@/lib/db';
import { ColdStartExitReason } from '@prisma/client';
import { jobLogger } from '@/lib/logger';

const log = jobLogger('calibration-monitor');
const SIGNIFICANCE_THRESHOLD = 0.85;

export class CalibrationMonitor {

  /**
   * Check a tenant's calibration and exit cold-start if threshold met.
   * Returns true if cold-start was exited.
   */
  static async checkAndMaybeExit(tenantId: string): Promise<{
    exited: boolean;
    reason?: ColdStartExitReason;
    currentSignificance: number;
  }> {
    const state = await prisma.tenantOnboardingState.findUnique({
      where: { tenantId },
    });

    if (!state || !state.coldStartActive) {
      return { exited: false, currentSignificance: 1.0 };
    }

    // Check expiry first
    const now = new Date();
    if (now >= state.coldStartExpiresAt) {
      await this.exitColdStart(tenantId, ColdStartExitReason.EXPIRY_30_DAYS, state.calibrationSignificance);
      return {
        exited: true,
        reason: ColdStartExitReason.EXPIRY_30_DAYS,
        currentSignificance: state.calibrationSignificance,
      };
    }

    // Get latest ModelCalibration stats for this tenant
    const calibration = await prisma.modelCalibration.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    const currentSignificance = calibration?.statisticalSignificance ?? 0;

    // Update calibrationSignificance on the state record
    await prisma.tenantOnboardingState.update({
      where: { tenantId },
      data: { calibrationSignificance: currentSignificance },
    });

    if (currentSignificance >= SIGNIFICANCE_THRESHOLD) {
      await this.exitColdStart(tenantId, ColdStartExitReason.STATISTICAL_SIGNIFICANCE_REACHED, currentSignificance);
      return {
        exited: true,
        reason: ColdStartExitReason.STATISTICAL_SIGNIFICANCE_REACHED,
        currentSignificance,
      };
    }

    log.info(
      { tenantId, currentSignificance, threshold: SIGNIFICANCE_THRESHOLD },
      'Cold-start still active',
    );
    return { exited: false, currentSignificance };
  }

  private static async exitColdStart(
    tenantId: string,
    reason: ColdStartExitReason,
    significance: number,
  ): Promise<void> {
    await prisma.tenantOnboardingState.update({
      where: { tenantId },
      data: {
        coldStartActive: false,
        requiresManualApproval: false,
        confidenceFloorBoost: 0,
        calibrationSignificance: significance,
        exitedColdStartAt: new Date(),
        exitReason: reason,
      },
    });
    log.info({ tenantId, reason, significance }, 'Tenant exited cold-start');
  }

  /**
   * Admin override to manually exit cold-start.
   */
  static async adminOverrideExit(tenantId: string): Promise<void> {
    const state = await prisma.tenantOnboardingState.findUnique({
      where: { tenantId },
    });
    if (!state) throw new Error(`No TenantOnboardingState found for tenant ${tenantId}`);
    await this.exitColdStart(tenantId, ColdStartExitReason.MANUAL_OVERRIDE_BY_ADMIN, state.calibrationSignificance);
  }
}
