export interface SlackLeadCard {
  lead_id: string;
  full_name: string;
  title: string;
  company: string;
  fulcrum_score: number;
  fulcrum_grade: string;
  fit_score: number;
  intent_score: number;
  first_line: string;
  linkedin_url: string;
}

export interface SlackPipelineSummary {
  tenant_name: string;
  profiles_scraped: number;
  profiles_new: number;
  grade_distribution: Record<string, number>;
  top_leads: SlackLeadCard[];
  errors: string[];
}

export interface SlackDealAlert {
  deal_name: string;
  deal_value: number;
  days_stalled: number;
  stalled_reason: string;
  suggested_action: string;
}

export interface MonitoringAlert {
  alert_id: string;
  resource_id: string;
  resource_name: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  trigger_reason: string;
  execution_count: number;
  burst_threshold: number;
  error_count: number;
  baseline_hourly: number | null;
  risk_tier: string;
  details_extra?: string;
  detected_at: string;
  workflow_editor_url?: string;
}
