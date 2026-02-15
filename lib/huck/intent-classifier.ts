import { askClaudeJson } from '@/lib/ai/claude';
import { HUCK_INTENT_CLASSIFIER_PROMPT } from '@/lib/ai/prompts';
import type { ClassifiedIntent, HuckIntent, ConversationEntry } from './types';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Classify the user's intent using Claude Haiku for speed/cost.
 * Includes last 3 messages for conversational context.
 */
export async function classifyIntent(
  userMessage: string,
  recentMessages: ConversationEntry[] = []
): Promise<ClassifiedIntent> {
  const contextBlock = recentMessages.length > 0
    ? `Recent conversation:\n${recentMessages.map((m) => `${m.role}: ${m.content}`).join('\n')}\n\n`
    : '';

  const prompt = `${contextBlock}Current message: ${userMessage}`;

  try {
    const result = await askClaudeJson<ClassifiedIntent>(
      HUCK_INTENT_CLASSIFIER_PROMPT,
      prompt,
      { model: HAIKU_MODEL, maxTokens: 256 }
    );

    // Validate intent is a known type
    const validIntents: HuckIntent[] = [
      'lead_query', 'lead_detail', 'pipeline_control', 'deal_health',
      'system_status', 'config_change', 'content_query', 'seo_status',
      'cro_status', 'content_roi', 'help', 'unknown',
    ];

    if (!validIntents.includes(result.intent)) {
      result.intent = 'unknown';
    }

    return result;
  } catch (error) {
    console.error('[Huck] Intent classification failed:', error);
    return {
      intent: 'unknown',
      entities: {},
      confidence: 0,
    };
  }
}
