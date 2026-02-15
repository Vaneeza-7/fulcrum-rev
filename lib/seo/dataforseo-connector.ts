import { DataForSEOKeywordResult, DataForSEOSERPResult, DataForSEOAuthConfig } from './types';

/**
 * DataForSEO API connector.
 * Uses Basic Authentication (login + password).
 */
export class DataForSEOConnector {
  private authHeader: string;
  private baseUrl = 'https://api.dataforseo.com/v3';

  constructor(config: DataForSEOAuthConfig) {
    if (!config.login || !config.password) {
      throw new Error('DataForSEO connector requires login and password');
    }
    this.authHeader = 'Basic ' + Buffer.from(`${config.login}:${config.password}`).toString('base64');
  }

  private async request<T>(endpoint: string, body: unknown[]): Promise<T> {
    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`DataForSEO request failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    if (data.status_code !== 20000) {
      throw new Error(`DataForSEO error: ${data.status_message}`);
    }
    return data;
  }

  /**
   * Get keyword search volume, difficulty, and CPC data.
   */
  async getKeywordData(
    keywords: string[],
    locationCode = 2840, // US
    languageCode = 'en'
  ): Promise<DataForSEOKeywordResult[]> {
    const tasks = keywords.map((keyword) => ({
      keyword,
      location_code: locationCode,
      language_code: languageCode,
    }));

    const data = await this.request<{
      tasks: {
        result: {
          items: {
            keyword: string;
            search_volume: number;
            keyword_difficulty: number;
            cpc: number;
            competition: number;
            monthly_searches: { month: string; search_volume: number }[];
          }[];
        }[];
      }[];
    }>('/keywords_data/google_ads/search_volume/live', tasks);

    const results: DataForSEOKeywordResult[] = [];
    for (const task of data.tasks ?? []) {
      for (const result of task.result ?? []) {
        for (const item of result.items ?? []) {
          results.push({
            keyword: item.keyword,
            searchVolume: item.search_volume ?? 0,
            difficulty: item.keyword_difficulty ?? 0,
            cpc: item.cpc ?? 0,
            competition: item.competition ?? 0,
            monthlySearches: (item.monthly_searches ?? []).map((m) => ({
              month: m.month,
              volume: m.search_volume,
            })),
          });
        }
      }
    }

    return results;
  }

  /**
   * Get SERP results for a keyword (competitor analysis).
   */
  async getSERPResults(
    keyword: string,
    locationCode = 2840, // US
    languageCode = 'en',
    depth = 10
  ): Promise<DataForSEOSERPResult> {
    const data = await this.request<{
      tasks: {
        result: {
          items: {
            rank_group: number;
            url: string;
            domain: string;
            title: string;
            description: string;
          }[];
        }[];
      }[];
    }>('/serp/google/organic/live/regular', [
      {
        keyword,
        location_code: locationCode,
        language_code: languageCode,
        depth,
      },
    ]);

    const items = data.tasks?.[0]?.result?.[0]?.items ?? [];
    return {
      keyword,
      results: items.map((item) => ({
        position: item.rank_group,
        url: item.url,
        domain: item.domain,
        title: item.title ?? '',
        description: item.description ?? '',
      })),
    };
  }

  /**
   * Get domains competing for the same keywords as a given domain.
   */
  async getCompetitorDomains(
    domain: string,
    locationCode = 2840
  ): Promise<{ domain: string; commonKeywords: number; avgPosition: number }[]> {
    const data = await this.request<{
      tasks: {
        result: {
          items: {
            domain: string;
            avg_position: number;
            intersections: number;
          }[];
        }[];
      }[];
    }>('/dataforseo_labs/google/competitors_domain/live', [
      {
        target: domain,
        location_code: locationCode,
        limit: 20,
      },
    ]);

    const items = data.tasks?.[0]?.result?.[0]?.items ?? [];
    return items.map((item) => ({
      domain: item.domain,
      commonKeywords: item.intersections ?? 0,
      avgPosition: item.avg_position ?? 0,
    }));
  }
}
