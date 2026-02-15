export type HealthCheckType = 'crm_connectivity' | 'data_freshness' | 'pipeline_health' | 'api_quota';
export type HealthStatus = 'healthy' | 'degraded' | 'critical';

export interface HealthCheckResult {
  checkType: HealthCheckType;
  status: HealthStatus;
  details: Record<string, unknown>;
}

export interface DataHealthSummary {
  totalLeads: number;
  freshCount: number;      // 0-7 days
  agingCount: number;      // 8-14 days
  staleCount: number;      // 15-30 days
  criticalCount: number;   // 30+ days
  averageScore: number;
}

export interface FreshnessScore {
  score: number;      // 0-100
  label: string;      // 'fresh' | 'aging' | 'stale' | 'critical'
  daysSinceEnrichment: number;
}
