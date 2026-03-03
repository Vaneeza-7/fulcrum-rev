import { ApifyLeadDiscoveryProvider } from '@/lib/discovery/apify-provider'
import type { LinkedInProfile } from './types'

const provider = new ApifyLeadDiscoveryProvider()

export async function scrapeForTenant(
  queries: Array<{ searchQuery: Record<string, unknown>; maxResults: number }>,
): Promise<LinkedInProfile[]> {
  const result = await provider.searchProspects({
    tenantId: 'legacy',
    tenantSlug: 'legacy',
    primaryProvider: 'apify',
    queries: queries.map((query, index) => ({
      queryName: `Legacy Query ${index + 1}`,
      searchQuery: query.searchQuery as {
        keywords: string
        industry?: string
        companySize?: string
        additionalKeywords?: string
      },
      maxResults: query.maxResults,
    })),
    tenantConfig: {
      instantlyConfig: null,
      apifyApiToken: null,
    },
    credentials: {
      instantly: { apiKey: null, workspaceId: null, usingTenantKey: false },
      apify: { apiToken: process.env.APIFY_API_TOKEN ?? null, usingTenantKey: false },
      anthropic: { apiKey: null, usingTenantKey: false },
    },
  })

  return result.profiles
}
