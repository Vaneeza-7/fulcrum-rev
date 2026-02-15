import { prisma } from '@/lib/db';
import type { HuckContext, HuckIntent, PipelineStats, ConversationEntry } from './types';
import { resolveLeadByName, resolveLeadsByGrade, getRecentLeads, resolveDealByName } from './entity-resolver';

const MAX_CONVERSATION_HISTORY = 20;

/**
 * Load conversation history for a Slack thread.
 * Returns the last N messages in chronological order.
 */
export async function loadConversationHistory(
  tenantId: string,
  channelId: string,
  threadTs: string | null
): Promise<ConversationEntry[]> {
  const messages = await prisma.conversationMessage.findMany({
    where: {
      tenantId,
      slackChannelId: channelId,
      slackThreadTs: threadTs,
    },
    orderBy: { createdAt: 'desc' },
    take: MAX_CONVERSATION_HISTORY,
  });

  return messages.reverse().map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));
}

/**
 * Save a message to conversation history.
 */
export async function saveMessage(
  tenantId: string,
  channelId: string,
  threadTs: string | null,
  role: 'user' | 'assistant' | 'system',
  content: string,
  intent?: string,
  entities?: Record<string, unknown>
): Promise<void> {
  await prisma.conversationMessage.create({
    data: {
      tenantId,
      slackChannelId: channelId,
      slackThreadTs: threadTs,
      role,
      content,
      intent,
      entitiesJson: (entities ?? {}) as any,
    },
  });
}

/**
 * Build the full context for Huck's response generation.
 * Loads relevant data based on the classified intent.
 */
export async function buildContext(
  tenantId: string,
  channelId: string,
  threadTs: string | null,
  intent: HuckIntent,
  entities: Record<string, string | undefined>
): Promise<HuckContext> {
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const conversationHistory = await loadConversationHistory(tenantId, channelId, threadTs);

  const context: HuckContext = { tenant, conversationHistory };

  switch (intent) {
    case 'lead_query': {
      if (entities.grade) {
        context.referencedLeads = await resolveLeadsByGrade(tenantId, entities.grade);
      } else {
        context.referencedLeads = await getRecentLeads(tenantId, 10);
      }
      break;
    }

    case 'lead_detail': {
      if (entities.leadName) {
        const resolved = await resolveLeadByName(tenantId, entities.leadName);
        if (resolved.match) {
          context.referencedLeads = [resolved.match];
        }
      }
      break;
    }

    case 'deal_health': {
      if (entities.dealName) {
        const resolved = await resolveDealByName(tenantId, entities.dealName);
        if (resolved.match) {
          context.referencedDeals = [resolved.match];
        }
      } else {
        // Get all stalled deals
        context.referencedDeals = await prisma.dealDiagnostic.findMany({
          where: { tenantId, isStalled: true },
          orderBy: { updatedAt: 'desc' },
          take: 10,
        });
      }
      break;
    }

    case 'system_status': {
      context.systemHealth = await prisma.systemHealthCheck.findMany({
        where: { tenantId },
        orderBy: { checkedAt: 'desc' },
        take: 10,
      });
      context.pipelineStats = await getPipelineStats(tenantId);
      break;
    }

    case 'pipeline_control': {
      context.pipelineStats = await getPipelineStats(tenantId);
      break;
    }

    case 'content_query': {
      // Load service profiles, recent content assets with EVS, saturation data
      const [services, topAssets, recentAllocations] = await Promise.all([
        prisma.serviceProfile.findMany({ where: { tenantId, isActive: true }, orderBy: { margin: 'desc' } }),
        prisma.contentAsset.findMany({
          where: { tenantId, status: { not: 'killed' } },
          orderBy: { evs: 'desc' },
          take: 15,
        }),
        prisma.auditLog.findFirst({
          where: { tenantId, actionType: 'content_allocation_complete' },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      (context as any).serviceProfiles = services;
      (context as any).contentAssets = topAssets;
      (context as any).lastAllocation = recentAllocations?.details ?? null;
      break;
    }

    case 'seo_status': {
      // Load recent SEO audits, keyword position changes, pending refresh briefs
      const [audits, drops, pendingBriefs] = await Promise.all([
        prisma.sEOAudit.findMany({
          where: { tenantId },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.sEOKeywordTracker.findMany({
          where: { tenantId, positionDelta: { gt: 3 } },
          orderBy: { positionDelta: 'desc' },
          take: 15,
        }),
        prisma.sEOAudit.findMany({
          where: { tenantId, status: 'brief_generated', auditType: 'position_drop' },
          take: 5,
        }),
      ]);
      (context as any).seoAudits = audits;
      (context as any).keywordDrops = drops;
      (context as any).pendingRefreshBriefs = pendingBriefs;
      break;
    }

    case 'cro_status': {
      // Load recent CRO audits, active A/B tests, page benchmarks
      const [croAudits, activeTests] = await Promise.all([
        prisma.cROAudit.findMany({
          where: { tenantId },
          orderBy: { auditedAt: 'desc' },
          take: 10,
        }),
        prisma.aBTest.findMany({
          where: { tenantId, status: { in: ['queued', 'running'] } },
          orderBy: { priority: 'desc' },
        }),
      ]);
      (context as any).croAudits = croAudits;
      (context as any).activeABTests = activeTests;
      break;
    }

    case 'content_roi': {
      // Load asset performance, monthly report, pipeline attribution
      const [revenueChampions, killList, lastReport] = await Promise.all([
        prisma.contentAsset.findMany({
          where: { tenantId, attributedRevenue: { gt: 0 } },
          orderBy: { attributedRevenue: 'desc' },
          take: 10,
        }),
        prisma.contentAsset.findMany({
          where: { tenantId, status: 'deployed', evs: { lt: 20 } },
          orderBy: { evs: 'asc' },
          take: 10,
        }),
        prisma.auditLog.findFirst({
          where: { tenantId, actionType: 'content_roi_complete' },
          orderBy: { createdAt: 'desc' },
        }),
      ]);
      (context as any).revenueChampions = revenueChampions;
      (context as any).killList = killList;
      (context as any).lastROIReport = lastReport?.details ?? null;
      break;
    }

    case 'config_change':
      // Tenant data already loaded — config changes are handled via response generation
      break;

    case 'help':
    case 'unknown':
      // No additional data needed — Huck responds from system prompt knowledge
      break;
  }

  return context;
}

/**
 * Get pipeline statistics for a tenant.
 */
async function getPipelineStats(tenantId: string): Promise<PipelineStats> {
  const [totalLeads, pendingReview, pushedToCrm, stalledDeals, lastAudit] = await Promise.all([
    prisma.lead.count({ where: { tenantId } }),
    prisma.lead.count({ where: { tenantId, status: 'pending_review' } }),
    prisma.lead.count({ where: { tenantId, status: 'pushed_to_crm' } }),
    prisma.dealDiagnostic.count({ where: { tenantId, isStalled: true } }),
    prisma.auditLog.findFirst({
      where: { tenantId, actionType: 'pipeline_completed' },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Grade distribution
  const leads = await prisma.lead.groupBy({
    by: ['fulcrumGrade'],
    where: { tenantId, fulcrumGrade: { not: null } },
    _count: true,
  });

  const gradeDistribution: Record<string, number> = {};
  for (const row of leads) {
    if (row.fulcrumGrade) {
      gradeDistribution[row.fulcrumGrade] = row._count;
    }
  }

  return {
    totalLeads,
    pendingReview,
    pushedToCrm,
    gradeDistribution,
    stalledDeals,
    lastPipelineRun: lastAudit?.createdAt.toISOString() ?? null,
  };
}
