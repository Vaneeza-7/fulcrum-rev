import { askClaudeJsonWithUsage } from '@/lib/ai/claude'
import { SIGNAL_DETECTION_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { DetectedSignal, EnrichmentResult } from '@/lib/ai/types'
import { getTimeDecayMultiplier } from './types'

function normalizeSignals(signals: DetectedSignal[]) {
  return signals
    .filter(
      (signal) =>
        typeof signal.signal_score === 'number' &&
        isFinite(signal.signal_score) &&
        typeof signal.days_ago === 'number' &&
        isFinite(signal.days_ago),
    )
    .map((signal) => ({
      ...signal,
      signal_score:
        Math.max(0, Math.min(signal.signal_score, 15)) *
        getTimeDecayMultiplier(Math.max(0, signal.days_ago)),
      days_ago: Math.max(0, signal.days_ago),
    }))
}

export async function detectSignals(
  enrichment: EnrichmentResult,
  tenantKeywords: Array<{ keyword: string; intentScore: number }>,
  options?: { anthropicApiKey?: string },
): Promise<DetectedSignal[]> {
  const result = await detectSignalsWithUsage(enrichment, tenantKeywords, options)
  return result.signals
}

export async function detectSignalsWithUsage(
  enrichment: EnrichmentResult,
  tenantKeywords: Array<{ keyword: string; intentScore: number }>,
  options?: { anthropicApiKey?: string },
): Promise<{ signals: DetectedSignal[]; usage: { inputTokens: number; outputTokens: number }; model: string }> {
  const keywordContext = tenantKeywords
    .map((k) => `- "${k.keyword}" (intent score: ${k.intentScore}/10)`)
    .join('\n')

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
`

  try {
    const result = await askClaudeJsonWithUsage<DetectedSignal[]>(
      SIGNAL_DETECTION_SYSTEM_PROMPT,
      userMessage,
      { maxTokens: 1500, apiKey: options?.anthropicApiKey },
    )

    return {
      signals: normalizeSignals(result.data),
      usage: result.usage,
      model: result.model,
    }
  } catch (error) {
    console.error('Signal detection failed:', error)
    return {
      signals: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      model: 'fallback',
    }
  }
}

export function calculateIntentScore(signals: DetectedSignal[]): number {
  const totalRaw = signals.reduce((sum, s) => sum + s.signal_score, 0)
  return Math.min(totalRaw, 60)
}
