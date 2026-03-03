import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/cron/verify-auth'
import { getTenantIdFromRequest } from '@/lib/cron/get-tenant-id'
import { routeLogger } from '@/lib/logger'
import { runICMReconciliation, runICMReconciliationAll } from '@/lib/jobs/icm-reconciliation'

const log = routeLogger('/api/cron/icm')

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const { tenantId, error } = getTenantIdFromRequest(request)
  if (error) return error

  try {
    if (tenantId) {
      const result = await runICMReconciliation(tenantId)
      return NextResponse.json({
        success: true,
        tenantsProcessed: 1,
        results: [result],
        errors: result.errors,
      })
    }

    const result = await runICMReconciliationAll()
    return NextResponse.json({
      success: true,
      tenantsProcessed: result.results.length,
      ...result,
    })
  } catch (err) {
    log.error({ error: err, tenantId }, 'ICM reconciliation cron failed')
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
