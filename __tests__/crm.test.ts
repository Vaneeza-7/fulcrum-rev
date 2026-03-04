import { describe, it, expect } from 'vitest';
import { CRMFactory } from '@/lib/crm/factory';
import { ZohoConnector, mapScoreToZohoLeadStatus } from '@/lib/crm/zoho-connector';
import { HubSpotConnector } from '@/lib/crm/hubspot-connector';
import { SalesforceConnector } from '@/lib/crm/salesforce-connector';
import type { CRMAuthConfig } from '@/lib/crm/types';

const mockConfig: CRMAuthConfig = {
  client_id: 'test-client-id',
  client_secret: 'test-client-secret',
  refresh_token: 'test-refresh-token',
};

describe('CRMFactory', () => {
  it('creates a ZohoConnector for "zoho"', () => {
    const connector = CRMFactory.create('zoho', mockConfig);
    expect(connector).toBeInstanceOf(ZohoConnector);
  });

  it('creates a HubSpotConnector for "hubspot"', () => {
    const connector = CRMFactory.create('hubspot', mockConfig);
    expect(connector).toBeInstanceOf(HubSpotConnector);
  });

  it('creates a SalesforceConnector for "salesforce"', () => {
    const connector = CRMFactory.create('salesforce', mockConfig);
    expect(connector).toBeInstanceOf(SalesforceConnector);
  });

  it('is case-insensitive', () => {
    const connector = CRMFactory.create('Zoho', mockConfig);
    expect(connector).toBeInstanceOf(ZohoConnector);

    const connector2 = CRMFactory.create('HUBSPOT', mockConfig);
    expect(connector2).toBeInstanceOf(HubSpotConnector);
  });

  it('throws on unsupported CRM type', () => {
    expect(() => CRMFactory.create('pipedrive', mockConfig)).toThrow(
      'Unsupported CRM type: pipedrive'
    );
  });

  it('lists supported types', () => {
    const types = CRMFactory.supportedTypes();
    expect(types).toContain('zoho');
    expect(types).toContain('hubspot');
    expect(types).toContain('salesforce');
  });
});

describe('HubSpot connector', () => {
  it('creates a connector with config', () => {
    const connector = new HubSpotConnector(mockConfig);
    expect(connector).toBeInstanceOf(HubSpotConnector);
  });

  it('maps fields to HubSpot format', () => {
    const connector = new HubSpotConnector(mockConfig);
    const mapped = connector.mapFields({
      first_name: 'Test',
      last_name: 'User',
      company: 'Acme',
      title: 'CEO',
      linkedin_url: 'https://linkedin.com/in/test',
      fulcrum_score: 85,
      fulcrum_grade: 'A',
      fit_score: 30,
      intent_score: 50,
      first_line: 'Great work on...',
      source: 'Fulcrum',
    });

    expect(mapped.firstname).toBe('Test');
    expect(mapped.lastname).toBe('User');
    expect(mapped.company).toBe('Acme');
    expect(mapped.jobtitle).toBe('CEO');
    expect(mapped.fulcrum_score).toBe(85);
  });

  it('supports private app auth mode', async () => {
    const connector = new HubSpotConnector({ api_key: 'pat-test-123' });
    // Private app auth returns true synchronously (no HTTP call)
    await expect(connector.authenticate()).resolves.toBe(true);
  });
});

