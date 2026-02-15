import { askClaude } from '@/lib/ai/claude';
import { FIRST_LINE_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { EnrichmentResult } from '@/lib/ai/types';
import { LinkedInProfile } from './types';

/**
 * Generate a personalized email first line for a lead.
 * Uses profile data + enrichment for maximum personalization.
 */
export async function generateFirstLine(
  profile: LinkedInProfile,
  enrichment: EnrichmentResult,
  productContext: string
): Promise<string> {
  const userMessage = `
Prospect:
- Name: ${profile.full_name}
- Title: ${profile.title ?? 'Unknown'}
- Company: ${profile.company ?? 'Unknown'}
- Location: ${profile.location ?? 'Unknown'}

Company Intel:
- Industry: ${enrichment.industry} (${enrichment.industry_subcategory})
- Size: ~${enrichment.company_size_estimate} employees
- Funding: ${enrichment.funding_stage ?? 'Unknown'} ${enrichment.funding_amount ? `($${(enrichment.funding_amount / 1000000).toFixed(1)}M)` : ''}
- Recent events: ${enrichment.recent_events.join(', ') || 'None found'}
- Pain points: ${enrichment.pain_points.join(', ') || 'None identified'}

Product we're selling: ${productContext}

Write a personalized first line for a cold email to ${profile.full_name}.
`;

  try {
    const firstLine = await askClaude(
      FIRST_LINE_SYSTEM_PROMPT,
      userMessage,
      { maxTokens: 150 }
    );
    return firstLine.trim();
  } catch (error) {
    console.error(`First line generation failed for ${profile.full_name}:`, error);
    return '';
  }
}
