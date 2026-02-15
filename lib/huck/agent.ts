import { askClaudeConversation } from '@/lib/ai/claude';
import { HUCK_SYSTEM_PROMPT, buildHuckResponsePrompt } from '@/lib/ai/prompts';
import { auditLog } from '@/lib/db';
import { classifyIntent } from './intent-classifier';
import { buildContext, saveMessage, loadConversationHistory } from './context-builder';
import { executeActions } from './action-executor';
import { formatLeadsForContext, formatDealsForContext, formatStatsForContext, formatHealthForContext } from './formatters';
import type { HuckResponse, HuckAction, ConversationEntry } from './types';

/**
 * Process an incoming message from Slack and generate Huck's response.
 * This is the main entry point — the Layer 4 orchestrator.
 *
 * Flow: classify intent → resolve entities → build context → generate response → execute actions
 */
export async function processMessage(
  tenantId: string,
  channelId: string,
  threadTs: string | null,
  userMessage: string
): Promise<HuckResponse> {
  // Save the user's message
  await saveMessage(tenantId, channelId, threadTs, 'user', userMessage);

  // Layer 2: Classify intent (Haiku — fast + cheap)
  const recentHistory = await loadConversationHistory(tenantId, channelId, threadTs);
  const lastThree = recentHistory.slice(-3);
  const classification = await classifyIntent(userMessage, lastThree);

  await saveMessage(
    tenantId, channelId, threadTs, 'system',
    `Intent: ${classification.intent} (${classification.confidence})`,
    classification.intent,
    classification.entities as Record<string, unknown>
  );

  // Unknown intent or very low confidence — ask for clarification
  if (classification.intent === 'unknown' || classification.confidence < 0.3) {
    const clarification = "I'm not sure what you're asking. I can help with:\n" +
      "- *Lead queries*: \"show me A+ leads\", \"tell me about [name]\"\n" +
      "- *Pipeline*: \"run the pipeline\", \"when was the last run?\"\n" +
      "- *Deal health*: \"any stalled deals?\", \"how's the [name] deal?\"\n" +
      "- *System status*: \"is everything working?\", \"check CRM\"\n\n" +
      "What would you like to know?";

    await saveMessage(tenantId, channelId, threadTs, 'assistant', clarification);
    return { text: clarification };
  }

  // Layer 3: Build context based on intent
  const context = await buildContext(
    tenantId,
    channelId,
    threadTs,
    classification.intent,
    classification.entities as Record<string, string | undefined>
  );

  // Format context data for the prompt
  const contextParts: string[] = [];
  contextParts.push(`Tenant: ${context.tenant.name} (${context.tenant.productType})`);

  if (context.referencedLeads?.length) {
    contextParts.push(formatLeadsForContext(context.referencedLeads));
  }
  if (context.referencedDeals?.length) {
    contextParts.push(formatDealsForContext(context.referencedDeals));
  }
  if (context.pipelineStats) {
    contextParts.push(formatStatsForContext(context.pipelineStats));
  }
  if (context.systemHealth?.length) {
    contextParts.push(formatHealthForContext(context.systemHealth));
  }

  const contextData = contextParts.join('\n\n');
  const responsePrompt = buildHuckResponsePrompt(userMessage, contextData);

  // Layer 4: Generate response with full conversation context (Sonnet)
  const conversationMessages: ConversationEntry[] = [
    ...recentHistory.filter((m) => m.role === 'user' || m.role === 'assistant'),
    { role: 'user' as const, content: responsePrompt },
  ];

  const responseText = await askClaudeConversation(
    HUCK_SYSTEM_PROMPT,
    conversationMessages
  );

  // Detect actions Huck suggests
  const actions = detectActions(classification.intent, classification.entities, tenantId);

  // Save Huck's response
  await saveMessage(tenantId, channelId, threadTs, 'assistant', responseText);

  // Execute any actions
  if (actions.length > 0) {
    await executeActions(tenantId, actions);
  }

  await auditLog(tenantId, 'huck_response', undefined, {
    intent: classification.intent,
    confidence: classification.confidence,
    actions: actions.map((a) => a.type),
  });

  return { text: responseText, actions };
}

/**
 * Detect executable actions based on the intent.
 * Actions that require confirmation are NOT auto-executed — Huck asks first.
 */
function detectActions(
  intent: string,
  entities: Record<string, unknown>,
  tenantId: string
): HuckAction[] {
  // For now, only auto-execute safe/read-only actions.
  // Destructive actions (push, run pipeline) require explicit user confirmation
  // which will come as a follow-up message.
  switch (intent) {
    case 'system_status':
      return [{ type: 'check_crm', tenantId }];
    default:
      return [];
  }
}
