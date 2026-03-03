import { NextRequest, NextResponse } from 'next/server';
import { prisma, auditLog } from '@/lib/db';
import { verifyCronAuth } from '@/lib/cron/verify-auth';
import { ROIAttributionService } from '@/lib/roi/attribution-service';
import { CRMFactory } from '@/lib/crm/factory';
import { jobLogger } from '@/lib/logger';
import { decryptCrmConfig } from '@/lib/settings/crm';

const log = jobLogger('roi-sync');

export async function POST(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const startedAt = Date.now();
  let synced = 0;
  let errors = 0;

  const tenants = await prisma.tenant.findMany({
    where: { isActive: true },
  });

  for (const tenant of tenants) {
    try {
      if (!tenant.crmType || !tenant.crmConfig) continue;

      const crmConfig = decryptCrmConfig(tenant.crmConfig);
      if (!crmConfig) {
        errors++;
        log.error({ tenantId: tenant.id }, 'CRM config missing or unreadable');
        continue;
      }

      const crmConnector = CRMFactory.create(tenant.crmType, crmConfig);
      await crmConnector.authenticate();

      const sourceTags = await prisma.fulcrumSourceTag.findMany({
        where: { tenantId: tenant.id },
        include: { lead: true, roiAttribution: true },
      });

      for (const tag of sourceTags) {
        try {
          const externalLeadId = tag.lead.crmLeadId;
          if (!externalLeadId) continue;

          const dealData = await crmConnector.getLeadDealValue(externalLeadId);
          await ROIAttributionService.fullSync(
            tenant.id,
            tag.leadId,
            dealData?.estimatedDealValue ?? null,
            dealData?.stage ?? undefined,
          );
          synced++;
        } catch (err) {
          errors++;
          log.error({ error: err, tenantId: tenant.id }, `Failed for lead ${tag.leadId}`);
        }
      }
    } catch (err) {
      errors++;
      log.error({ error: err }, `Failed for tenant ${tenant.id}`);
    }
  }

  const durationMs = Date.now() - startedAt;
  log.info({ synced, errors, durationMs }, 'ROI sync completed');

  await auditLog(null, 'roi_sync_completed', undefined, { synced, errors, durationMs });

  return NextResponse.json({
    success: true,
    synced,
    errors,
    durationMs,
  });
}
