import { CRMConnector } from './base-connector';
import { CRMLeadData, CRMDeal, CRMClosedWonDeal, CRMTask, CRMFieldMapping, CRMAuthConfig } from './types';

const HUBSPOT_API_BASE = 'https://api.hubapi.com';
const HUBSPOT_AUTH_URL = 'https://api.hubapi.com/oauth/v1/token';

export class HubSpotConnector extends CRMConnector {
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private isPrivateApp: boolean = false;

  constructor(config: CRMAuthConfig) {
    super(config);
    this.isPrivateApp = !!config.api_key;
    if (this.isPrivateApp) {
      this.accessToken = config.api_key ?? null;
    }
  }

  async authenticate(): Promise<boolean> {
    if (this.isPrivateApp) {
      return !!this.accessToken;
    }

    if (this.accessToken && Date.now() < this.tokenExpiresAt - 300000) {
      return true;
    }

    const response = await fetch(HUBSPOT_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.client_id ?? '',
        client_secret: this.config.client_secret ?? '',
        refresh_token: this.config.refresh_token ?? '',
      }),
    });

    if (!response.ok) {
      console.error('HubSpot auth failed:', response.status, await response.text());
      return false;
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
    return true;
  }

  private get headers() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private async request(method: string, endpoint: string, body?: unknown): Promise<unknown> {
    await this.authenticate();

    const response = await fetch(`${HUBSPOT_API_BASE}${endpoint}`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HubSpot API error ${response.status}: ${errorText}`);
    }

    return response.json();
  }

  async createLead(data: CRMLeadData): Promise<string> {
    const mapped = this.mapFields(data);
    const result = await this.request('POST', '/crm/v3/objects/contacts', {
      properties: mapped,
    }) as { id: string };

    return result.id;
  }

  async updateLead(crmLeadId: string, data: Partial<CRMLeadData>): Promise<boolean> {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const crmField = this.fieldMapping[key] ?? key;
      mapped[crmField] = value;
    }

    await this.request('PATCH', `/crm/v3/objects/contacts/${crmLeadId}`, {
      properties: mapped,
    });
    return true;
  }

  async getDeals(filters?: { stage?: string; updatedSince?: Date }): Promise<CRMDeal[]> {
    const searchPayload: Record<string, unknown> = {
      properties: [
        'dealname', 'amount', 'dealstage', 'hs_lastmodifieddate',
        'createdate', 'hs_object_id', 'hubspot_owner_id',
      ],
      limit: 100,
    };

    const stageFilter: Array<Record<string, unknown>> = [];

    if (filters?.stage) {
      stageFilter.push({
        propertyName: 'dealstage',
        operator: 'EQ',
        value: filters.stage,
      });
    }

    if (filters?.updatedSince) {
      stageFilter.push({
        propertyName: 'hs_lastmodifieddate',
        operator: 'GTE',
        value: filters.updatedSince.getTime().toString(),
      });
    }

    if (stageFilter.length > 0) {
      searchPayload.filterGroups = [{ filters: stageFilter }];
    }

    const result = await this.request('POST', '/crm/v3/objects/deals/search', searchPayload) as {
      results: Array<{ id: string; properties: Record<string, string> }>;
    };

    return result.results.map((d) => ({
      id: d.id,
      name: d.properties.dealname ?? '',
      value: parseFloat(d.properties.amount ?? '0'),
      stage: d.properties.dealstage ?? '',
      last_activity_date: d.properties.hs_lastmodifieddate ?? null,
      stage_change_date: null,
      email_sent_count: 0,
      email_response_count: 0,
      owner: d.properties.hubspot_owner_id ?? '',
      contact_name: '',
    }));
  }

  async getClosedWonDeals(since?: Date): Promise<CRMClosedWonDeal[]> {
    const filters: Array<Record<string, unknown>> = [
      { propertyName: 'dealstage', operator: 'EQ', value: 'closedwon' },
    ];

    if (since) {
      filters.push({
        propertyName: 'hs_lastmodifieddate',
        operator: 'GTE',
        value: since.getTime().toString(),
      });
    }

    const result = await this.request('POST', '/crm/v3/objects/deals/search', {
      properties: ['dealname', 'amount', 'dealstage', 'closedate', 'hubspot_owner_id'],
      limit: 100,
      filterGroups: [{ filters }],
    }) as {
      results: Array<{ id: string; properties: Record<string, string> }>;
    };

    return result.results.map((d) => ({
      id: d.id,
      name: d.properties.dealname ?? '',
      value: parseFloat(d.properties.amount ?? '0'),
      customerName: d.properties.dealname ?? '',
      contactName: '',
      closedWonAt: d.properties.closedate ? new Date(d.properties.closedate) : new Date(),
      ownerName: d.properties.hubspot_owner_id ?? '',
    }));
  }

  async createTask(dealId: string, task: CRMTask): Promise<string> {
    const result = await this.request('POST', '/crm/v3/objects/tasks', {
      properties: {
        hs_task_subject: task.title,
        hs_task_body: task.description,
        hs_timestamp: new Date(task.due_date).getTime().toString(),
        hs_task_priority: task.priority === 'high' ? 'HIGH' : task.priority === 'medium' ? 'MEDIUM' : 'LOW',
        hs_task_status: 'NOT_STARTED',
      },
    }) as { id: string };

    // Associate task with deal
    await this.request(
      'PUT',
      `/crm/v4/objects/tasks/${result.id}/associations/deals/${dealId}`,
      [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 216 }]
    );

    return result.id;
  }

  async addTag(dealId: string, tag: string): Promise<boolean> {
    // HubSpot has no native deal tags — use a custom text property
    const dealData = await this.request('GET', `/crm/v3/objects/deals/${dealId}?properties=fulcrum_tags`) as {
      properties: Record<string, string>;
    };

    const existingTags = dealData.properties.fulcrum_tags
      ? dealData.properties.fulcrum_tags.split(',').map((t) => t.trim())
      : [];

    if (!existingTags.includes(tag)) {
      existingTags.push(tag);
    }

    await this.request('PATCH', `/crm/v3/objects/deals/${dealId}`, {
      properties: { fulcrum_tags: existingTags.join(',') },
    });

    return true;
  }

  async addNote(dealId: string, note: string): Promise<boolean> {
    const result = await this.request('POST', '/crm/v3/objects/notes', {
      properties: {
        hs_note_body: note,
        hs_timestamp: Date.now().toString(),
      },
    }) as { id: string };

    await this.request(
      'PUT',
      `/crm/v4/objects/notes/${result.id}/associations/deals/${dealId}`,
      [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }]
    );

    return true;
  }

  async moveDealStage(dealId: string, stage: string): Promise<boolean> {
    await this.request('PATCH', `/crm/v3/objects/deals/${dealId}`, {
      properties: { dealstage: stage },
    });
    return true;
  }

  async sendEmail(to: string, subject: string, body: string, dealId?: string): Promise<boolean> {
    const result = await this.request('POST', '/crm/v3/objects/emails', {
      properties: {
        hs_timestamp: Date.now().toString(),
        hs_email_subject: subject,
        hs_email_text: body,
        hs_email_to_email: to,
      },
    }) as { id: string };

    if (dealId) {
      await this.request(
        'PUT',
        `/crm/v4/objects/emails/${result.id}/associations/deals/${dealId}`,
        [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 210 }]
      );
    }

    return true;
  }

  protected getFieldMapping(): CRMFieldMapping {
    return {
      first_name: 'firstname',
      last_name: 'lastname',
      company: 'company',
      title: 'jobtitle',
      email: 'email',
      phone: 'phone',
      linkedin_url: 'linkedin_url',
      fulcrum_score: 'fulcrum_score',
      fulcrum_grade: 'fulcrum_grade',
      fit_score: 'fit_score',
      intent_score: 'intent_score',
      first_line: 'first_line_opener',
      source: 'hs_lead_status',
    };
  }
}
