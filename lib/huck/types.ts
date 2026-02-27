import type { Tenant, Lead, DealDiagnostic, SystemHealthCheck, NegativeReason } from '@prisma/client';

// ============================================================================
// INTENT CLASSIFICATION
// ============================================================================

export type HuckIntent =
  | 'lead_query'        // "show me A+ leads", "how many leads today?"
  | 'lead_detail'       // "tell me about Sarah Chen"
  | 'pipeline_control'  // "run the pipeline", "pause scraping"
  | 'deal_health'       // "any stalled deals?", "how's the Johnson deal?"
  | 'system_status'     // "is everything working?", "check CRM connection"
  | 'config_change'     // "change scoring weight for..."
  | 'content_query'     // "what content should we create?", "EVS rankings", "saturated topics?"
  | 'seo_status'        // "any ranking drops?", "SEO health", "cannibalization?"
  | 'cro_status'        // "website conversions?", "pricing page performance?"
  | 'content_roi'       // "which content drives revenue?", "kill list", "revenue champions"
  | 'help'              // "what can you do?"
  | 'unknown';

export interface ClassifiedIntent {
  intent: HuckIntent;
  entities: {
    leadName?: string;
    grade?: string;
    tenantName?: string;
    dealName?: string;
    timeRange?: string;  // "today", "this week", "last 7 days"
  };
  confidence: number;
}

// ============================================================================
// CONTEXT
// ============================================================================

export interface HuckContext {
  tenant: Tenant;
  conversationHistory: ConversationEntry[];
  referencedLeads?: Lead[];
  referencedDeals?: DealDiagnostic[];
  systemHealth?: SystemHealthCheck[];
  pipelineStats?: PipelineStats;
}

export interface PipelineStats {
  totalLeads: number;
  pendingReview: number;
  pushedToCrm: number;
  gradeDistribution: Record<string, number>;
  stalledDeals: number;
  lastPipelineRun: string | null;
}

// ============================================================================
// RESPONSE
// ============================================================================

export interface HuckResponse {
  text: string;
  blocks?: unknown[];        // Slack Block Kit blocks for rich formatting
  actions?: HuckAction[];    // Side effects to execute after responding
}

export type HuckAction =
  | { type: 'push_lead'; leadId: string }
  | { type: 'push_all_aplus'; tenantId: string }
  | { type: 'run_pipeline'; tenantId: string }
  | { type: 'create_task'; dealId: string; task: string }
  | { type: 'check_crm'; tenantId: string }
  | { type: 'reject_lead'; leadId: string; reason: string; rejectReason?: NegativeReason; rejectedBy?: string }
  | { type: 'reject_brand_suggestion'; brandSuggestionId: string; reason?: string; rejectedBy?: string };

// ============================================================================
// CONVERSATION
// ============================================================================

export interface ConversationEntry {
  role: 'user' | 'assistant';
  content: string;
}
