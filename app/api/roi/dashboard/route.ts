import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { ROIAttributionService } from '@/lib/roi/attribution-service';
import { routeLogger } from '@/lib/logger';

const log = routeLogger('/api/roi/dashboard');

export async function GET() {
  try {
    const { orgId } = await auth();
    if (!orgId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { clerkOrgId: orgId },
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const [summary, topLeads] = await Promise.all([
      ROIAttributionService.getTenantROISummary(tenant.id),
      ROIAttributionService.getTopROILeads(tenant.id, 10),
    ]);

    return NextResponse.json({
      summary: {
        totalFulcrumSourcedLeads: summary.totalLeads,
        totalCreditSpend: summary.totalSpend,
        totalAttributedRevenue: summary.totalRevenue,
        averageROIMultiplier: Number(summary.avgMultiplier.toFixed(2)),
      },
      topLeads: topLeads.map((l) => ({
        leadId: l.leadId,
        fulcrumSourceId: l.sourceTag.fulcrumSourceId,
        sourceType: l.sourceTag.sourceType,
        estimatedDealValue: l.estimatedDealValue,
        totalCreditSpend: l.totalCreditSpend,
        roiMultiplier: Number(l.roiMultiplier.toFixed(2)),
        stage: l.stage,
        lastSyncedAt: l.lastSyncedAt,
      })),
    });
  } catch (error) {
    log.error({ error }, 'ROI Dashboard error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
