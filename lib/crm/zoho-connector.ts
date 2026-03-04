import { CRMConnector } from './base-connector';
import { CRMLeadData, CRMDeal, CRMClosedWonDeal, CRMTask, CRMFieldMapping, CRMAuthConfig } from './types';

const ZOHO_API_BASE = 'https://www.zohoapis.com/crm/v3';
const ZOHO_AUTH_URL = 'https://accounts.zoho.com/oauth/v2/token';

/**
 * Map a Fulcrum score (0-100) to a Zoho Lead_Status stage.
 *
 * Staging progression: New → Working → Nurturing → Sales-Ready
 *
 * | Fulcrum Score | Grade | Zoho Lead_Status |
 * |---------------|-------|-----------------|
 * | 80 – 100      | A/A+  | Sales-Ready     |
 * | 60 – 79       | B     | Nurturing       |
 * | 40 – 59       | C     | Working         |
 * | 0  – 39       | D     | New             |
 */
export function mapScoreToZohoLeadStatus(fulcrumScore: number): string {
  if (fulcrumScore >= 80) return 'Sales-Ready';
  if (fulcrumScore >= 60) return 'Nurturing';
  if (fulcrumScore >= 40) return 'Working';
  return 'New';
}

export class ZohoConnector extends CRMConnector {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: CRMAuthConfig) {
    super(config);
  }

  async authenticate(): Promise<boolean> {
    // Skip if token is still valid (with 5 min buffer)
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 300000) {
      return true;
    }

    const response = await fetch(ZOHO_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: this.config.refresh_token ?? '',
        client_id: this.config.client_id ?? '',
        client_secret: this.config.client_secret ?? '',
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Zoho auth failed (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
    return true;
  }

  private get headers() {
    return {
      'Authorization': `Zoho-oauthtoken ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async request(method: string, endpoint: string, body?: unknown): Promise<unknown> {
    await this.authenticate();

    const response = await fetch(`${ZOHO_API_BASE}${endpoint}`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Zoho API error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  async createLead(data: CRMLeadData): Promise<string> {
    // Derive Lead_Status from score if not explicitly provided
    const dataWithStatus: CRMLeadData = {
      ...data,
      lead_status: data.lead_status ?? mapScoreToZohoLeadStatus(data.fulcrum_score),
    };
    const mapped = this.mapFields(dataWithStatus);

    // Split full name into first/last
    const nameParts = data.first_name && data.last_name
      ? { First_Name: data.first_name, Last_Name: data.last_name }
      : (() => {
          const parts = (data.first_name || '').split(' ');
          return {
            First_Name: parts.slice(0, -1).join(' ') || parts[0],
            Last_Name: parts[parts.length - 1] || 'Unknown',
          };
        })();

    const zohoLead = {
      ...mapped,
      ...nameParts,
    };

    const result = await this.request('POST', '/Leads', {
      data: [zohoLead],
    }) as { data?: Array<{ details?: { id: string } }> };

    const leadId = result.data?.[0]?.details?.id;
    if (!leadId) {
      throw new Error('Zoho createLead: API returned no lead ID');
    }
    return leadId;
  }

  async updateLead(crmLeadId: string, data: Partial<CRMLeadData>): Promise<boolean> {
    // Auto-advance Lead_Status when the score is being updated without an explicit status
    const updateData: Partial<CRMLeadData> = { ...data };
    if (data.fulcrum_score !== undefined && data.lead_status === undefined) {
      updateData.lead_status = mapScoreToZohoLeadStatus(data.fulcrum_score);
    }

    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updateData)) {
      const crmField = this.fieldMapping[key] ?? key;
      mapped[crmField] = value;
    }

    await this.request('PUT', `/Leads/${crmLeadId}`, {
      data: [{ id: crmLeadId, ...mapped }],
    });
    return true;
  }

  async getDeals(filters?: { stage?: string; updatedSince?: Date }): Promise<CRMDeal[]> {
    let endpoint = '/Deals?fields=Deal_Name,Amount,Stage,Modified_Time,Created_Time,Contact_Name,Owner';

    if (filters?.updatedSince) {
      const since = filters.updatedSince.toISOString().replace('T', ' ').slice(0, 19);
      endpoint += `&modified_since=${since}`;
    }

    const result = await this.request('GET', endpoint) as { data?: Array<Record<string, unknown>> };
    const deals = result.data ?? [];

    return deals.map((d) => ({
      id: String(d.id),
      name: String(d.Deal_Name ?? ''),
      value: Number(d.Amount ?? 0),
      stage: String(d.Stage ?? ''),
      last_activity_date: d.Modified_Time ? String(d.Modified_Time) : null,
      stage_change_date: d.Stage_Change_Time ? String(d.Stage_Change_Time) : null,
      email_sent_count: 0, // Zoho doesn't directly expose this in deals
      email_response_count: 0,
      owner: d.Owner ? String((d.Owner as Record<string, unknown>).name ?? '') : '',
      contact_name: d.Contact_Name ? String((d.Contact_Name as Record<string, unknown>).name ?? '') : '',
    }));
  }

  async getClosedWonDeals(since?: Date): Promise<CRMClosedWonDeal[]> {
    let endpoint = '/Deals?fields=Deal_Name,Amount,Stage,Closing_Date,Contact_Name,Account_Name,Owner&criteria=(Stage:equals:Closed Won)';

    if (since) {
      const sinceStr = since.toISOString().replace('T', ' ').slice(0, 19);
      endpoint += `&modified_since=${sinceStr}`;
    }

    const result = await this.request('GET', endpoint) as { data?: Array<Record<string, unknown>> };
    const deals = result.data ?? [];

    return deals
      .filter((d) => d.Stage === 'Closed Won')
      .map((d) => ({
        id: String(d.id),
        name: String(d.Deal_Name ?? ''),
        value: Number(d.Amount ?? 0),
        customerName: d.Account_Name
          ? String((d.Account_Name as Record<string, unknown>).name ?? '')
          : String(d.Deal_Name ?? ''),
        contactName: d.Contact_Name
          ? String((d.Contact_Name as Record<string, unknown>).name ?? '')
          : '',
        closedWonAt: d.Closing_Date ? new Date(String(d.Closing_Date)) : new Date(),
        ownerName: d.Owner
          ? String((d.Owner as Record<string, unknown>).name ?? '')
          : '',
      }));
  }

  async createTask(dealId: string, task: CRMTask): Promise<string> {
    const result = await this.request('POST', '/Tasks', {
      data: [{
        Subject: task.title,
        Description: task.description,
        Due_Date: task.due_date,
        Priority: task.priority === 'high' ? 'High' : task.priority === 'medium' ? 'Normal' : 'Low',
        What_Id: dealId,
        se_module: 'Deals',
        Status: 'Not Started',
      }],
    }) as { data?: Array<{ details?: { id: string } }> };

    const taskId = result.data?.[0]?.details?.id;
    if (!taskId) {
      throw new Error('Zoho createTask: API returned no task ID');
    }
    return taskId;
  }

  async addTag(dealId: string, tag: string): Promise<boolean> {
    await this.request('POST', `/Deals/${dealId}/actions/add_tags`, {
      tags: [{ name: tag }],
    });
    return true;
  }

  async addNote(dealId: string, note: string): Promise<boolean> {
    await this.request('POST', '/Notes', {
      data: [{
        Note_Content: note,
        Parent_Id: dealId,
        se_module: 'Deals',
      }],
    });
    return true;
  }

  async moveDealStage(dealId: string, stage: string): Promise<boolean> {
    await this.request('PUT', `/Deals/${dealId}`, {
      data: [{ id: dealId, Stage: stage }],
    });
    return true;
  }

  async sendEmail(to: string, subject: string, body: string, dealId?: string): Promise<boolean> {
    const emailData: Record<string, unknown> = {
      from: { user_name: 'Fulcrum', email: this.config.sender_email ?? '' },
      to: [{ email: to }],
      subject,
      content: body,
      mail_format: 'html',
    };

    if (dealId) {
      emailData.se_module = 'Deals';
      emailData.related_id = dealId;
    }

    await this.request('POST', '/send_mail', { data: [emailData] });
    return true;
  }

  async getLeadDealValue(externalLeadId: string): Promise<{
    estimatedDealValue: number | null;
    stage: string | null;
    currencyCode: string;
  } | null> {
    try {
      const result = await this.request('GET', `/Leads/${externalLeadId}`) as {
        data?: Array<Record<string, unknown>>;
      };

      const lead = result.data?.[0];
      if (!lead) return null;

      const expectedRevenue = lead.Expected_Revenue != null
        ? Number(lead.Expected_Revenue)
        : null;

      return {
        estimatedDealValue: expectedRevenue,
        stage: lead.Lead_Status ? String(lead.Lead_Status) : null,
        currencyCode: lead.Currency ? String(lead.Currency) : 'USD',
      };
    } catch {
      return null;
    }
  }

  protected getFieldMapping(): CRMFieldMapping {
    return {
      first_name: 'First_Name',
      last_name: 'Last_Name',
      company: 'Company',
      title: 'Designation',
      email: 'Email',
      phone: 'Phone',
      linkedin_url: 'LinkedIn_URL',
      fulcrum_score: 'Fulcrum_Score',
      fulcrum_grade: 'Fulcrum_Grade',
      fit_score: 'Fit_Score',
      intent_score: 'Intent_Score',
      first_line: 'First_Line_Opener',
      source: 'Lead_Source',
      lead_status: 'Lead_Status',
    };
  }
}
