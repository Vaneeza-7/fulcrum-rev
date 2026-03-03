import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyCronAuth } from '@/lib/cron/verify-auth'
import { getTenantIdFromRequest } from '@/lib/cron/get-tenant-id'
import { routeLogger } from '@/lib/logger'
import { runDealDiagnostics } from '@/lib/jobs/deal-diagnostics'

const log = routeLogger('/api/cron/diagnostics')

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const { tenantId, error } = getTenantIdFromRequest(request)
  if (error) return error

  const tenants = tenantId
    ? await prisma.tenant.findMany({
        where: { id: tenantId, isActive: true },
        select: { id: true, name: true },
      })
    : await prisma.tenant.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      })

  const results: Array<{
    tenantId: string
    tenantName: string
    checked: number
    stalled: number
    alerts: number
    error?: string
  }> = []

  for (const tenant of tenants) {
    try {
      const result = await runDealDiagnostics(tenant.id)
      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        checked: result.checked,
        stalled: result.stalled,
        alerts: result.alerts.length,
      })
    } catch (err) {
      log.error({ error: err, tenantId: tenant.id }, 'Deal diagnostics failed for tenant')
      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        checked: 0,
        stalled: 0,
        alerts: 0,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return NextResponse.json({
    success: true,
    tenantsProcessed: results.length,
    stalledDeals: results.reduce((sum, result) => sum + result.stalled, 0),
    alertsSent: results.reduce((sum, result) => sum + result.alerts, 0),
    results,
  })
}
