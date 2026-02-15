import { CRMConnector } from './base-connector';
import { CRMLeadData, CRMDeal, CRMClosedWonDeal, CRMTask, CRMFieldMapping, CRMAuthConfig } from './types';

const SF_API_VERSION = 'v59.0';

export class SalesforceConnector extends CRMConnector {
  private accessToken: string | null = null;
  private instanceUrl: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(config: CRMAuthConfig) {
    super(config);
    this.instanceUrl = config.instance_url ?? null;
  }

  async authenticate(): Promise<boolean> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 300000) {
      return true;
    }

    const tokenUrl = this.config.sandbox
      ? 'https://test.salesforce.com/services/oauth2/token'
      : 'https://login.salesforce.com/services/oauth2/token';

    const response = await fetch(tokenUrl, {
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
      console.error('Salesforce auth failed:', response.status, await response.text());
      return false;
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.instanceUrl = data.instance_url;
    // Salesforce tokens last ~2 hours by default
    this.tokenExpiresAt = Date.now() + 7200 * 1000;
    return true;
  }

  private get headers() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private get apiBase() {
    return `${this.instanceUrl}/services/data/${SF_API_VERSION}`;
  }

  private async request(method: string, endpoint: string, body?: unknown): Promise<unknown> {
    await this.authenticate();

    const response = await fetch(`${this.apiBase}${endpoint}`, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Salesforce API error ${response.status}: ${errorText}`);
    }

    // DELETE and some PATCH return 204 No Content
    if (response.status === 204) return {};
    return response.json();
  }

  private async query<T = Record<string, unknown>>(soql: string): Promise<T[]> {
    const result = await this.request('GET', `/query?q=${encodeURIComponent(soql)}`) as {
      records: T[];
    };
    return result.records;
  }

  async createLead(data: CRMLeadData): Promise<string> {
    const mapped = this.mapFields(data);
    const result = await this.request('POST', '/sobjects/Lead', mapped) as { id: string };
    return result.id;
  }

  async updateLead(crmLeadId: string, data: Partial<CRMLeadData>): Promise<boolean> {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const crmField = this.fieldMapping[key] ?? key;
      mapped[crmField] = value;
    }

    await this.request('PATCH', `/sobjects/Lead/${crmLeadId}`, mapped);
    return true;
  }

  async getDeals(filters?: { stage?: string; updatedSince?: Date }): Promise<CRMDeal[]> {
    let soql = `SELECT Id, Name, Amount, StageName, LastModifiedDate, CreatedDate,
      Owner.Name, Account.Name
      FROM Opportunity`;

    const conditions: string[] = [];

    if (filters?.stage) {
      conditions.push(`StageName = '${filters.stage.replace(/'/g, "\\'")}'`);
    }

    if (filters?.updatedSince) {
      conditions.push(`LastModifiedDate >= ${filters.updatedSince.toISOString()}`);
    }

    if (conditions.length > 0) {
      soql += ` WHERE ${conditions.join(' AND ')}`;
    }

    soql += ' ORDER BY LastModifiedDate DESC LIMIT 200';

    const records = await this.query<Record<string, unknown>>(soql);

    return records.map((d) => ({
      id: String(d.Id),
      name: String(d.Name ?? ''),
      value: Number(d.Amount ?? 0),
      stage: String(d.StageName ?? ''),
      last_activity_date: d.LastModifiedDate ? String(d.LastModifiedDate) : null,
      stage_change_date: null,
      email_sent_count: 0,
      email_response_count: 0,
      owner: d.Owner ? String((d.Owner as Record<string, unknown>).Name ?? '') : '',
      contact_name: d.Account ? String((d.Account as Record<string, unknown>).Name ?? '') : '',
    }));
  }

  async getClosedWonDeals(since?: Date): Promise<CRMClosedWonDeal[]> {
    let soql = `SELECT Id, Name, Amount, StageName, CloseDate,
      Owner.Name, Account.Name
      FROM Opportunity
      WHERE StageName = 'Closed Won'`;

    if (since) {
      soql += ` AND LastModifiedDate >= ${since.toISOString()}`;
    }

    soql += ' ORDER BY CloseDate DESC LIMIT 200';

    const records = await this.query<Record<string, unknown>>(soql);

    return records.map((d) => ({
      id: String(d.Id),
      name: String(d.Name ?? ''),
      value: Number(d.Amount ?? 0),
      customerName: d.Account
        ? String((d.Account as Record<string, unknown>).Name ?? '')
        : String(d.Name ?? ''),
      contactName: '',
      closedWonAt: d.CloseDate ? new Date(String(d.CloseDate)) : new Date(),
      ownerName: d.Owner
        ? String((d.Owner as Record<string, unknown>).Name ?? '')
        : '',
    }));
  }

  async createTask(dealId: string, task: CRMTask): Promise<string> {
    const result = await this.request('POST', '/sobjects/Task', {
      Subject: task.title,
      Description: task.description,
      ActivityDate: task.due_date,
      Priority: task.priority === 'high' ? 'High' : task.priority === 'medium' ? 'Normal' : 'Low',
      WhatId: dealId,
      Status: 'Not Started',
    }) as { id: string };

    return result.id;
  }

  async addTag(dealId: string, tag: string): Promise<boolean> {
    // Salesforce uses Topics for tagging
    try {
      // Find or create the topic
      const existing = await this.query<{ Id: string }>(
        `SELECT Id FROM Topic WHERE Name = '${tag.replace(/'/g, "\\'")}'`
      );

      let topicId: string;
      if (existing.length > 0) {
        topicId = existing[0].Id;
      } else {
        const result = await this.request('POST', '/sobjects/Topic', {
          Name: tag,
        }) as { id: string };
        topicId = result.id;
      }

      // Assign topic to opportunity
      await this.request('POST', '/sobjects/TopicAssignment', {
        EntityId: dealId,
        TopicId: topicId,
      });
    } catch {
      // Fallback: update a custom text field if Topics aren't enabled
      const opp = await this.query<{ Fulcrum_Tags__c: string | null }>(
        `SELECT Fulcrum_Tags__c FROM Opportunity WHERE Id = '${dealId}'`
      );

      const existingTags = opp[0]?.Fulcrum_Tags__c
        ? opp[0].Fulcrum_Tags__c.split(',').map((t) => t.trim())
        : [];

      if (!existingTags.includes(tag)) {
        existingTags.push(tag);
      }

      await this.request('PATCH', `/sobjects/Opportunity/${dealId}`, {
        Fulcrum_Tags__c: existingTags.join(','),
      });
    }

    return true;
  }

  async addNote(dealId: string, note: string): Promise<boolean> {
    await this.request('POST', '/sobjects/Note', {
      Title: 'Fulcrum Update',
      Body: note,
      ParentId: dealId,
    });
    return true;
  }

  async moveDealStage(dealId: string, stage: string): Promise<boolean> {
    await this.request('PATCH', `/sobjects/Opportunity/${dealId}`, {
      StageName: stage,
    });
    return true;
  }

  async sendEmail(to: string, subject: string, body: string, dealId?: string): Promise<boolean> {
    // Salesforce uses the Messaging API for sending emails
    const emailData: Record<string, unknown> = {
      inputs: [{
        emailBody: body,
        emailSubject: subject,
        emailAddresses: to,
        senderType: 'CurrentUser',
      }],
    };

    if (dealId) {
      (emailData.inputs as Array<Record<string, unknown>>)[0].entityId = dealId;
    }

    await this.request('POST', '/actions/standard/emailSimple', emailData);
    return true;
  }

  protected getFieldMapping(): CRMFieldMapping {
    return {
      first_name: 'FirstName',
      last_name: 'LastName',
      company: 'Company',
      title: 'Title',
      email: 'Email',
      phone: 'Phone',
      linkedin_url: 'LinkedIn_URL__c',
      fulcrum_score: 'Fulcrum_Score__c',
      fulcrum_grade: 'Fulcrum_Grade__c',
      fit_score: 'Fit_Score__c',
      intent_score: 'Intent_Score__c',
      first_line: 'First_Line_Opener__c',
      source: 'LeadSource',
    };
  }
}
