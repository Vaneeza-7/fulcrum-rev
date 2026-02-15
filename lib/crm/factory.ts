import { CRMConnector } from './base-connector';
import { CRMAuthConfig } from './types';
import { ZohoConnector } from './zoho-connector';
import { HubSpotConnector } from './hubspot-connector';
import { SalesforceConnector } from './salesforce-connector';

const CONNECTORS: Record<string, new (config: CRMAuthConfig) => CRMConnector> = {
  zoho: ZohoConnector,
  hubspot: HubSpotConnector,
  salesforce: SalesforceConnector,
};

/**
 * Factory for creating CRM connectors.
 * Adding a new CRM = add a new connector class + register it here.
 */
export class CRMFactory {
  static create(crmType: string, config: CRMAuthConfig): CRMConnector {
    const ConnectorClass = CONNECTORS[crmType.toLowerCase()];
    if (!ConnectorClass) {
      throw new Error(`Unsupported CRM type: ${crmType}. Supported: ${Object.keys(CONNECTORS).join(', ')}`);
    }
    return new ConnectorClass(config);
  }

  static supportedTypes(): string[] {
    return Object.keys(CONNECTORS);
  }
}
