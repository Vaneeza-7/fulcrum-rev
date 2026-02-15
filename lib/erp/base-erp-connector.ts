import { ERPInvoice, ERPPayment, ERPCustomer, ERPFieldMapping, ERPAuthConfig } from './types';

/**
 * Abstract base class for all ERP integrations.
 * Read-only — we never write to the client's ERP.
 */
export abstract class ERPConnector {
  protected config: ERPAuthConfig;
  protected fieldMapping: ERPFieldMapping;

  constructor(config: ERPAuthConfig) {
    this.config = config;
    this.fieldMapping = this.getFieldMapping();
  }

  /** Authenticate with the ERP. */
  abstract authenticate(): Promise<boolean>;

  /** Get invoices, optionally filtered by customer or date range. */
  abstract getInvoices(filters?: {
    customerId?: string;
    customerName?: string;
    since?: Date;
    status?: string;
  }): Promise<ERPInvoice[]>;

  /** Get a specific invoice by ID. */
  abstract getInvoice(invoiceId: string): Promise<ERPInvoice | null>;

  /** Get payments, optionally filtered. */
  abstract getPayments(filters?: {
    customerId?: string;
    invoiceId?: string;
    since?: Date;
  }): Promise<ERPPayment[]>;

  /** Get customer records for cross-referencing. */
  abstract getCustomers(filters?: {
    name?: string;
    status?: string;
  }): Promise<ERPCustomer[]>;

  /** Find invoices that match a CRM deal (by customer name + approximate amount). */
  abstract findInvoiceForDeal(
    customerName: string,
    dealValue: number,
    tolerance?: number
  ): Promise<ERPInvoice | null>;

  /** Find payment for a specific invoice. */
  abstract findPaymentForInvoice(invoiceId: string): Promise<ERPPayment | null>;

  /** ERP-specific field name mappings. */
  protected abstract getFieldMapping(): ERPFieldMapping;
}
