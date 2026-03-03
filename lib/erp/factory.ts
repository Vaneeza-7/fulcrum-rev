import { ERPConnector } from './base-erp-connector';
import { ERPAuthConfig } from './types';

/**
 * Factory for creating ERP connectors.
 * ERP sync is intentionally out of scope until there is an active customer requirement.
 */
export class ERPFactory {
  static create(erpType: string, _config: Record<string, string | undefined>): ERPConnector {
    if (erpType.toLowerCase() === 'netsuite') {
      throw new Error('NetSuite ERP integration is intentionally unsupported in this deployment');
    }

    throw new Error(`Unsupported ERP type: ${erpType}. No ERP connectors are currently supported.`);
  }

  static supportedTypes(): string[] {
    return [];
  }
}
