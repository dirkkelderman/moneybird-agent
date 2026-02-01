/**
 * DetectNewInvoices Node
 * 
 * Detects new incoming invoices in Moneybird that need processing.
 * This is the entry point of the workflow.
 */

import type { AgentState } from "../state.js";
import { MoneybirdMCPClient } from "../../moneybird/mcpClient.js";
import { isInvoiceProcessed } from "../../storage/db.js";
import type { MoneybirdInvoice } from "../../moneybird/types.js";

export async function detectNewInvoices(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _state: AgentState // State parameter required by LangGraph, but not used in this node
): Promise<Partial<AgentState>> {
  try {
    const client = new MoneybirdMCPClient();
    
    // Query Moneybird for purchase invoices
    // Note: Moneybird MCP may not support state filter, so we'll get all and filter client-side
    const allInvoices = await client.listPurchaseInvoices({
      per_page: "50", // Get up to 50 invoices
    });
    
    // Filter for invoices that need processing (new or draft state)
    // "new" = incoming invoices that haven't been processed yet
    // "draft" = manually created drafts
    const unprocessedStates = ["new", "draft"];
    const invoicesToProcess = allInvoices.filter(
      (invoice) => unprocessedStates.includes(invoice.state)
    );
    
    console.log(JSON.stringify({
      level: "debug",
      event: "invoice_detection",
      total_invoices: allInvoices.length,
      invoices_in_unprocessed_states: invoicesToProcess.length,
      unprocessed_states: unprocessedStates,
      timestamp: new Date().toISOString(),
    }));
    
    // Filter for invoices that haven't been processed yet
    const unprocessedInvoices = invoicesToProcess.filter(
      (invoice) => {
        const processed = isInvoiceProcessed(invoice.id);
        if (processed) {
          console.log(JSON.stringify({
            level: "debug",
            event: "invoice_already_processed",
            invoice_id: invoice.id,
            timestamp: new Date().toISOString(),
          }));
        }
        return !processed;
      }
    );
    
    console.log(JSON.stringify({
      level: "debug",
      event: "unprocessed_invoices_found",
      count: unprocessedInvoices.length,
      invoice_ids: unprocessedInvoices.map(inv => inv.id),
      timestamp: new Date().toISOString(),
    }));
    
    if (unprocessedInvoices.length === 0) {
      // No new invoices to process - route to alert and end
      return {
        currentNode: "detectNewInvoices",
        // No invoice found - workflow will route to alert and end gracefully
      };
    }
    
    // Process the first unprocessed invoice
    const invoiceToProcess = unprocessedInvoices[0];
    
    // Fetch full invoice details (including contact if available)
    let fullInvoice: MoneybirdInvoice;
    try {
      fullInvoice = await client.getPurchaseInvoice(invoiceToProcess.id);
    } catch {
      // If getPurchaseInvoice fails, use the invoice from list
      fullInvoice = invoiceToProcess;
    }
    
    // If invoice has a contact_id, try to fetch contact details
    if (fullInvoice.contact_id) {
      try {
        const contact = await client.getContact(fullInvoice.contact_id);
        fullInvoice.contact = contact;
      } catch {
        // Contact fetch failed, continue without contact details
      }
    }
    
    console.log(JSON.stringify({
      level: "info",
      event: "invoice_selected_for_processing",
      invoice_id: fullInvoice.id,
      invoice_state: fullInvoice.state,
      has_contact: !!fullInvoice.contact_id,
      timestamp: new Date().toISOString(),
    }));
    
    return {
      currentNode: "detectNewInvoices",
      invoice: fullInvoice,
    };
  } catch (error) {
    return {
      currentNode: "detectNewInvoices",
      error: error instanceof Error ? error.message : "Unknown error in detectNewInvoices",
    };
  }
}
