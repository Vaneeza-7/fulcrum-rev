import { prisma, auditLog } from '@/lib/db';
import { HITLProcessor } from '@/lib/hitl/hitl-processor';
import { NegativeReason } from '@prisma/client';
import { jobLogger } from '@/lib/logger';

const log = jobLogger('brand-evolution');

export class BrandEvolutionAgent {

  /**
   * Handle rejection of a brand suggestion by a Sales Leader.
   * Creates a NegativeSignal with BRAND_MISMATCH reason and marks
   * the suggestion as rejected. The suggestion content is included
   * as rejectReasonRaw to maximize embedding value.
   */
  static async handleBrandSuggestionRejection(params: {
    tenantId: string;
    brandSuggestionId: string;
    rejectedBy: string;
    rejectReasonRaw?: string;
  }): Promise<void> {
    // Fetch the brand suggestion content for embedding context
    const suggestion = await prisma.brandSuggestion.findUnique({
      where: { id: params.brandSuggestionId },
    });

    const contextText = params.rejectReasonRaw
      ? params.rejectReasonRaw
      : `Brand suggestion rejected: ${suggestion?.content ?? 'unknown content'}`;

    await HITLProcessor.processRejection({
      tenantId: params.tenantId,
      brandSuggestionId: params.brandSuggestionId,
      rejectReason: NegativeReason.BRAND_MISMATCH,
      rejectReasonRaw: contextText,
      rejectedBy: params.rejectedBy,
    });

    // Mark the brand suggestion as rejected
    await prisma.brandSuggestion.update({
      where: { id: params.brandSuggestionId },
      data: { status: 'REJECTED', rejectedAt: new Date() },
    });

    await auditLog(params.tenantId, 'brand_suggestion_rejected', params.brandSuggestionId, {
      rejectedBy: params.rejectedBy,
      reason: contextText,
    });

    log.info(
      { brandSuggestionId: params.brandSuggestionId, rejectedBy: params.rejectedBy },
      'Brand suggestion rejected',
    );
  }
}
