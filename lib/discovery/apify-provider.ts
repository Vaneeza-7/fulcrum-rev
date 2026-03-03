import type { LinkedInProfile } from '@/lib/pipeline/types'
import type { LeadDiscoveryProvider, LeadDiscoveryRequest, LeadDiscoveryResult } from './provider'

const APIFY_BASE = 'https://api.apify.com/v2'

interface ApifyRunResult {
  id: string
  status: string
}

async function startLinkedInSearch(
  apiToken: string,
  searchQuery: Record<string, unknown>,
  maxResults = 10,
): Promise<string> {
  const response = await fetch(
    `${APIFY_BASE}/acts/harvestapi~linkedin-profile-search/runs?token=${apiToken}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...searchQuery,
        maxResults,
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Apify run failed: ${response.status} ${await response.text()}`)
  }

  const result = (await response.json()) as { data: ApifyRunResult }
  return result.data.id
}

async function waitForResults(apiToken: string, runId: string): Promise<LinkedInProfile[]> {
  const maxWait = 5 * 60 * 1000
  const pollInterval = 10000
  const start = Date.now()

  while (Date.now() - start < maxWait) {
    const statusRes = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${apiToken}`)
    const statusData = (await statusRes.json()) as { data: ApifyRunResult }

    if (statusData.data.status === 'SUCCEEDED') {
      return fetchRunDataset(apiToken, runId)
    }

    if (statusData.data.status === 'FAILED' || statusData.data.status === 'ABORTED') {
      throw new Error(`Apify run ${runId} failed with status: ${statusData.data.status}`)
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  throw new Error(`Apify run ${runId} timed out after 5 minutes`)
}

async function fetchRunDataset(apiToken: string, runId: string): Promise<LinkedInProfile[]> {
  const response = await fetch(`${APIFY_BASE}/actor-runs/${runId}/dataset/items?token=${apiToken}`)
  if (!response.ok) {
    throw new Error(`Failed to fetch dataset: ${response.status}`)
  }

  const items = (await response.json()) as Array<Record<string, unknown>>

  return items.map((item) => ({
    linkedin_url: String(item.profileUrl ?? item.url ?? ''),
    full_name: String(item.fullName ?? item.name ?? ''),
    title: item.headline ? String(item.headline) : undefined,
    company: item.companyName ? String(item.companyName) : undefined,
    location: item.location ? String(item.location) : undefined,
    profile_data: item,
  }))
}

export class ApifyLeadDiscoveryProvider implements LeadDiscoveryProvider {
  readonly name = 'apify' as const

  async searchProspects(input: LeadDiscoveryRequest): Promise<LeadDiscoveryResult> {
    const apiToken = input.credentials.apify.apiToken
    if (!apiToken) {
      throw new Error('Apify credentials are not configured')
    }

    const profiles: LinkedInProfile[] = []
    const diagnostics: string[] = []
    let requests = 0
    let rawProfilesReturned = 0

    for (const query of input.queries) {
      requests++
      try {
        const runId = await startLinkedInSearch(apiToken, query.searchQuery, query.maxResults)
        const queryProfiles = await waitForResults(apiToken, runId)
        rawProfilesReturned += queryProfiles.length
        profiles.push(...queryProfiles)
      } catch (error) {
        diagnostics.push(`Apify query "${query.queryName}" failed: ${String(error)}`)
      }
    }

    return {
      providerUsed: this.name,
      providerFallbackUsed: false,
      profiles,
      usage: {
        requests,
        rawProfilesReturned,
        acceptedProfiles: profiles.length,
      },
      diagnostics,
    }
  }
}
