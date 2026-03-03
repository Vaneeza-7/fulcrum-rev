import { askClaudeJsonWithUsage, type ClaudeCallResult } from '@/lib/ai/claude'
import { researchCompany } from '@/lib/ai/perplexity'
import { ENRICHMENT_SYSTEM_PROMPT } from '@/lib/ai/prompts'
import { EnrichmentResult } from '@/lib/ai/types'
import { LinkedInProfile } from './types'

export async function enrichProfile(
  profile: LinkedInProfile,
  options?: { anthropicApiKey?: string; perplexityApiKey?: string },
): Promise<EnrichmentResult> {
  const result = await enrichProfileWithUsage(profile, options)
  return result.enrichment
}

export async function enrichProfileWithUsage(
  profile: LinkedInProfile,
  options?: { anthropicApiKey?: string; perplexityApiKey?: string },
): Promise<{
  enrichment: EnrichmentResult
  usage: ClaudeCallResult['usage']
  model: string
  researchUsage: { inputTokens: number; outputTokens: number; searchQueries: number }
  researchModel: string
  researchProviderCostUsdMicros: number | null
}> {
  const company = profile.company ?? 'Unknown Company'
  const name = profile.full_name
  const title = profile.title ?? ''

  let perplexityData
  try {
    perplexityData = await researchCompany(company, name, title, {
      apiKey: options?.perplexityApiKey,
    })
  } catch (error) {
    console.error(`Perplexity research failed for ${company}:`, error)
    perplexityData = {
      raw: '',
      fundingInfo: 'No data available',
      companySize: 'No data available',
      recentNews: 'No data available',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        searchQueries: 0,
      },
      providerCostUsdMicros: null,
      model: 'fallback',
    }
  }

  const userMessage = `
LinkedIn Profile:
- Name: ${name}
- Title: ${title}
- Company: ${company}
- Location: ${profile.location ?? 'Unknown'}
- Additional profile data: ${JSON.stringify(profile.profile_data).slice(0, 2000)}

Web Research (from Perplexity):
Funding Info: ${perplexityData.fundingInfo}
Company Size: ${perplexityData.companySize}
Recent News: ${perplexityData.recentNews}
`

  try {
    const enrichment = await askClaudeJsonWithUsage<EnrichmentResult>(
      ENRICHMENT_SYSTEM_PROMPT,
      userMessage,
      { maxTokens: 1500, apiKey: options?.anthropicApiKey },
    )
    return {
      enrichment: enrichment.data,
      usage: enrichment.usage,
      model: enrichment.model,
      researchUsage: perplexityData.usage,
      researchModel: perplexityData.model,
      researchProviderCostUsdMicros: perplexityData.providerCostUsdMicros,
    }
  } catch (error) {
    console.error(`Claude enrichment failed for ${name}:`, error)
    return {
      enrichment: {
        company_size_estimate: 0,
        industry: 'Unknown',
        industry_subcategory: 'Unknown',
        funding_stage: null,
        funding_amount: null,
        tech_stack: [],
        pain_points: [],
        buying_signals: [],
        recent_events: [],
        decision_maker_level: 'ic',
        budget_timing: null,
        competitor_mentions: [],
        confidence_score: 0,
      },
      usage: {
        inputTokens: 0,
        outputTokens: 0,
      },
      model: 'fallback',
      researchUsage: perplexityData.usage,
      researchModel: perplexityData.model,
      researchProviderCostUsdMicros: perplexityData.providerCostUsdMicros,
    }
  }
}
