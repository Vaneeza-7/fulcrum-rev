export interface ERPInvoice {
  id: string;
  customerName: string;
  customerId: string;
  invoiceNumber: string;
  amount: number;
  status: string; // 'open' | 'paid' | 'voided' | 'partially_paid'
  issuedDate: string;
  dueDate: string;
  paidDate: string | null;
  paidAmount: number;
  relatedDealId?: string;
}

export interface ERPPayment {
  id: string;
  customerId: string;
  customerName: string;
  invoiceId: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  status: string; // 'completed' | 'refunded' | 'voided'
}

export interface ERPCustomer {
  id: string;
  name: string;
  email: string | null;
  status: string; // 'active' | 'inactive' | 'churned'
  createdDate: string;
}

export interface ERPFieldMapping {
  [fulcrumField: string]: string;
}

export interface ERPAuthConfig {
  account_id?: string;
  consumer_key?: string;
  consumer_secret?: string;
  token_id?: string;
  token_secret?: string;
  api_key?: string;
  [key: string]: string | undefined;
}
