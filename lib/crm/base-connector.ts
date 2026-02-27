import { CRMLeadData, CRMDeal, CRMClosedWonDeal, CRMTask, CRMFieldMapping, CRMAuthConfig } from './types';

/**
 * Abstract base class for all CRM integrations.
 * Every CRM connector must implement these methods.
 */
export abstract class CRMConnector {
  protected config: CRMAuthConfig;
  protected fieldMapping: CRMFieldMapping;

  constructor(config: CRMAuthConfig) {
    this.config = config;
    this.fieldMapping = this.getFieldMapping();
  }

  /** Authenticate with the CRM and refresh tokens if needed. */
  abstract authenticate(): Promise<boolean>;

  /** Create a new lead in the CRM. Returns the CRM-assigned lead ID. */
  abstract createLead(data: CRMLeadData): Promise<string>;

  /** Update an existing lead by CRM lead ID. */
  abstract updateLead(crmLeadId: string, data: Partial<CRMLeadData>): Promise<boolean>;

  /** Retrieve deals with optional filters for diagnostics. */
  abstract getDeals(filters?: { stage?: string; updatedSince?: Date }): Promise<CRMDeal[]>;

  /** Retrieve closed-won deals for ICM commission tracking. */
  abstract getClosedWonDeals(since?: Date): Promise<CRMClosedWonDeal[]>;

  /** Create a follow-up task linked to a deal. */
  abstract createTask(dealId: string, task: CRMTask): Promise<string>;

  /** Add a tag/label to a deal. */
  abstract addTag(dealId: string, tag: string): Promise<boolean>;

  /** Add a note to a deal. */
  abstract addNote(dealId: string, note: string): Promise<boolean>;

  /** Move a deal to a different pipeline stage. */
  abstract moveDealStage(dealId: string, stage: string): Promise<boolean>;

  /** Send an email through the CRM. */
  abstract sendEmail(to: string, subject: string, body: string, dealId?: string): Promise<boolean>;

  /** Get deal value and stage for a lead by its external CRM lead ID. Returns null if not found. */
  abstract getLeadDealValue(externalLeadId: string): Promise<{
    estimatedDealValue: number | null;
    stage: string | null;
    currencyCode: string;
  } | null>;

  /** CRM-specific field name mappings. */
  protected abstract getFieldMapping(): CRMFieldMapping;

  /** Transform Fulcrum lead data to CRM-specific field names. */
  mapFields(data: CRMLeadData): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};
    for (const [fulcrumField, value] of Object.entries(data)) {
      const crmField = this.fieldMapping[fulcrumField] ?? fulcrumField;
      mapped[crmField] = value;
    }
    return mapped;
  }
}
