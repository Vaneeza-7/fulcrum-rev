import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyCronAuth } from '@/lib/cron/verify-auth'
import { getTenantIdFromRequest } from '@/lib/cron/get-tenant-id'
import { routeLogger } from '@/lib/logger'
import { sendWeeklyDigest } from '@/lib/huck/proactive'

const log = routeLogger('/api/cron/weekly-digest')

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
    sent: boolean
    error?: string
  }> = []

  for (const tenant of tenants) {
    try {
      await sendWeeklyDigest(tenant.id)
      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        sent: true,
      })
    } catch (err) {
      log.error({ error: err, tenantId: tenant.id }, 'Weekly digest failed for tenant')
      results.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        sent: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return NextResponse.json({
    success: true,
    tenantsProcessed: results.length,
    sent: results.filter((result) => result.sent).length,
    results,
  })
}
