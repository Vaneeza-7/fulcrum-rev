import type { LinkedInProfile } from '@/lib/pipeline/types'
import type { LeadDiscoveryProviderName, TenantInstantlyConfig } from '@/lib/settings/api-keys'

export interface LeadDiscoveryQuery {
  queryName: string
  searchQuery: {
    keywords: string
    industry?: string
    companySize?: string
    additionalKeywords?: string
  }
  maxResults: number
}

export interface LeadDiscoveryCredentials {
  instantly: {
    apiKey: string | null
    workspaceId: string | null
    usingTenantKey: boolean
  }
  apify: {
    apiToken: string | null
    usingTenantKey: boolean
  }
  anthropic: {
    apiKey: string | null
    usingTenantKey: boolean
  }
}

export interface LeadDiscoveryRequest {
  tenantId: string
  tenantSlug: string
  primaryProvider: LeadDiscoveryProviderName
  queries: LeadDiscoveryQuery[]
  tenantConfig: {
    instantlyConfig: TenantInstantlyConfig | null
    apifyApiToken: string | null
  }
  credentials: LeadDiscoveryCredentials
}

export interface LeadDiscoveryResult {
  providerUsed: LeadDiscoveryProviderName
  providerFallbackUsed: boolean
  profiles: LinkedInProfile[]
  usage: {
    requests: number
    successfulRequests: number
    failedRequests: number
    rawProfilesReturned: number
    acceptedProfiles: number
  }
  diagnostics: string[]
}

export interface LeadDiscoveryProvider {
  name: LeadDiscoveryProviderName
  searchProspects(input: LeadDiscoveryRequest): Promise<LeadDiscoveryResult>
}
