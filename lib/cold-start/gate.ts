import { prisma } from '@/lib/db';
import { jobLogger } from '@/lib/logger';

const log = jobLogger('cold-start-gate');

export interface ColdStartStatus {
  isActive: boolean;
  requiresManualApproval: boolean;
  confidenceFloorBoost: number;
  calibrationSignificance: number;
  expiresAt: Date | null;
  daysRemaining: number | null;
}

export class ColdStartGate {

  /**
   * Get the cold-start status for a tenant.
   */
  static async getStatus(tenantId: string): Promise<ColdStartStatus> {
    const state = await prisma.tenantOnboardingState.findUnique({
      where: { tenantId },
    });

    if (!state || !state.coldStartActive) {
      return {
        isActive: false,
        requiresManualApproval: false,
        confidenceFloorBoost: 0,
        calibrationSignificance: state?.calibrationSignificance ?? 1.0,
        expiresAt: null,
        daysRemaining: null,
      };
    }

    const now = new Date();
    const daysRemaining = Math.max(0, Math.ceil(
      (state.coldStartExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    ));

    return {
      isActive: true,
      requiresManualApproval: state.requiresManualApproval,
      confidenceFloorBoost: state.confidenceFloorBoost,
      calibrationSignificance: state.calibrationSignificance,
      expiresAt: state.coldStartExpiresAt,
      daysRemaining,
    };
  }

  /**
   * Apply cold-start confidence boost to a raw confidence score.
   * Boost means the threshold is HIGHER — harder to pass.
   * e.g., if normal threshold is 0.7, cold-start threshold is 0.9
   */
  static applyConfidenceBoost(rawConfidence: number, boost: number): number {
    return rawConfidence - boost;
  }

  /**
   * Check if an agent action should proceed or requires manual approval.
   * Returns true if action can proceed automatically, false if manual approval required.
   */
  static async checkCanProceed(tenantId: string, confidence: number): Promise<{
    canProceed: boolean;
    reason: string;
    adjustedConfidence: number;
  }> {
    const status = await this.getStatus(tenantId);

    if (!status.isActive) {
      return { canProceed: true, reason: 'Not in cold-start', adjustedConfidence: confidence };
    }

    const adjustedConfidence = this.applyConfidenceBoost(confidence, status.confidenceFloorBoost);

    if (status.requiresManualApproval) {
      log.info({ tenantId, confidence, adjustedConfidence }, 'Cold-start: manual approval required');
      return {
        canProceed: false,
        reason: 'Cold-start: manual approval required',
        adjustedConfidence,
      };
    }

    return { canProceed: true, reason: 'Cold-start: approval not required', adjustedConfidence };
  }
}
