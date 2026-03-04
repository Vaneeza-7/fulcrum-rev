import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/cron/verify-auth'
import { prisma } from '@/lib/db'
import { jobLogger } from '@/lib/logger'
import { SignalWeightService } from '@/lib/scoring/signal-weight-service'
import { getTenantIdFromRequest } from '@/lib/cron/get-tenant-id'
import { getCoreLaunchTenants } from '@/lib/tenants/core-launch'

const log = jobLogger('hitl-recalibrate')

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const { tenantId, error } = getTenantIdFromRequest(request)
  if (error) return error

  const startedAt = Date.now()
  const coreTenants = await getCoreLaunchTenants(tenantId)
  const allowedTenantIds = new Set(coreTenants.map((tenant) => tenant.id))
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const overdueSignals = await prisma.negativeSignal.findMany({
    where: {
      appliedToModel: false,
      createdAt: { lte: cutoff },
      tenantId: { in: Array.from(allowedTenantIds) },
    },
    select: { tenantId: true },
    distinct: ['tenantId'],
  })

  const results: Array<{
    tenantId: string
    signalsProcessed: number
    weightsAdjusted: number
  }> = []

  for (const { tenantId: scopedTenantId } of overdueSignals) {
    try {
      const result = await SignalWeightService.recalibrateFromNegativeSignals(scopedTenantId)
      results.push({ tenantId: scopedTenantId, ...result })
    } catch (err) {
      log.error({ error: err, tenantId: scopedTenantId }, 'Recalibration failed')
      results.push({ tenantId: scopedTenantId, signalsProcessed: 0, weightsAdjusted: 0 })
    }
  }

  const allUnapplied = await prisma.negativeSignal.findMany({
    where: {
      appliedToModel: false,
      tenantId: { in: Array.from(allowedTenantIds) },
    },
    select: { tenantId: true },
    distinct: ['tenantId'],
  })

  const alreadyProcessed = new Set(results.map((result) => result.tenantId))
  for (const { tenantId: scopedTenantId } of allUnapplied) {
    if (alreadyProcessed.has(scopedTenantId)) continue
    try {
      const result = await SignalWeightService.recalibrateFromNegativeSignals(scopedTenantId)
      results.push({ tenantId: scopedTenantId, ...result })
    } catch (err) {
      log.error({ error: err, tenantId: scopedTenantId }, 'Recalibration failed')
    }
  }

  return NextResponse.json({
    success: true,
    tenantsProcessed: results.length,
    durationMs: Date.now() - startedAt,
    results,
  })
}
