import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/cron/verify-auth'
import { routeLogger } from '@/lib/logger'
import { runPipelineForTenant } from '@/lib/pipeline/orchestrator'
import { getTenantIdFromRequest } from '@/lib/cron/get-tenant-id'
import { getCoreLaunchTenants } from '@/lib/tenants/core-launch'
import { mapWithConcurrency } from '@/lib/utils/map-with-concurrency'

const log = routeLogger('/api/cron/pipeline')

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const authError = verifyCronAuth(req)
  if (authError) return authError

  const { tenantId, error } = getTenantIdFromRequest(req)
  if (error) return error

  const tenants = await getCoreLaunchTenants(tenantId)
  log.info({ count: tenants.length }, 'Starting pipeline for core launch tenants')

  const results = await mapWithConcurrency(tenants, 2, async (tenant) => {
    try {
      const result = await runPipelineForTenant(tenant.id)
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        leadsProcessed: result.profiles_scored,
        providerUsed: result.provider_used,
        error: undefined,
      }
    } catch (err) {
      log.error({ error: err, tenantId: tenant.id }, 'Pipeline failed for tenant')
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        leadsProcessed: 0,
        providerUsed: undefined,
        error: err instanceof Error ? err.message : 'Unknown error',
      }
    }
  })

  const totalLeads = results.reduce((sum, result) => sum + result.leadsProcessed, 0)
  log.info({ totalLeads, tenantsProcessed: results.length }, 'Pipeline complete')

  return NextResponse.json({
    success: true,
    tenantsProcessed: results.length,
    totalLeads,
    results,
  })
}
