import { prisma, auditLog } from '@/lib/db';
import { CRMFactory } from '@/lib/crm/factory';
import { CRMAuthConfig } from '@/lib/crm/types';
import { jobLogger } from '@/lib/logger';

const log = jobLogger('crm_push');
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Push a single lead to the CRM with exponential backoff retry.
 */
export async function pushLeadToCRM(leadId: string): Promise<{ success: boolean; crmLeadId?: string; error?: string }> {
  const lead = await prisma.lead.findUniqueOrThrow({
    where: { id: leadId },
    include: { tenant: true },
  });

  if (!lead.tenant.crmType) {
    return { success: false, error: 'No CRM configured for this tenant' };
  }
  const crm = CRMFactory.create(lead.tenant.crmType, lead.tenant.crmConfig as CRMAuthConfig);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await crm.authenticate();

      const nameParts = lead.fullName.split(' ');
      const crmLeadId = await crm.createLead({
        first_name: nameParts.slice(0, -1).join(' ') || nameParts[0],
        last_name: nameParts[nameParts.length - 1] || 'Unknown',
        company: lead.company ?? '',
        title: lead.title ?? '',
        linkedin_url: lead.linkedinUrl,
        fulcrum_score: Number(lead.fulcrumScore),
        fulcrum_grade: lead.fulcrumGrade ?? '',
        fit_score: Number(lead.fitScore),
        intent_score: Number(lead.intentScore),
        first_line: lead.firstLine ?? '',
        source: `Fulcrum - ${lead.tenant.name}`,
      });

      await prisma.lead.update({
        where: { id: leadId },
        data: {
          status: 'pushed_to_crm',
          crmLeadId,
          pushedToCrmAt: new Date(),
        },
      });

      await auditLog(lead.tenantId, 'lead_pushed_to_crm', leadId, {
        crmLeadId,
        attempt,
      });

      return { success: true, crmLeadId };
    } catch (error) {
      log.error({ err: error, leadId, attempt, maxRetries: MAX_RETRIES }, 'CRM push attempt failed');

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        await auditLog(lead.tenantId, 'crm_push_failed', leadId, {
          error: String(error),
          attempts: MAX_RETRIES,
        });
        return { success: false, error: String(error) };
      }
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

/**
 * Push all approved leads for a tenant.
 */
export async function pushApprovedLeads(tenantId: string): Promise<{ pushed: number; failed: number }> {
  const leads = await prisma.lead.findMany({
    where: { tenantId, status: 'approved' },
  });

  let pushed = 0;
  let failed = 0;

  for (const lead of leads) {
    const result = await pushLeadToCRM(lead.id);
    if (result.success) pushed++;
    else failed++;
  }

  return { pushed, failed };
}
