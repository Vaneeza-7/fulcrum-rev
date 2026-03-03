import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'
import { ROIAttributionService } from '@/lib/roi/attribution-service'

export async function GET() {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  const { tenant } = authResult

  const [roiSummary, totalLeads, pushedToCrm, pipelineRuns, lastPipelineRun] = await Promise.all([
    ROIAttributionService.getTenantROISummary(tenant.id),
    prisma.lead.count({ where: { tenantId: tenant.id } }),
    prisma.lead.count({ where: { tenantId: tenant.id, status: 'pushed_to_crm' } }),
    prisma.auditLog.count({
      where: { tenantId: tenant.id, actionType: 'pipeline_completed' },
    }),
    prisma.auditLog.findFirst({
      where: { tenantId: tenant.id, actionType: 'pipeline_completed' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, details: true },
    }),
  ])

  return NextResponse.json({
    summary: {
      totalLeads,
      pushedToCrm,
      pipelineRuns,
      lastPipelineRunAt: lastPipelineRun?.createdAt ?? null,
      roi: {
        totalFulcrumSourcedLeads: roiSummary.totalLeads,
        totalCreditSpend: roiSummary.totalSpend,
        totalAttributedRevenue: roiSummary.totalRevenue,
        averageROIMultiplier: Number(roiSummary.avgMultiplier.toFixed(2)),
      },
    },
  })
}
