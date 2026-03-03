import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/cron/verify-auth'
import { getTenantIdFromRequest } from '@/lib/cron/get-tenant-id'
import { routeLogger } from '@/lib/logger'
import { runSEOAudit, runSEOAuditAll } from '@/lib/jobs/seo-audit'

const log = routeLogger('/api/cron/seo')

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const { tenantId, error } = getTenantIdFromRequest(request)
  if (error) return error

  try {
    if (tenantId) {
      const result = await runSEOAudit(tenantId)
      return NextResponse.json({
        success: true,
        tenantsProcessed: result ? 1 : 0,
        results: result ? [result] : [],
        errors: [],
      })
    }

    const result = await runSEOAuditAll()
    return NextResponse.json({
      success: true,
      tenantsProcessed: result.results.length,
      ...result,
    })
  } catch (err) {
    log.error({ error: err, tenantId }, 'SEO cron failed')
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
