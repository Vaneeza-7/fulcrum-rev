import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getAuthenticatedTenant } from '@/lib/auth/get-authenticated-tenant'

const INCLUDED_ACTIONS = [
  'pipeline_started',
  'pipeline_dedup',
  'pipeline_completed',
  'pipeline_error',
  'crm_push_failed',
  'lead_pushed_to_crm',
  'roi_sync_completed',
  'icm_reconciliation_complete',
  'deal_diagnostics_completed',
  'seo_audit_complete',
  'cro_audit_complete',
  'content_allocation_complete',
  'content_roi_complete',
] as const

export async function GET(request: NextRequest) {
  const authResult = await getAuthenticatedTenant()
  if ('error' in authResult) return authResult.error

  const { tenant } = authResult
  const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('limit') ?? '25')))

  const history = await prisma.auditLog.findMany({
    where: {
      tenantId: tenant.id,
      actionType: { in: [...INCLUDED_ACTIONS] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({
    history: history.map((entry) => ({
      id: entry.id,
      actionType: entry.actionType,
      resourceId: entry.resourceId,
      details: entry.details,
      createdAt: entry.createdAt,
    })),
  })
}
