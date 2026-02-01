/**
 * CheckInvoiceCompleteness Node
 * 
 * Checks if an invoice has all required fields:
 * - Contact
 * - Amount (excl/incl tax)
 * - BTW (VAT)
 * - Date
 */

import type { AgentState } from "../state.js";

export async function checkCompleteness(
  state: AgentState
): Promise<Partial<AgentState>> {
  if (!state.invoice) {
    return {
      error: "No invoice in state",
      currentNode: "checkCompleteness",
    };
  }

  const invoice = state.invoice;
  const missing: string[] = [];

  // Check required fields
  if (!invoice.contact_id && !invoice.contact) {
    missing.push("contact");
  }

  if (invoice.total_price_excl_tax === undefined || invoice.total_price_excl_tax === 0) {
    missing.push("amount_excl_tax");
  }

  if (invoice.total_price_incl_tax === undefined || invoice.total_price_incl_tax === 0) {
    missing.push("amount_incl_tax");
  }

  if (!invoice.tax && invoice.tax !== 0) {
    missing.push("tax");
  }

  if (!invoice.invoice_date) {
    missing.push("invoice_date");
  }

  console.log(JSON.stringify({
    level: "debug",
    event: "completeness_check_result",
    invoice_id: invoice.id,
    missing_fields: missing,
    has_contact: !!(invoice.contact_id || invoice.contact),
    has_amounts: !!(invoice.total_price_excl_tax && invoice.total_price_incl_tax),
    has_tax: invoice.tax !== undefined,
    has_date: !!invoice.invoice_date,
    timestamp: new Date().toISOString(),
  }));

  return {
    currentNode: "checkCompleteness",
    // Don't set error for missing fields - that's expected and will route to scanInvoicePdf
    // Only set error for actual problems
  };
}
