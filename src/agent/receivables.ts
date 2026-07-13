/**
 * Receivables Tracker (debiteurenbewaking)
 *
 * Finds outstanding sales invoices that are past their due date so the
 * daily summary can show who owes money and for how long. This is
 * read-only: it never sends payment reminders itself, it only surfaces
 * the information so the user can chase payments in Moneybird.
 */

import { MoneybirdMCPClient } from "../moneybird/mcpClient.js";
import type { MoneybirdInvoice, MoneybirdContact } from "../moneybird/types.js";
import type { OverdueInvoice } from "../notifications/types.js";

// Moneybird sales invoice states that represent unpaid invoices
const UNPAID_STATES = ["open", "late", "reminded"];

// Sales invoice amounts come from the MCP server in currency units
// (e.g. 25.71 for €25,71), sometimes as strings. Normalize to a number.
function toAmount(value: number | string | undefined | null): number {
  if (value === undefined || value === null) return 0;
  const num = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(num) ? Math.abs(num) : 0;
}

function contactDisplayName(contact: MoneybirdContact): string | undefined {
  if (contact.company_name) return contact.company_name;
  const personal = [contact.firstname, contact.lastname].filter(Boolean).join(" ");
  return personal || undefined;
}

/**
 * Find sales invoices that are past their due date.
 * Sorted by days overdue (most overdue first).
 */
export async function findOverdueSalesInvoices(): Promise<OverdueInvoice[]> {
  const client = new MoneybirdMCPClient();
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Fetch unpaid invoices per state; Moneybird's list endpoint filters on a
  // single state at a time. Failures for one state shouldn't hide the rest.
  const invoicesByState = await Promise.allSettled(
    UNPAID_STATES.map((state) => client.listInvoices({ state, per_page: "100" }))
  );

  const seen = new Set<string>();
  const unpaidInvoices: MoneybirdInvoice[] = [];
  for (const result of invoicesByState) {
    if (result.status !== "fulfilled") {
      console.log(JSON.stringify({
        level: "warn",
        event: "overdue_invoices_state_fetch_failed",
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        timestamp: new Date().toISOString(),
      }));
      continue;
    }
    for (const invoice of result.value) {
      if (invoice.id && !seen.has(invoice.id)) {
        seen.add(invoice.id);
        unpaidInvoices.push(invoice);
      }
    }
  }

  const overdue = unpaidInvoices.filter((inv) => {
    if (!inv.due_date) {
      // "late" state means Moneybird itself considers it overdue
      return inv.state === "late";
    }
    return inv.due_date < todayStr;
  });

  // Resolve contact names (cached per contact, capped to bound API calls)
  const contactNames = new Map<string, string | undefined>();
  const MAX_CONTACT_LOOKUPS = 20;
  for (const invoice of overdue) {
    if (!invoice.contact_id || contactNames.has(invoice.contact_id)) continue;
    if (contactNames.size >= MAX_CONTACT_LOOKUPS) break;
    try {
      const contact = await client.getContact(invoice.contact_id);
      contactNames.set(invoice.contact_id, contactDisplayName(contact));
    } catch {
      contactNames.set(invoice.contact_id, undefined);
    }
  }

  const result = overdue
    .map((inv) => {
      const dueDate = inv.due_date || inv.invoice_date || todayStr;
      const daysOverdue = Math.max(
        0,
        Math.floor((today.getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24))
      );

      return {
        id: inv.id,
        invoiceNumber: inv.invoice_id || inv.reference,
        contactName: inv.contact_id ? contactNames.get(inv.contact_id) : undefined,
        amount: toAmount(inv.total_price_incl_tax),
        dueDate: inv.due_date,
        daysOverdue,
        state: inv.state,
      };
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  console.log(JSON.stringify({
    level: "info",
    event: "overdue_sales_invoices_found",
    count: result.length,
    total_outstanding: result.reduce((sum, inv) => sum + inv.amount, 0).toFixed(2),
    timestamp: new Date().toISOString(),
  }));

  return result;
}
