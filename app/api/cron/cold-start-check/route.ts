import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyCronAuth } from '@/lib/cron/verify-auth'
import { routeLogger } from '@/lib/logger'
import { CalibrationMonitor } from '@/lib/cold-start'
import { getTenantIdFromRequest } from '@/lib/cron/get-tenant-id'
import { getCoreLaunchTenants } from '@/lib/tenants/core-launch'

const log = routeLogger('/api/cron/cold-start-check')

export async function POST(req: NextRequest) {
  const authError = verifyCronAuth(req)
  if (authError) return authError

  const { tenantId, error } = getTenantIdFromRequest(req)
  if (error) return error

  const coreTenants = await getCoreLaunchTenants(tenantId)
  const coreTenantIds = coreTenants.map((tenant) => tenant.id)

  const activeStates = await prisma.tenantOnboardingState.findMany({
    where: { coldStartActive: true, tenantId: { in: coreTenantIds } },
    select: { tenantId: true },
  })

  log.info({ count: activeStates.length }, 'Checking cold-start tenants')

  const results: Array<{
    tenantId: string
    exited: boolean
    reason?: string
    significance: number
  }> = []

  for (const { tenantId: scopedTenantId } of activeStates) {
    try {
      const result = await CalibrationMonitor.checkAndMaybeExit(scopedTenantId)
      results.push({
        tenantId: scopedTenantId,
        exited: result.exited,
        reason: result.reason,
        significance: result.currentSignificance,
      })
    } catch (err) {
      log.error({ error: err, tenantId: scopedTenantId }, 'Failed cold-start check for tenant')
      results.push({ tenantId: scopedTenantId, exited: false, significance: 0 })
    }
  }

  return NextResponse.json({
    success: true,
    totalChecked: results.length,
    exited: results.filter((result) => result.exited).length,
    results,
  })
}
