import { NextRequest, NextResponse } from 'next/server'
import { prisma, auditLog } from '@/lib/db'
import { verifyCronAuth } from '@/lib/cron/verify-auth'
import { ROIAttributionService } from '@/lib/roi/attribution-service'
import { CRMFactory } from '@/lib/crm/factory'
import { jobLogger } from '@/lib/logger'
import { decryptCrmConfig } from '@/lib/settings/crm'
import { getTenantIdFromRequest } from '@/lib/cron/get-tenant-id'
import { getCoreLaunchTenants } from '@/lib/tenants/core-launch'
import { mapWithConcurrency } from '@/lib/utils/map-with-concurrency'

const log = jobLogger('roi-sync')

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request)
  if (authError) return authError

  const { tenantId, error } = getTenantIdFromRequest(request)
  if (error) return error

  const startedAt = Date.now()
  const tenants = await getCoreLaunchTenants(tenantId)

  const results = await mapWithConcurrency(tenants, 2, async (tenant) => {
    let synced = 0
    let errors = 0

    try {
      const fullTenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })
      if (!fullTenant.crmType || !fullTenant.crmConfig) {
        return { tenantId: tenant.id, tenantName: tenant.name, synced, errors }
      }

      const crmConfig = decryptCrmConfig(fullTenant.crmConfig)
      if (!crmConfig) {
        return { tenantId: tenant.id, tenantName: tenant.name, synced, errors: errors + 1 }
      }

      const crmConnector = CRMFactory.create(fullTenant.crmType, crmConfig)
      await crmConnector.authenticate()

      const sourceTags = await prisma.fulcrumSourceTag.findMany({
        where: { tenantId: tenant.id },
        include: { lead: true, roiAttribution: true },
      })

      for (const tag of sourceTags) {
        try {
          const externalLeadId = tag.lead.crmLeadId
          if (!externalLeadId) continue

          const dealData = await crmConnector.getLeadDealValue(externalLeadId)
          await ROIAttributionService.fullSync(
            tenant.id,
            tag.leadId,
            dealData?.estimatedDealValue ?? null,
            dealData?.stage ?? undefined,
          )
          synced++
        } catch (err) {
          errors++
          log.error({ error: err, tenantId: tenant.id }, `Failed ROI sync for lead ${tag.leadId}`)
        }
      }
    } catch (err) {
      errors++
      log.error({ error: err, tenantId: tenant.id }, 'Failed ROI sync for tenant')
    }

    return { tenantId: tenant.id, tenantName: tenant.name, synced, errors }
  })

  const durationMs = Date.now() - startedAt
  const synced = results.reduce((sum, result) => sum + result.synced, 0)
  const errors = results.reduce((sum, result) => sum + result.errors, 0)

  await auditLog(null, 'roi_sync_completed', undefined, { synced, errors, durationMs })

  return NextResponse.json({
    success: true,
    synced,
    errors,
    durationMs,
    results,
  })
}
