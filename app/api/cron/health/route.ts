import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/cron/verify-auth'
import { routeLogger } from '@/lib/logger'
import { runHealthChecks } from '@/lib/health/crm-health'
import { sendSystemAlert } from '@/lib/huck/proactive'
import { getTenantIdFromRequest } from '@/lib/cron/get-tenant-id'
import { getCoreLaunchTenants } from '@/lib/tenants/core-launch'
import { getTenantCrmHealthSummary } from '@/lib/health/crm-push-health'
import { mapWithConcurrency } from '@/lib/utils/map-with-concurrency'

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

  const tenants = await getCoreLaunchTenants(tenantId)
  const results: Array<{
    tenantId: string
    tenantName: string
    checksRun: number
    alertsSent: number
    degradedOrCritical: number
    crmHealthLevel?: string
    error?: string
  }> = []

  const tenantResults = await mapWithConcurrency(tenants, 3, async (tenant) => {
    try {
      const checks = await runHealthChecks(tenant.id)
      const crmHealth = await getTenantCrmHealthSummary(tenant.id)
      let alertsSent = 0

      for (const check of checks) {
        if (check.status === 'healthy') continue
        await sendSystemAlert(tenant.id, check.checkType, check.status, formatHealthDetails(check.details))
        alertsSent++
      }

      if (crmHealth.level !== 'GREEN') {
        await sendSystemAlert(tenant.id, 'crm_push_queue', crmHealth.level === 'RED' ? 'critical' : 'degraded', `${crmHealth.message} ${crmHealth.action}`)
        alertsSent++
      }

      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        checksRun: checks.length,
        alertsSent,
        degradedOrCritical: checks.filter((check) => check.status !== 'healthy').length,
        crmHealthLevel: crmHealth.level,
      }
    } catch (err) {
      log.error({ error: err, tenantId: tenant.id }, 'Health checks failed for tenant')
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        checksRun: 0,
        alertsSent: 0,
        degradedOrCritical: 0,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  })

  results.push(...tenantResults)

  return NextResponse.json({
    success: true,
    tenantsProcessed: results.length,
    alertsSent: results.reduce((sum, result) => sum + result.alertsSent, 0),
    results,
  })
}
