import { prisma } from '@/lib/db';
import { FulcrumSourceType } from '@prisma/client';

export class ROISourceTagger {

  /**
   * Generate a unique Fulcrum Source ID
   * Format: FSR-{tenantSlug}-{timestamp}-{randomHex6}
   */
  static generateSourceId(tenantSlug: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(16).substring(2, 8);
    return `FSR-${tenantSlug}-${timestamp}-${random}`;
  }

  /**
   * Tag a lead as Fulcrum-sourced. Idempotent — if tag already exists, returns existing record.
   * Creates both FulcrumSourceTag and ROIAttribution atomically in a transaction.
   */
  static async tagLead(params: {
    tenantId: string;
    tenantSlug: string;
    leadId: string;
    sourceType: FulcrumSourceType;
  }): Promise<{ fulcrumSourceId: string; isNew: boolean }> {
    const existing = await prisma.fulcrumSourceTag.findUnique({
      where: { leadId: params.leadId }
    });

    if (existing) {
      return { fulcrumSourceId: existing.fulcrumSourceId, isNew: false };
    }

    const fulcrumSourceId = ROISourceTagger.generateSourceId(params.tenantSlug);

    // Create both records atomically in a transaction
    await prisma.$transaction(async (tx) => {
      const sourceTag = await tx.fulcrumSourceTag.create({
        data: {
          tenantId: params.tenantId,
          leadId: params.leadId,
          fulcrumSourceId,
          sourceType: params.sourceType,
        }
      });

      // Immediately initialize the ROIAttribution record with zero values
      await tx.rOIAttribution.create({
        data: {
          tenantId: params.tenantId,
          fulcrumSourceTagId: sourceTag.id,
          leadId: params.leadId,
          totalCreditSpend: 0,
          attributedRevenue: 0,
          roiMultiplier: 0,
        }
      });
    });

    return { fulcrumSourceId, isNew: true };
  }

  /**
   * Check if a lead was Fulcrum-sourced
   */
  static async isLeadFulcrumSourced(leadId: string): Promise<boolean> {
    const tag = await prisma.fulcrumSourceTag.findUnique({
      where: { leadId }
    });
    return tag !== null;
  }
}
