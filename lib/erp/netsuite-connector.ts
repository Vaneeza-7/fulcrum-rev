import { ERPConnector } from './base-erp-connector';
import { ERPInvoice, ERPPayment, ERPCustomer, ERPFieldMapping } from './types';

/**
 * NetSuite ERP connector placeholder.
 * NetSuite is intentionally out of scope until there is an active customer requirement.
 */
export class NetSuiteConnector extends ERPConnector {
  async authenticate(): Promise<boolean> {
    throw new Error('NetSuite ERP integration is intentionally unsupported in this deployment');
  }

  async getInvoices(
    _filters?: { customerId?: string; customerName?: string; since?: Date; status?: string }
  ): Promise<ERPInvoice[]> {
    throw new Error('NetSuite ERP integration is intentionally unsupported in this deployment');
  }

  async getInvoice(_invoiceId: string): Promise<ERPInvoice | null> {
    throw new Error('NetSuite ERP integration is intentionally unsupported in this deployment');
  }

  async getPayments(
    _filters?: { customerId?: string; invoiceId?: string; since?: Date }
  ): Promise<ERPPayment[]> {
    throw new Error('NetSuite ERP integration is intentionally unsupported in this deployment');
  }

  async getCustomers(_filters?: { name?: string; status?: string }): Promise<ERPCustomer[]> {
    throw new Error('NetSuite ERP integration is intentionally unsupported in this deployment');
  }

  async findInvoiceForDeal(
    _customerName: string,
    _dealValue: number,
    _tolerance?: number
  ): Promise<ERPInvoice | null> {
    throw new Error('NetSuite ERP integration is intentionally unsupported in this deployment');
  }

  async findPaymentForInvoice(_invoiceId: string): Promise<ERPPayment | null> {
    throw new Error('NetSuite ERP integration is intentionally unsupported in this deployment');
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
