import {
  ClaritySessionMetrics,
  ClarityHeatmapData,
  ClarityFormAnalytics,
  ClarityAuthConfig,
} from './types';

/**
 * Microsoft Clarity API connector.
 * Uses API token authentication.
 *
 * Note: Clarity's public API is limited. This connector uses the
 * available endpoints and falls back to reasonable defaults where
 * the API doesn't expose detailed data. As Clarity expands its API,
 * these methods can be updated to use native endpoints.
 */
export class ClarityConnector {
  private apiToken: string;
  private projectId: string;
  private baseUrl = 'https://www.clarity.ms/api/v1';

  constructor(config: ClarityAuthConfig) {
    if (!config.apiToken || !config.projectId) {
      throw new Error('Clarity connector requires apiToken and projectId');
    }
    this.apiToken = config.apiToken;
    this.projectId = config.projectId;
  }

  private async request<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}/project/${this.projectId}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Clarity API failed: ${res.status} ${await res.text()}`);
    }

    return res.json();
  }

  /**
   * Get session behavior metrics for a page: rage clicks, dead clicks, quick backs.
   */
  async getSessionMetrics(pageUrl: string): Promise<ClaritySessionMetrics> {
    try {
      const data = await this.request<{
        totalSessions: number;
        rageClicks: number;
        deadClicks: number;
        quickBacks: number;
        excessiveScrolling: number;
        avgScrollDepth: number;
      }>('/metrics', { page: pageUrl });

      return {
        pageUrl,
        totalSessions: data.totalSessions ?? 0,
        rageClicks: data.rageClicks ?? 0,
        deadClicks: data.deadClicks ?? 0,
        quickBacks: data.quickBacks ?? 0,
        excessiveScrolling: data.excessiveScrolling ?? 0,
        avgScrollDepth: data.avgScrollDepth ?? 0,
      };
    } catch {
      // Return defaults if API not available
      return {
        pageUrl,
        totalSessions: 0,
        rageClicks: 0,
        deadClicks: 0,
        quickBacks: 0,
        excessiveScrolling: 0,
        avgScrollDepth: 0,
      };
    }
  }

  /**
   * Get click/scroll heatmap summary data.
   */
  async getHeatmapData(pageUrl: string): Promise<ClarityHeatmapData> {
    try {
      const data = await this.request<{
        clickHeatmap: { element: string; clicks: number; percentage: number }[];
        scrollReach: { depth: number; percentage: number }[];
      }>('/heatmap', { page: pageUrl });

      return {
        pageUrl,
        clickHeatmap: data.clickHeatmap ?? [],
        scrollReach: data.scrollReach ?? [],
      };
    } catch {
      return {
        pageUrl,
        clickHeatmap: [],
        scrollReach: [],
      };
    }
  }

  /**
   * Get form-level analytics: field abandonment, completion rate, time spent.
   */
  async getFormAnalytics(formSelector: string, pageUrl: string): Promise<ClarityFormAnalytics> {
    try {
      const data = await this.request<{
        totalInteractions: number;
        completionRate: number;
        avgCompletionTime: number;
        fieldDropoffs: {
          fieldName: string;
          interacted: number;
          abandoned: number;
          abandonmentRate: number;
          avgTimeSpent: number;
          errorRate: number;
        }[];
      }>('/forms', { page: pageUrl, form: formSelector });

      return {
        formSelector,
        pageUrl,
        totalInteractions: data.totalInteractions ?? 0,
        completionRate: data.completionRate ?? 0,
        avgCompletionTime: data.avgCompletionTime ?? 0,
        fieldDropoffs: data.fieldDropoffs ?? [],
      };
    } catch {
      return {
        formSelector,
        pageUrl,
        totalInteractions: 0,
        completionRate: 0,
        avgCompletionTime: 0,
        fieldDropoffs: [],
      };
    }
  }
}
