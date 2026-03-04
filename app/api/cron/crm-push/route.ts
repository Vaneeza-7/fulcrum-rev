import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/cron/verify-auth'
import { getTenantIdFromRequest } from '@/lib/cron/get-tenant-id'
import { getCoreLaunchTenants } from '@/lib/tenants/core-launch'
import { mapWithConcurrency } from '@/lib/utils/map-with-concurrency'
import { pushApprovedLeads } from '@/lib/jobs/crm-push'
import { evaluateAndMaybePauseTenantCrmPush } from '@/lib/health/crm-push-health'
import { sendSystemAlert } from '@/lib/huck/proactive'
import { routeLogger } from '@/lib/logger'

const log = routeLogger('/api/cron/crm-push')

export const maxDuration = 300

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const { tenantId, error } = getTenantIdFromRequest(request)
  if (error) return error

  const tenants = await getCoreLaunchTenants(tenantId)

  const results = await mapWithConcurrency(tenants, 3, async (tenant) => {
    if (tenant.crmPushPaused) {
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        pushed: 0,
        failed: 0,
        skippedPaused: true,
      }
    }

    try {
      const result = await pushApprovedLeads(tenant.id)
      const pauseResult = await evaluateAndMaybePauseTenantCrmPush(tenant.id)

      if (pauseResult.changed && pauseResult.reason) {
        await sendSystemAlert(tenant.id, 'crm_push_queue', 'critical', pauseResult.reason)
      }

      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        pushed: result.pushed,
        failed: result.failed,
        skippedPaused: false,
      }
    } catch (err) {
      log.error({ error: err, tenantId: tenant.id }, 'CRM push cron failed for tenant')
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        pushed: 0,
        failed: 0,
        skippedPaused: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  })

  return NextResponse.json({
    success: true,
    tenantsProcessed: results.length,
    tenantsSkippedPaused: results.filter((result) => result.skippedPaused).length,
    pushed: results.reduce((sum, result) => sum + result.pushed, 0),
    failed: results.reduce((sum, result) => sum + result.failed, 0),
    results,
  })
}
