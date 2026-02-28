import { prisma, auditLog } from '@/lib/db';
import { CRMFactory } from '@/lib/crm/factory';
import { CRMAuthConfig } from '@/lib/crm/types';
import { sendLeadReviewThread } from './client';
import { SlackLeadCard } from './types';
import * as monitoringDb from '@/lib/monitoring-db';
import { HITLProcessor } from '@/lib/hitl/hitl-processor';
import { NegativeReason } from '@prisma/client';

/**
 * Handle "Push All A+" button click.
 * Approves and pushes all A+ leads for the tenant.
 */
export async function handlePushAllAPlus(tenantId: string): Promise<{ pushed: number; errors: string[] }> {
  const leads = await prisma.lead.findMany({
    where: {
      tenantId,
      status: 'pending_review',
      fulcrumGrade: 'A+',
    },
  });

  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  if (!tenant.crmType) {
    return { pushed: 0, errors: ['No CRM configured for this tenant'] };
  }
  const crm = CRMFactory.create(tenant.crmType, tenant.crmConfig as CRMAuthConfig);
  await crm.authenticate();

  let pushed = 0;
  const errors: string[] = [];

  for (const lead of leads) {
    try {
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
        source: 'Fulcrum',
      });

      await prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: 'pushed_to_crm',
          crmLeadId,
          pushedToCrmAt: new Date(),
        },
      });

      await auditLog(tenantId, 'lead_pushed_to_crm', lead.id, { crmLeadId });
      pushed++;
    } catch (error) {
      errors.push(`${lead.fullName}: ${error}`);
    }
  }

  return { pushed, errors };
}

/**
 * Handle "Approve" button on a single lead.
 */
export async function handleApproveLead(tenantId: string, leadId: string): Promise<{ success: boolean; crmLeadId?: string; error?: string }> {
  try {
    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });

    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    if (!tenant.crmType) {
      return { success: false, error: 'No CRM configured for this tenant' };
    }
    const crm = CRMFactory.create(tenant.crmType, tenant.crmConfig as CRMAuthConfig);
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
      source: 'Fulcrum',
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        status: 'pushed_to_crm',
        crmLeadId,
        pushedToCrmAt: new Date(),
      },
    });

    await auditLog(tenantId, 'lead_approved', leadId, { crmLeadId });
    return { success: true, crmLeadId };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Handle "Reject" button on a single lead.
 */
export async function handleRejectLead(
  tenantId: string,
  leadId: string,
  reason?: string,
  rejectReason?: NegativeReason,
  rejectedBy?: string,
): Promise<void> {
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      status: 'rejected',
      rejectionReason: reason ?? 'Rejected via Slack',
    },
  });

  await auditLog(tenantId, 'lead_rejected', leadId, { reason });

  // Create NegativeSignal for HITL feedback loop
  await HITLProcessor.processRejection({
    tenantId,
    leadId,
    rejectReason: rejectReason ?? NegativeReason.OTHER,
    rejectReasonRaw: reason,
    rejectedBy: rejectedBy ?? 'slack_user',
  });
}

/**
 * Handle rejection of a brand suggestion.
 */
export async function handleRejectBrandSuggestion(
  tenantId: string,
  brandSuggestionId: string,
  reason?: string,
  rejectedBy?: string,
): Promise<void> {
  await HITLProcessor.processRejection({
    tenantId,
    brandSuggestionId,
    rejectReason: NegativeReason.BRAND_MISMATCH,
    rejectReasonRaw: reason,
    rejectedBy: rejectedBy ?? 'slack_user',
  });

  await auditLog(tenantId, 'brand_suggestion_rejected', brandSuggestionId, { reason });
}

/**
 * Handle "Review All Leads" button.
 * Posts individual lead cards in a thread for review.
 */
export async function handleReviewLeads(tenantId: string, threadTs?: string): Promise<void> {
  const leads = await prisma.lead.findMany({
    where: { tenantId, status: 'pending_review' },
    orderBy: { fulcrumScore: 'desc' },
    take: 30,
  });

  const leadCards: SlackLeadCard[] = leads.map((l) => ({
    lead_id: l.id,
    full_name: l.fullName,
    title: l.title ?? '',
    company: l.company ?? '',
    fulcrum_score: Number(l.fulcrumScore),
    fulcrum_grade: l.fulcrumGrade ?? '',
    fit_score: Number(l.fitScore),
    intent_score: Number(l.intentScore),
    first_line: l.firstLine ?? '',
    linkedin_url: l.linkedinUrl,
  }));

  await sendLeadReviewThread(tenantId, leadCards, threadTs);
}

/**
 * Handle "Reject D Grade" button.
 */
export async function handleRejectGrade(tenantId: string, grades: string[]): Promise<number> {
  const result = await prisma.lead.updateMany({
    where: {
      tenantId,
      status: 'pending_review',
      fulcrumGrade: { in: grades },
    },
    data: {
      status: 'rejected',
      rejectionReason: `Auto-rejected: grade ${grades.join(', ')}`,
    },
  });

  await auditLog(tenantId, 'leads_bulk_rejected', undefined, { grades, count: result.count });
  return result.count;
}

/**
 * Handle "Dismiss" button on a monitoring alert.
 */
export async function handleMonitoringDismiss(
  alertId: string,
  resourceId: string,
  userId: string
): Promise<void> {
  await monitoringDb.dismissAlert(alertId, userId);
}

/**
 * Handle "Acknowledge" button on a monitoring alert.
 */
export async function handleMonitoringAck(
  alertId: string,
  resourceId: string,
  userId: string
): Promise<void> {
  await monitoringDb.acknowledgeAlert(alertId, userId);
}

/**
 * Handle "Suppress Resource" button on a monitoring alert.
 */
export async function handleMonitoringSuppress(
  alertId: string,
  resourceId: string,
  resourceName: string,
  userId: string
): Promise<void> {
  await monitoringDb.suppressResource(resourceId, resourceName, userId);
}
