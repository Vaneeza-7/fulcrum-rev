import { prisma, auditLog } from '@/lib/db';
import { handlePushAllAPlus, handleApproveLead, handleRejectLead } from '@/lib/slack/handlers';
import { BrandEvolutionAgent } from '@/lib/huck/brand-evolution';
import { runPipelineForTenant } from '@/lib/pipeline/orchestrator';
import { runHealthChecks } from '@/lib/health/crm-health';
import { CRMFactory } from '@/lib/crm/factory';
import { decryptTenantConfig } from '@/lib/db-crypto';
import type { CRMAuthConfig } from '@/lib/crm/types';
import type { HuckAction } from './types';

/**
 * Execute actions that Huck has determined need to happen.
 * These are side effects triggered by the conversation.
 */
export async function executeActions(
  tenantId: string,
  actions: HuckAction[]
): Promise<void> {
  for (const action of actions) {
    try {
      switch (action.type) {
        case 'push_lead':
          await handleApproveLead(tenantId, action.leadId);
          await auditLog(tenantId, 'huck_action_push_lead', action.leadId);
          break;

        case 'push_all_aplus':
          await handlePushAllAPlus(action.tenantId);
          await auditLog(tenantId, 'huck_action_push_all_aplus');
          break;

        case 'run_pipeline':
          // Run async — don't block the response
          runPipelineForTenant(action.tenantId).catch((err) => {
            console.error(`[Huck] Pipeline run failed for ${action.tenantId}:`, err);
          });
          await auditLog(tenantId, 'huck_action_run_pipeline');
          break;

        case 'reject_lead':
          await handleRejectLead(tenantId, action.leadId, action.reason, action.rejectReason, action.rejectedBy);
          await auditLog(tenantId, 'huck_action_reject_lead', action.leadId);
          break;

        case 'reject_brand_suggestion':
          await BrandEvolutionAgent.handleBrandSuggestionRejection({
            tenantId,
            brandSuggestionId: action.brandSuggestionId,
            rejectedBy: action.rejectedBy ?? 'huck',
            rejectReasonRaw: action.reason,
          });
          break;

        case 'create_task': {
          const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
          const crmConfig = decryptTenantConfig(tenant.crmConfig as Record<string, string>) as CRMAuthConfig;
          if (!tenant.crmType) break;
          const connector = CRMFactory.create(tenant.crmType, crmConfig);
          await connector.authenticate();
          await connector.createTask(action.dealId, {
            title: action.task,
            description: `Created by Huck AI agent`,
            due_date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
            priority: 'medium',
          });
          await auditLog(tenantId, 'huck_action_create_task', action.dealId, { task: action.task });
          break;
        }

        case 'check_crm':
          await runHealthChecks(action.tenantId);
          await auditLog(tenantId, 'huck_action_check_crm');
          break;

        default:
          console.warn(`[Huck] Unknown action type:`, action);
      }
    } catch (error) {
      console.error(`[Huck] Action execution failed:`, action, error);
    }
  }
}
