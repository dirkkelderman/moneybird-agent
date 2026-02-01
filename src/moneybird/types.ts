/**
 * Moneybird types and interfaces
 * These types represent Moneybird entities and operations
 */

export interface MoneybirdContact {
  id: string;
  company_name?: string;
  firstname?: string;
  lastname?: string;
  customer_id?: string;
  tax_number?: string;
  email?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  zipcode?: string;
  city?: string;
  country?: string;
  bank_account?: string;
  sepa_iban?: string;
}

export interface MoneybirdInvoice {
  id: string;
  contact_id?: string;
  contact?: MoneybirdContact;
  invoice_id?: string;
  invoice_date?: string;
  due_date?: string;
  total_price_excl_tax: number;
  total_price_incl_tax: number;
  tax?: number;
  currency: string;
  state: "new" | "draft" | "open" | "paid" | "late" | "reminded";
  reference?: string;
  notes?: string;
  attachments?: MoneybirdAttachment[];
}

export interface MoneybirdAttachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  url?: string;
}

export interface MoneybirdLedgerAccount {
  id: string;
  name: string;
  account_type: string;
  account_id?: string;
}

export interface MoneybirdTransaction {
  id: string;
  date: string;
  amount: number;
  description?: string;
  account_id?: string;
  contact_id?: string;
  invoice_id?: string;
}

export interface MoneybirdKostenpost {
  id: string;
  name: string;
  ledger_account_id: string;
}

export interface CreateContactInput {
  company_name?: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  phone?: string;
  tax_number?: string;
  bank_account?: string;
}

export interface UpdateInvoiceInput {
  contact_id?: string;
  invoice_date?: string;
  total_price_excl_tax?: number;
  total_price_incl_tax?: number;
  tax?: number;
  reference?: string;
  notes?: string;
  currency?: string; // ISO currency code (e.g., "USD", "EUR")
  state?: "new" | "draft" | "open" | "paid" | "late" | "reminded"; // Try to set state (may allow conversion from "new" to "draft")
}

export interface CreateInvoiceInput {
  contact_id: string; // Required for purchase invoices
  invoice_date?: string;
  total_price_excl_tax?: number;
  total_price_incl_tax?: number;
  tax?: number;
  reference?: string;
  notes?: string;
  currency?: string; // ISO currency code (e.g., "USD", "EUR")
  state?: "draft"; // New invoices can be created directly in "draft" state
}
