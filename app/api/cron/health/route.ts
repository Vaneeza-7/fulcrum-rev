import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyCronAuth } from '@/lib/cron/verify-auth'
import { getTenantIdFromRequest } from '@/lib/cron/get-tenant-id'
import { routeLogger } from '@/lib/logger'
import { runHealthChecks } from '@/lib/health/crm-health'
import { sendSystemAlert } from '@/lib/huck/proactive'

const log = routeLogger('/api/cron/health')

function formatHealthDetails(details: Record<string, unknown>): string {
  if (typeof details.message === 'string') return details.message
  if (typeof details.error === 'string') return details.error
  return JSON.stringify(details)
}

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
    checksRun: number
    alertsSent: number
    degradedOrCritical: number
    error?: string
  }> = []

  for (const tenant of tenants) {
    try {
      const checks = await runHealthChecks(tenant.id)
      let alertsSent = 0

      for (const check of checks) {
        if (check.status === 'healthy') continue
        await sendSystemAlert(
          tenant.id,
          check.checkType,
          check.status,
          formatHealthDetails(check.details)
        )
        alertsSent++
      }

      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        checksRun: checks.length,
        alertsSent,
        degradedOrCritical: checks.filter((check) => check.status !== 'healthy').length,
      })
    } catch (err) {
      log.error({ error: err, tenantId: tenant.id }, 'Health checks failed for tenant')
      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        checksRun: 0,
        alertsSent: 0,
        degradedOrCritical: 0,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return NextResponse.json({
    success: true,
    tenantsProcessed: results.length,
    alertsSent: results.reduce((sum, result) => sum + result.alertsSent, 0),
    results,
  })
}