describe('Salesforce connector', () => {
  it('creates a connector with config', () => {
    const connector = new SalesforceConnector(mockConfig);
    expect(connector).toBeInstanceOf(SalesforceConnector);
  });

  it('maps fields to Salesforce format', () => {
    const connector = new SalesforceConnector(mockConfig);
    const mapped = connector.mapFields({
      first_name: 'Jane',
      last_name: 'Doe',
      company: 'SaaS Co',
      title: 'VP Sales',
      linkedin_url: 'https://linkedin.com/in/janedoe',
      fulcrum_score: 92,
      fulcrum_grade: 'A+',
      fit_score: 35,
      intent_score: 55,
      first_line: 'Impressive growth numbers.',
      source: 'Fulcrum',
    });

    expect(mapped.FirstName).toBe('Jane');
    expect(mapped.LastName).toBe('Doe');
    expect(mapped.Company).toBe('SaaS Co');
    expect(mapped.Title).toBe('VP Sales');
    expect(mapped['Fulcrum_Score__c']).toBe(92);
    expect(mapped.LeadSource).toBe('Fulcrum');
  });
});

describe('Zoho connector field mapping', () => {
  it('creates a connector with config', () => {
    const connector = new ZohoConnector(mockConfig);
    const mapped = connector.mapFields({
      first_name: 'Jane',
      last_name: 'Doe',
      company: 'EdTech Co',
      title: 'Superintendent',
      linkedin_url: 'https://linkedin.com/in/janedoe',
      fulcrum_score: 92,
      fulcrum_grade: 'A+',
      fit_score: 35,
      intent_score: 55,
      first_line: 'Your district leadership in student wellbeing is impressive.',
      source: 'Fulcrum',
    });

    expect(mapped.First_Name).toBe('Jane');
    expect(mapped.Last_Name).toBe('Doe');
    expect(mapped.Company).toBe('EdTech Co');
    expect(mapped.Designation).toBe('Superintendent');
  });

  it('maps lead_status to Lead_Status', () => {
    const connector = new ZohoConnector(mockConfig);
    const mapped = connector.mapFields({
      first_name: 'John',
      last_name: 'Smith',
      company: 'Acme',
      title: 'CEO',
      linkedin_url: 'https://linkedin.com/in/johnsmith',
      fulcrum_score: 85,
      fulcrum_grade: 'A',
      fit_score: 30,
      intent_score: 50,
      first_line: 'Impressive revenue growth.',
      source: 'Fulcrum',
      lead_status: 'Sales-Ready',
    });

    expect(mapped.Lead_Status).toBe('Sales-Ready');
  });
});

describe('mapScoreToZohoLeadStatus', () => {
  it('returns "New" for Grade D leads (score 0-39)', () => {
    expect(mapScoreToZohoLeadStatus(0)).toBe('New');
    expect(mapScoreToZohoLeadStatus(20)).toBe('New');
    expect(mapScoreToZohoLeadStatus(39)).toBe('New');
  });

  it('returns "Working" for Grade C leads (score 40-59)', () => {
    expect(mapScoreToZohoLeadStatus(40)).toBe('Working');
    expect(mapScoreToZohoLeadStatus(50)).toBe('Working');
    expect(mapScoreToZohoLeadStatus(59)).toBe('Working');
  });

  it('returns "Nurturing" for Grade B leads (score 60-79)', () => {
    expect(mapScoreToZohoLeadStatus(60)).toBe('Nurturing');
    expect(mapScoreToZohoLeadStatus(70)).toBe('Nurturing');
    expect(mapScoreToZohoLeadStatus(79)).toBe('Nurturing');
  });

  it('returns "Sales-Ready" for Grade A/A+ leads (score 80-100)', () => {
    expect(mapScoreToZohoLeadStatus(80)).toBe('Sales-Ready');
    expect(mapScoreToZohoLeadStatus(90)).toBe('Sales-Ready');
    expect(mapScoreToZohoLeadStatus(100)).toBe('Sales-Ready');
  });

  it('follows the progression New → Working → Nurturing → Sales-Ready', () => {
    const stages = [
      mapScoreToZohoLeadStatus(10),
      mapScoreToZohoLeadStatus(45),
      mapScoreToZohoLeadStatus(65),
      mapScoreToZohoLeadStatus(85),
    ];
    expect(stages).toEqual(['New', 'Working', 'Nurturing', 'Sales-Ready']);
  });
});
