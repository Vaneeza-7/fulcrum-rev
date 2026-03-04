export interface CRMLeadData {
  first_name: string;
  last_name: string;
  company: string;
  title: string;
  email?: string;
  phone?: string;
  linkedin_url: string;
  fulcrum_score: number;
  fulcrum_grade: string;
  fit_score: number;
  intent_score: number;
  first_line: string;
  source: string;
  /** CRM-specific lead status / stage (e.g. Zoho Lead_Status). */
  lead_status?: string;
}

export interface CRMDeal {
  id: string;
  name: string;
  value: number;
  stage: string;
  last_activity_date: string | null;
  stage_change_date: string | null;
  email_sent_count: number;
  email_response_count: number;
  owner: string;
  contact_name: string;
}

export interface CRMTask {
  title: string;
  description: string;
  due_date: string;
  priority: 'high' | 'medium' | 'low';
  related_deal_id?: string;
}

export interface CRMClosedWonDeal {
  id: string;
  name: string;
  value: number;
  customerName: string;
  contactName: string;
  closedWonAt: Date;
  ownerName: string;
}

export interface CRMFieldMapping {
  [fulcrumField: string]: string;
}

export interface CRMAuthConfig {
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  access_token?: string;
  api_key?: string;
  [key: string]: string | undefined;
}
