import { LinkedInProfile } from './types';

const APIFY_BASE = 'https://api.apify.com/v2';

interface ApifyRunResult {
  id: string;
  status: string;
}

/**
 * Start an Apify actor run for LinkedIn profile search.
 * Uses the harvestapi/linkedin-profile-search actor (no cookies, zero ban risk).
 */
export async function startLinkedInSearch(
  searchQuery: Record<string, unknown>,
  maxResults: number = 10
): Promise<string> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error('APIFY_API_TOKEN not configured');

  const response = await fetch(
    `${APIFY_BASE}/acts/harvestapi~linkedin-profile-search/runs?token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...searchQuery,
        maxResults,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Apify run failed: ${response.status} ${await response.text()}`);
  }

  const result = (await response.json()) as { data: ApifyRunResult };
  return result.data.id;
}

/**
 * Wait for an Apify run to complete and fetch results.
 * Polls every 10 seconds up to 5 minutes.
 */
export async function waitForResults(runId: string): Promise<LinkedInProfile[]> {
  const token = process.env.APIFY_API_TOKEN;
  const maxWait = 5 * 60 * 1000; // 5 minutes
  const pollInterval = 10000; // 10 seconds
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const statusRes = await fetch(
      `${APIFY_BASE}/actor-runs/${runId}?token=${token}`
    );
    const statusData = (await statusRes.json()) as { data: ApifyRunResult };

    if (statusData.data.status === 'SUCCEEDED') {
      return fetchRunDataset(runId);
    }

    if (statusData.data.status === 'FAILED' || statusData.data.status === 'ABORTED') {
      throw new Error(`Apify run ${runId} failed with status: ${statusData.data.status}`);
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Apify run ${runId} timed out after 5 minutes`);
}

/**
 * Fetch the dataset items from a completed Apify run.
 */
async function fetchRunDataset(runId: string): Promise<LinkedInProfile[]> {
  const token = process.env.APIFY_API_TOKEN;
  const response = await fetch(
    `${APIFY_BASE}/actor-runs/${runId}/dataset/items?token=${token}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch dataset: ${response.status}`);
  }

  const items = (await response.json()) as Array<Record<string, unknown>>;

  return items.map((item) => ({
    linkedin_url: String(item.profileUrl ?? item.url ?? ''),
    full_name: String(item.fullName ?? item.name ?? ''),
    title: item.headline ? String(item.headline) : undefined,
    company: item.companyName ? String(item.companyName) : undefined,
    location: item.location ? String(item.location) : undefined,
    profile_data: item,
  }));
}

/**
 * Run all search queries for a tenant and return combined profiles.
 */
export async function scrapeForTenant(
  queries: Array<{ searchQuery: Record<string, unknown>; maxResults: number }>
): Promise<LinkedInProfile[]> {
  const allProfiles: LinkedInProfile[] = [];

  // Run queries sequentially to stay within rate limits
  for (const query of queries) {
    try {
      const runId = await startLinkedInSearch(query.searchQuery, query.maxResults);
      const profiles = await waitForResults(runId);
      allProfiles.push(...profiles);
    } catch (error) {
      console.error('Scraping query failed:', error);
      // Continue with remaining queries
    }
  }

  return allProfiles;
}
