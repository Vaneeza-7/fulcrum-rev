import { askClaudeJson } from '@/lib/ai/claude';
import { researchCompany } from '@/lib/ai/perplexity';
import { ENRICHMENT_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { EnrichmentResult } from '@/lib/ai/types';
import { LinkedInProfile } from './types';

/**
 * Enrich a single lead profile using Perplexity (web search) + Claude (analysis).
 *
 * Step 1: Perplexity searches for company funding, size, and news
 * Step 2: Claude analyzes the combined data and produces structured enrichment
 */
export async function enrichProfile(
  profile: LinkedInProfile
): Promise<EnrichmentResult> {
  const company = profile.company ?? 'Unknown Company';
  const name = profile.full_name;
  const title = profile.title ?? '';

  // Step 1: Perplexity web search for real-time data
  let perplexityData;
  try {
    perplexityData = await researchCompany(company, name, title);
  } catch (error) {
    console.error(`Perplexity research failed for ${company}:`, error);
    perplexityData = {
      raw: '',
      fundingInfo: 'No data available',
      companySize: 'No data available',
      recentNews: 'No data available',
    };
  }

  // Step 2: Claude analyzes everything
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
`;

  try {
    const enrichment = await askClaudeJson<EnrichmentResult>(
      ENRICHMENT_SYSTEM_PROMPT,
      userMessage,
      { maxTokens: 1500 }
    );
    return enrichment;
  } catch (error) {
    console.error(`Claude enrichment failed for ${name}:`, error);
    return {
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
    };
  }
}

/**
 * Enrich multiple profiles with concurrency control.
 */
export async function enrichProfiles(
  profiles: LinkedInProfile[],
  concurrency: number = 3
): Promise<Map<string, EnrichmentResult>> {
  const results = new Map<string, EnrichmentResult>();
  const queue = [...profiles];

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const profile = queue.shift();
      if (!profile) break;
      const result = await enrichProfile(profile);
      results.set(profile.linkedin_url, result);
    }
  });

  await Promise.all(workers);
  return results;
}
