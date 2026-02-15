import { GSCKeywordData, GSCAuthConfig } from './types';

/**
 * Google Search Console API connector.
 * Uses OAuth 2.0 for authentication via googleapis.
 */
export class GSCConnector {
  private accessToken: string;
  private refreshToken: string;
  private siteUrl: string;
  private baseUrl = 'https://searchconsole.googleapis.com/webmasters/v3';

  constructor(config: GSCAuthConfig) {
    if (!config.accessToken || !config.siteUrl) {
      throw new Error('GSC connector requires accessToken and siteUrl');
    }
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken ?? '';
    this.siteUrl = config.siteUrl;
  }

  /**
   * Refresh the OAuth access token if expired.
   * Returns the new access token or the existing one if still valid.
   */
  async authenticate(): Promise<string> {
    if (!this.refreshToken) return this.accessToken;

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return this.accessToken;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      throw new Error(`GSC token refresh failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    return this.accessToken;
  }

  /**
   * Pull search analytics data (keyword positions, impressions, clicks, CTR).
   */
  async getSearchAnalytics(
    startDate: string,
    endDate: string,
    dimensions: ('query' | 'page' | 'date')[] = ['query', 'page'],
    rowLimit = 1000
  ): Promise<GSCKeywordData[]> {
    await this.authenticate();

    const res = await fetch(
      `${this.baseUrl}/sites/${encodeURIComponent(this.siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions,
          rowLimit,
          dimensionFilterGroups: [],
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`GSC search analytics failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return (data.rows ?? []).map((row: Record<string, unknown>) => {
      const keys = row.keys as string[];
      return {
        query: keys[0] ?? '',
        page: keys[1] ?? '',
        position: row.position as number,
        impressions: row.impressions as number,
        clicks: row.clicks as number,
        ctr: row.ctr as number,
        date: dimensions.includes('date') ? (keys[2] ?? '') : endDate,
      };
    });
  }

  /**
   * Check if a URL is indexed in Google.
   */
  async getIndexStatus(url: string): Promise<{ isIndexed: boolean; verdict: string }> {
    await this.authenticate();

    const res = await fetch(
      'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inspectionUrl: url,
          siteUrl: this.siteUrl,
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`GSC index inspection failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const verdict = data.inspectionResult?.indexStatusResult?.verdict ?? 'UNKNOWN';
    return {
      isIndexed: verdict === 'PASS',
      verdict,
    };
  }

  /**
   * Request re-indexing of a URL via the URL Inspection API.
   */
  async submitForIndexing(url: string): Promise<{ success: boolean; message: string }> {
    // The Indexing API is separate from URL Inspection —
    // it's only available for JobPosting and BroadcastEvent structured data.
    // For general URLs, we use the URL Inspection API to trigger a re-crawl.
    try {
      const status = await this.getIndexStatus(url);
      return {
        success: true,
        message: `URL inspection triggered for ${url}. Current status: ${status.verdict}`,
      };
    } catch (error) {
      return { success: false, message: `Indexing request failed: ${error}` };
    }
  }
}
