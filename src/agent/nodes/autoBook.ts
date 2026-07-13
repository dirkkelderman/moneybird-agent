/**
 * AutoBookDraft Node
 *
 * Automatically books the invoice as a draft in Moneybird.
 * Only called when confidence is high enough.
 *
 * The actual write path lives in ../bookInvoice.ts, shared with the
 * Telegram review approval handler.
 */

import type { AgentState } from "../state.js";
import { buildBookingProposal, executeBooking } from "../bookInvoice.js";
import { logProcessing } from "../../storage/learning.js";
import { markInvoiceProcessed } from "../../storage/db.js";

export async function autoBook(
  state: AgentState
): Promise<Partial<AgentState>> {
  if (!state.invoice) {
    return {
      error: "No invoice available",
      currentNode: "autoBook",
    };
  }

  if (state.action !== "auto_book") {
    return {
      error: "Action is not auto_book",
      currentNode: "autoBook",
    };
  }

  try {
    const proposal = buildBookingProposal(state);
    if (!proposal) {
      return {
        error: "Could not build booking proposal",
        currentNode: "autoBook",
      };
    }

    console.log(JSON.stringify({
      level: "info",
      event: "auto_booking_invoice",
      invoice_id: state.invoice.id,
      updates: {
        contact_id: proposal.contactId,
        invoice_date: proposal.invoiceDate,
        total_price_incl_tax: proposal.totalPriceInclTax,
        currency: proposal.currency,
      },
      confidence: state.overallConfidence,
      timestamp: new Date().toISOString(),
    }));

    const updatedInvoice = await executeBooking(proposal);

    // Log processing
    logProcessing({
      invoice_id: state.invoice.id,
      state: JSON.stringify(state),
      action_taken: "auto_book",
      confidence: state.overallConfidence,
    });

    // Mark invoice as processed
    markInvoiceProcessed(state.invoice.id, "completed");

    return {
      currentNode: "autoBook",
      invoice: updatedInvoice,
      processingCompletedAt: new Date().toISOString(),
    };
  } catch (error) {
    logProcessing({
      invoice_id: state.invoice.id,
      state: JSON.stringify(state),
      action_taken: "auto_book",
      error: error instanceof Error ? error.message : "Unknown error",
    });

    return {
      error: error instanceof Error ? error.message : "Unknown error in autoBook",
      currentNode: "autoBook",
    };
  }
}
