import { GA4PageMetrics, FunnelStep, GA4ConversionEvent, GA4AuthConfig } from './types';

/**
 * Google Analytics 4 Data API connector.
 * Uses OAuth 2.0 for authentication (shared with GSC).
 */
export class GA4Connector {
  private accessToken: string;
  private refreshToken: string;
  private propertyId: string;
  private baseUrl = 'https://analyticsdata.googleapis.com/v1beta';

  constructor(config: GA4AuthConfig) {
    if (!config.accessToken || !config.propertyId) {
      throw new Error('GA4 connector requires accessToken and propertyId');
    }
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken ?? '';
    this.propertyId = config.propertyId;
  }

  /**
   * Refresh the OAuth access token if expired.
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
      throw new Error(`GA4 token refresh failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    return this.accessToken;
  }

  private async runReport(body: unknown): Promise<Record<string, unknown>> {
    await this.authenticate();

    const res = await fetch(
      `${this.baseUrl}/properties/${this.propertyId}:runReport`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      throw new Error(`GA4 report failed: ${res.status} ${await res.text()}`);
    }

    return res.json();
  }

  /**
   * Get page-level metrics: bounce rate, sessions, avg time, conversions.
   */
  async getPageMetrics(
    startDate: string,
    endDate: string,
    pagePathFilter?: string
  ): Promise<GA4PageMetrics[]> {
    const dimensionFilter = pagePathFilter
      ? {
          filter: {
            fieldName: 'pagePath',
            stringFilter: { matchType: 'CONTAINS', value: pagePathFilter },
          },
        }
      : undefined;

    const data = await this.runReport({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [
        { name: 'sessions' },
        { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
        { name: 'conversions' },
        { name: 'newUsers' },
        { name: 'totalUsers' },
      ],
      ...(dimensionFilter ? { dimensionFilter } : {}),
      limit: 500,
    });

    const rows = (data as { rows?: Record<string, unknown>[] }).rows ?? [];
    return rows.map((row: Record<string, unknown>) => {
      const dims = (row.dimensionValues as { value: string }[]) ?? [];
      const mets = (row.metricValues as { value: string }[]) ?? [];
      const sessions = parseInt(mets[0]?.value ?? '0', 10);
      const totalUsers = parseInt(mets[5]?.value ?? '0', 10);
      const newUsersVal = parseInt(mets[4]?.value ?? '0', 10);
      const conversions = parseInt(mets[3]?.value ?? '0', 10);

      return {
        pageUrl: dims[0]?.value ?? '',
        sessions,
        bounceRate: parseFloat(mets[1]?.value ?? '0'),
        avgTimeOnPage: parseFloat(mets[2]?.value ?? '0'),
        scrollDepth: 0, // Not available in standard GA4 without custom events
        conversions,
        conversionRate: sessions > 0 ? conversions / sessions : 0,
        newUsers: newUsersVal,
        returningUsers: totalUsers - newUsersVal,
      };
    });
  }

  /**
   * Get funnel report — step-by-step drop-off analysis.
   */
  async getFunnelReport(
    funnelSteps: { stepName: string; pageUrl: string }[],
    startDate: string,
    endDate: string
  ): Promise<FunnelStep[]> {
    // GA4 funnel reports use the funnel endpoint; for simplicity we
    // approximate by pulling session counts per page and calculating drop-offs.
    const metrics = await this.getPageMetrics(startDate, endDate);
    const metricsMap = new Map(metrics.map((m) => [m.pageUrl, m]));

    const results: FunnelStep[] = [];
    let prevSessions = 0;

    for (let i = 0; i < funnelSteps.length; i++) {
      const step = funnelSteps[i];
      const pageMetrics = metricsMap.get(step.pageUrl);
      const sessions = pageMetrics?.sessions ?? 0;

      const dropOffCount = i === 0 ? 0 : Math.max(0, prevSessions - sessions);
      const dropOffRate = i === 0 ? 0 : prevSessions > 0 ? dropOffCount / prevSessions : 0;

      results.push({
        stepName: step.stepName,
        pageUrl: step.pageUrl,
        sessions,
        dropOffRate,
        dropOffCount,
      });

      prevSessions = sessions;
    }

    return results;
  }

  /**
   * Get conversion events and their top pages.
   */
  async getConversionEvents(
    startDate: string,
    endDate: string
  ): Promise<GA4ConversionEvent[]> {
    const data = await this.runReport({
      dateRanges: [{ startDate, endDate }],
      dimensions: [{ name: 'eventName' }, { name: 'pagePath' }],
      metrics: [
        { name: 'eventCount' },
        { name: 'eventValue' },
      ],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          stringFilter: { matchType: 'CONTAINS', value: 'conversion' },
        },
      },
      limit: 200,
    });

    const rows = (data as { rows?: Record<string, unknown>[] }).rows ?? [];
    const eventMap = new Map<string, GA4ConversionEvent>();

    for (const row of rows) {
      const dims = (row.dimensionValues as { value: string }[]) ?? [];
      const mets = (row.metricValues as { value: string }[]) ?? [];
      const eventName = dims[0]?.value ?? '';
      const pagePath = dims[1]?.value ?? '';
      const count = parseInt(mets[0]?.value ?? '0', 10);
      const value = parseFloat(mets[1]?.value ?? '0');

      const existing = eventMap.get(eventName);
      if (existing) {
        existing.count += count;
        existing.value += value;
        existing.topPages.push({ pageUrl: pagePath, count });
      } else {
        eventMap.set(eventName, {
          eventName,
          count,
          value,
          topPages: [{ pageUrl: pagePath, count }],
        });
      }
    }

    return Array.from(eventMap.values()).map((event) => ({
      ...event,
      topPages: event.topPages.sort((a, b) => b.count - a.count).slice(0, 5),
    }));
  }
}
