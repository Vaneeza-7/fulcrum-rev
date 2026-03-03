import { prisma } from '@/lib/db';
import { getLeadLedgerSpend } from '@/lib/billing/ledger';

export class ROIAttributionService {

  /**
   * Recalculate totalCreditSpend for a lead.
   *
   * TODO: Replace with actual FulcrumCreditLedger query when credit tracking is implemented.
   * Currently sets totalCreditSpend to 0 as a placeholder since FulcrumCreditLedger
   * does not exist yet. When it's added, sum all credit ledger entries where the
   * metadata references this leadId.
   */
  static async syncCreditSpend(tenantId: string, leadId: string): Promise<void> {
    const totalSpend = (await getLeadLedgerSpend(tenantId, leadId)).usdAmountCents / 100;

    await prisma.rOIAttribution.updateMany({
      where: { tenantId, leadId },
      data: { totalCreditSpend: totalSpend }
    });
  }

  /**
   * Update estimatedDealValue from CRM, then recalculate roiMultiplier
   */
  static async syncDealValue(
    tenantId: string,
    leadId: string,
    estimatedDealValue: number | null,
    stage?: string
  ): Promise<void> {
    const attribution = await prisma.rOIAttribution.findFirst({
      where: { tenantId, leadId }
    });

    if (!attribution) return;

    const roiMultiplier = attribution.totalCreditSpend > 0 && estimatedDealValue
      ? estimatedDealValue / attribution.totalCreditSpend
      : 0;

    await prisma.rOIAttribution.update({
      where: { id: attribution.id },
      data: {
        estimatedDealValue,
        roiMultiplier,
        stage,
        lastSyncedAt: new Date(),
        attributedRevenue: estimatedDealValue ?? attribution.attributedRevenue,
      }
    });
  }

  /**
   * Full sync for a single lead: credit spend + deal value + multiplier
   */
  static async fullSync(
    tenantId: string,
    leadId: string,
    dealValue: number | null,
    stage?: string
  ): Promise<void> {
    await this.syncCreditSpend(tenantId, leadId);
    await this.syncDealValue(tenantId, leadId, dealValue, stage);
  }

  /**
   * Get top N leads by ROI multiplier for a tenant (for dashboard + Morning Report)
   */
  static async getTopROILeads(tenantId: string, limit = 5) {
    return prisma.rOIAttribution.findMany({
      where: { tenantId, roiMultiplier: { gt: 0 } },
      orderBy: { roiMultiplier: 'desc' },
      take: limit,
      include: { sourceTag: true }
    });
  }

  /**
   * Get aggregate ROI summary for a tenant
   */
  static async getTenantROISummary(tenantId: string) {
    const attributions = await prisma.rOIAttribution.findMany({
      where: { tenantId }
    });

    const totalLeads = attributions.length;
    const totalSpend = attributions.reduce((s, a) => s + a.totalCreditSpend, 0);
    const totalRevenue = attributions.reduce((s, a) => s + a.attributedRevenue, 0);
    const avgMultiplier = totalSpend > 0 ? totalRevenue / totalSpend : 0;

    return { totalLeads, totalSpend, totalRevenue, avgMultiplier };
  }
}
