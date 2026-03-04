import { env } from '@/lib/config'
import { ApifyLeadDiscoveryProvider } from './apify-provider'
import { InstantlyLeadDiscoveryProvider } from './instantly-provider'
import type { LeadDiscoveryProviderName, TenantInstantlyConfig } from '@/lib/settings/api-keys'
import {
  resolveAnthropicCredentials,
  resolveApifyCredentials,
  resolveInstantlyCredentials,
  resolveLeadDiscoveryProvider,
} from '@/lib/settings/api-keys'
import type { LeadDiscoveryQuery, LeadDiscoveryRequest, LeadDiscoveryResult } from './provider'

const instantlyProvider = new InstantlyLeadDiscoveryProvider()
const apifyProvider = new ApifyLeadDiscoveryProvider()

function normalizeQueries(
  queries: Array<{
    queryName: string
    searchQuery: unknown
    maxResults: number
  }>,
): LeadDiscoveryQuery[] {
  return queries.map((query) => ({
    queryName: query.queryName,
    searchQuery: query.searchQuery as LeadDiscoveryQuery['searchQuery'],
    maxResults: query.maxResults,
  }))
}

export function shouldFallbackToApify(error: unknown) {
  const message = String(error).toLowerCase()
  return (
    message.includes('401') ||
    message.includes('403') ||
    message.includes('408') ||
    message.includes('429') ||
    message.includes('500') ||
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('auth') ||
    message.includes('credential') ||
    message.includes('config') ||
    message.includes('unauthorized') ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('econnreset')
  )
}

export class LeadDiscoveryService {
  static async discoverForTenant(tenant: {
    id: string
    slug: string
    leadDiscoveryProvider?: string | null
    instantlyConfig: unknown
    apifyApiToken: string | null
    anthropicApiKey: string | null
    searchQueries: Array<{
      queryName: string
      searchQuery: unknown
      maxResults: number
    }>
  }): Promise<LeadDiscoveryResult & { credentials: LeadDiscoveryRequest['credentials'] }> {
    const primaryProvider = resolveLeadDiscoveryProvider(
      tenant.leadDiscoveryProvider ?? env.DEFAULT_DISCOVERY_PROVIDER,
    )

    const credentials = {
      instantly: resolveInstantlyCredentials(tenant),
      apify: resolveApifyCredentials(tenant),
      anthropic: resolveAnthropicCredentials(tenant),
    }

    const request: LeadDiscoveryRequest = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      primaryProvider,
      queries: normalizeQueries(tenant.searchQueries),
      tenantConfig: {
        instantlyConfig: tenant.instantlyConfig as TenantInstantlyConfig | null,
        apifyApiToken: credentials.apify.apiToken,
      },
      credentials,
    }

    try {
      if (primaryProvider === 'apify') {
        const result = await apifyProvider.searchProspects(request)
        return { ...result, credentials }
      }

      const result = await instantlyProvider.searchProspects(request)
      return { ...result, credentials }
    } catch (error) {
      if (
        primaryProvider === 'instantly' &&
        shouldFallbackToApify(error) &&
        credentials.apify.apiToken
      ) {
        const fallback = await apifyProvider.searchProspects(request)
        return {
          ...fallback,
          providerFallbackUsed: true,
          diagnostics: [
            `Instantly failed and Apify fallback was used: ${String(error)}`,
            ...fallback.diagnostics,
          ],
          credentials,
        }
      }

      throw error
    }
  }
}
