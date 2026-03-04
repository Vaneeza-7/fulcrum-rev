import type { LinkedInProfile } from '@/lib/pipeline/types'
import type { LeadDiscoveryProvider, LeadDiscoveryRequest, LeadDiscoveryResult } from './provider'
import { translateCurrentQueryToInstantlyFilter } from './translate-query'
import { mapWithConcurrency } from '@/lib/utils/map-with-concurrency'

const INSTANTLY_BASE_URL = 'https://api.instantly.ai/api/v2'
const INSTANTLY_PREVIEW_PATH = '/supersearch-enrichment/preview-leads-from-supersearch'
const INSTANTLY_REQUEST_TIMEOUT_MS = 45_000

function buildLocation(record: Record<string, unknown>) {
  const locationParts = [record.city, record.state, record.country, record.location]
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)

  return locationParts.length > 0 ? locationParts.join(', ') : undefined
}

function mapInstantlyLead(item: Record<string, unknown>): LinkedInProfile | null {
  const linkedinUrl =
    (typeof item.linkedin_url === 'string' && item.linkedin_url) ||
    (typeof item.linkedinUrl === 'string' && item.linkedinUrl) ||
    (typeof item.linkedIn === 'string' && item.linkedIn) ||
    (typeof item.profile_url === 'string' && item.profile_url) ||
    (typeof item.contact_linkedin_url === 'string' && item.contact_linkedin_url) ||
    ''

  const firstName =
    (typeof item.first_name === 'string' && item.first_name) ||
    (typeof item.firstName === 'string' && item.firstName) ||
    ''
  const lastName =
    (typeof item.last_name === 'string' && item.last_name) ||
    (typeof item.lastName === 'string' && item.lastName) ||
    ''

  const fullName =
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    (typeof item.full_name === 'string' && item.full_name) ||
    (typeof item.fullName === 'string' && item.fullName) ||
    (typeof item.name === 'string' && item.name) ||
    ''

  if (!linkedinUrl && !fullName) return null

  return {
    linkedin_url: linkedinUrl,
    full_name: fullName,
    title:
      (typeof item.title === 'string' && item.title) ||
      (typeof item.jobTitle === 'string' && item.jobTitle) ||
      (typeof item.job_title === 'string' && item.job_title) ||
      (typeof item.headline === 'string' && item.headline) ||
      undefined,
    company:
      (typeof item.company_name === 'string' && item.company_name) ||
      (typeof item.companyName === 'string' && item.companyName) ||
      (typeof item.company === 'string' && item.company) ||
      (typeof item.organization_name === 'string' && item.organization_name) ||
      undefined,
    location: buildLocation(item),
    profile_data: item,
  }
}

export class InstantlyLeadDiscoveryProvider implements LeadDiscoveryProvider {
  readonly name = 'instantly' as const

  async searchProspects(input: LeadDiscoveryRequest): Promise<LeadDiscoveryResult> {
    const apiKey = input.credentials.instantly.apiKey
    if (!apiKey) {
      throw new Error('Instantly credentials are not configured')
    }

    const diagnostics: string[] = []
    const queryResults = await mapWithConcurrency(input.queries, 3, async (query) => {
      const translated = translateCurrentQueryToInstantlyFilter(query)

      try {
        const response = await fetch(`${INSTANTLY_BASE_URL}${INSTANTLY_PREVIEW_PATH}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...translated,
            workspace_id: input.credentials.instantly.workspaceId ?? undefined,
          }),
          signal: AbortSignal.timeout(INSTANTLY_REQUEST_TIMEOUT_MS),
        })

        if (!response.ok) {
          throw new Error(`Instantly preview failed: ${response.status} ${await response.text()}`)
        }

        const data = (await response.json()) as {
          items?: Array<Record<string, unknown>>
          data?: Array<Record<string, unknown>>
          leads?: Array<Record<string, unknown>>
          results?: Array<Record<string, unknown>>
        }

        const records = (data.items ?? data.data ?? data.leads ?? data.results ?? []).slice(
          0,
          query.maxResults,
        )
        return {
          ok: true as const,
          rawProfilesReturned: records.length,
          profiles: records.map(mapInstantlyLead).filter(Boolean) as LinkedInProfile[],
        }
      } catch (error) {
        const message = `Instantly query "${query.queryName}" failed: ${String(error)}`
        diagnostics.push(message)
        return {
          ok: false as const,
          rawProfilesReturned: 0,
          profiles: [] as LinkedInProfile[],
          error: message,
        }
      }
    })

    const successfulResults = queryResults.filter((result) => result.ok)
    const failedResults = queryResults.filter((result) => !result.ok)

    if (successfulResults.length === 0) {
      throw new Error(diagnostics.join(' | ') || 'Instantly discovery failed for all queries')
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
