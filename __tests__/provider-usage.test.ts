import { describe, expect, it } from 'vitest'
import { recordAnthropicUsage, recordPerplexityUsage } from '@/lib/billing/provider-usage'

describe('provider usage metering guards', () => {
  it('skips anthropic ledger work when no tokens were consumed', async () => {
    const result = await recordAnthropicUsage({
      context: {
        tenantId: 'tenant-id',
        provider: 'anthropic',
        feature: 'pipeline',
        stage: 'pipeline.enrichment.analysis',
      },
      model: 'fallback',
      inputTokens: 0,
      outputTokens: 0,
      tenantOwnedCredentialUsed: false,
    })

    expect(result).toBeNull()
  })

  it('skips perplexity ledger work when no usage or direct cost was recorded', async () => {
    const result = await recordPerplexityUsage({
      context: {
        tenantId: 'tenant-id',
        provider: 'perplexity',
        feature: 'pipeline',
        stage: 'pipeline.enrichment.research',
      },
      model: 'fallback',
      requestCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      searchQueries: 0,
      directCostUsdMicros: null,
      tenantOwnedCredentialUsed: false,
    })

    expect(result).toBeNull()
  })
})
