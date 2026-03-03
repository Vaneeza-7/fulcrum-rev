import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/cron/verify-auth'
import { getTenantIdFromRequest } from '@/lib/cron/get-tenant-id'
import { routeLogger } from '@/lib/logger'
import { runContentROI, runContentROIAll } from '@/lib/jobs/content-roi'

const log = routeLogger('/api/cron/content-roi')

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const { tenantId, error } = getTenantIdFromRequest(request)
  if (error) return error

  try {
    if (tenantId) {
      const result = await runContentROI(tenantId)
      return NextResponse.json({
        success: true,
        tenantsProcessed: result ? 1 : 0,
        results: result ? [result] : [],
        errors: [],
      })
    }

    const result = await runContentROIAll()
    return NextResponse.json({
      success: true,
      tenantsProcessed: result.results.length,
      ...result,
    })
  } catch (err) {
    log.error({ error: err, tenantId }, 'Content ROI cron failed')
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
