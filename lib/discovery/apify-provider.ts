import type { LinkedInProfile } from '@/lib/pipeline/types'
import type { LeadDiscoveryProvider, LeadDiscoveryRequest, LeadDiscoveryResult } from './provider'
import { mapWithConcurrency } from '@/lib/utils/map-with-concurrency'

const APIFY_BASE = 'https://api.apify.com/v2'
const APIFY_QUERY_MAX_WAIT_MS = 90_000
const APIFY_QUERY_POLL_INTERVAL_MS = 5_000

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
  const start = Date.now()

  while (Date.now() - start < APIFY_QUERY_MAX_WAIT_MS) {
    const statusRes = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${apiToken}`)
    const statusData = (await statusRes.json()) as { data: ApifyRunResult }

    if (statusData.data.status === 'SUCCEEDED') {
      return fetchRunDataset(apiToken, runId)
    }

    if (statusData.data.status === 'FAILED' || statusData.data.status === 'ABORTED') {
      throw new Error(`Apify run ${runId} failed with status: ${statusData.data.status}`)
    }

    await new Promise((resolve) => setTimeout(resolve, APIFY_QUERY_POLL_INTERVAL_MS))
  }

  throw new Error(`Apify run ${runId} timed out after ${APIFY_QUERY_MAX_WAIT_MS}ms`)
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

    const diagnostics: string[] = []
    const queryResults = await mapWithConcurrency(input.queries, 3, async (query) => {
      try {
        const runId = await startLinkedInSearch(apiToken, query.searchQuery, query.maxResults)
        const profiles = await waitForResults(apiToken, runId)
        return {
          ok: true as const,
          profiles,
          rawProfilesReturned: profiles.length,
        }
      } catch (error) {
        const message = `Apify query "${query.queryName}" failed: ${String(error)}`
        diagnostics.push(message)
        return {
          ok: false as const,
          profiles: [] as LinkedInProfile[],
          rawProfilesReturned: 0,
          error: message,
        }
      }
    })

    const successfulResults = queryResults.filter((result) => result.ok)
    const failedResults = queryResults.filter((result) => !result.ok)

    if (successfulResults.length === 0) {
      throw new Error(diagnostics.join(' | ') || 'Apify discovery failed for all queries')
    }

    const profiles = successfulResults.flatMap((result) => result.profiles)
    const rawProfilesReturned = successfulResults.reduce((sum, result) => sum + result.rawProfilesReturned, 0)

    return {
      providerUsed: this.name,
      providerFallbackUsed: false,
      profiles,
      usage: {
        requests: input.queries.length,
        successfulRequests: successfulResults.length,
        failedRequests: failedResults.length,
        rawProfilesReturned,
        acceptedProfiles: profiles.length,
      },
      diagnostics,
    }
  }
}
