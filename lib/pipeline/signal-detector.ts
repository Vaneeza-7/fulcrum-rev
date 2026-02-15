import { askClaudeJson } from '@/lib/ai/claude';
import { SIGNAL_DETECTION_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { DetectedSignal, EnrichmentResult } from '@/lib/ai/types';
import { getTimeDecayMultiplier } from './types';

/**
 * Detect intent signals from enrichment data using Claude.
 * Returns raw signals with time-decayed scores.
 */
export async function detectSignals(
  enrichment: EnrichmentResult,
  tenantKeywords: Array<{ keyword: string; intentScore: number }>
): Promise<DetectedSignal[]> {
  const keywordContext = tenantKeywords
    .map((k) => `- "${k.keyword}" (intent score: ${k.intentScore}/10)`)
    .join('\n');

  const userMessage = `
Enrichment Data:
${JSON.stringify(enrichment, null, 2)}

Tenant's Monitored Intent Keywords:
${keywordContext}

Analyze this enrichment data and detect any intent signals. Check for:
1. Job changes (new role in the last 6 months)
2. Funding events (Series A, B, Seed)
3. Hiring surges
4. Mentions of monitored keywords
5. Pain points expressed
6. Competitor research activity
7. Pricing page visits (from GA4/Clearbit identification)
8. High content engagement (time-on-page on service content)
9. Partial form submissions (started form but didn't complete)
10. Multi-page sessions (visited 3+ pages in single session)
`;

  try {
    const signals = await askClaudeJson<DetectedSignal[]>(
      SIGNAL_DETECTION_SYSTEM_PROMPT,
      userMessage,
      { maxTokens: 1500 }
    );

    // Apply time decay to each signal
    return signals.map((signal) => ({
      ...signal,
      signal_score: signal.signal_score * getTimeDecayMultiplier(signal.days_ago),
    }));
  } catch (error) {
    console.error('Signal detection failed:', error);
    return [];
  }
}

/**
 * Calculate total intent score from detected signals.
 * Capped at 60 points as per the Fulcrum formula.
 */
export function calculateIntentScore(signals: DetectedSignal[]): number {
  const totalRaw = signals.reduce((sum, s) => sum + s.signal_score, 0);
  return Math.min(totalRaw, 60); // Cap at 60
}
