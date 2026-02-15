import { ERPConnector } from './base-erp-connector';
import { ERPAuthConfig } from './types';
import { NetSuiteConnector } from './netsuite-connector';

const CONNECTORS: Record<string, new (config: ERPAuthConfig) => ERPConnector> = {
  netsuite: NetSuiteConnector,
};

/**
 * Factory for creating ERP connectors.
 * Adding a new ERP = add a new connector class + register it here.
 */
export class ERPFactory {
  static create(erpType: string, config: Record<string, string | undefined>): ERPConnector {
    const ConnectorClass = CONNECTORS[erpType.toLowerCase()];
    if (!ConnectorClass) {
      throw new Error(`Unsupported ERP type: ${erpType}. Supported: ${Object.keys(CONNECTORS).join(', ')}`);
    }
    return new ConnectorClass(config as ERPAuthConfig);
  }

  static supportedTypes(): string[] {
    return Object.keys(CONNECTORS);
  }
}
