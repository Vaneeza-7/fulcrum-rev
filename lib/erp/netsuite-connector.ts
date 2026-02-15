import { ERPConnector } from './base-erp-connector';
import { ERPInvoice, ERPPayment, ERPCustomer, ERPFieldMapping } from './types';

/**
 * NetSuite ERP connector stub.
 * Field mappings are defined. Methods will be implemented when a customer needs NetSuite.
 */
export class NetSuiteConnector extends ERPConnector {
  async authenticate(): Promise<boolean> {
    throw new Error('NetSuite connector not yet implemented');
  }

  async getInvoices(
    _filters?: { customerId?: string; customerName?: string; since?: Date; status?: string }
  ): Promise<ERPInvoice[]> {
    throw new Error('NetSuite connector not yet implemented');
  }

  async getInvoice(_invoiceId: string): Promise<ERPInvoice | null> {
    throw new Error('NetSuite connector not yet implemented');
  }

  async getPayments(
    _filters?: { customerId?: string; invoiceId?: string; since?: Date }
  ): Promise<ERPPayment[]> {
    throw new Error('NetSuite connector not yet implemented');
  }

  async getCustomers(_filters?: { name?: string; status?: string }): Promise<ERPCustomer[]> {
    throw new Error('NetSuite connector not yet implemented');
  }

  async findInvoiceForDeal(
    _customerName: string,
    _dealValue: number,
    _tolerance?: number
  ): Promise<ERPInvoice | null> {
    throw new Error('NetSuite connector not yet implemented');
  }

  async findPaymentForInvoice(_invoiceId: string): Promise<ERPPayment | null> {
    throw new Error('NetSuite connector not yet implemented');
  }

  protected getFieldMapping(): ERPFieldMapping {
    return {
      invoiceId: 'internalid',
      customerName: 'entity',
      invoiceNumber: 'tranid',
      amount: 'total',
      status: 'status',
      issuedDate: 'trandate',
      dueDate: 'duedate',
      paidDate: 'lastpaymentdate',
      paidAmount: 'amountpaid',
    };
  }
}
