/**
 * AutoBookDraft Node
 * 
 * Automatically books the invoice as a draft in Moneybird.
 * Only called when confidence is high enough.
 */

import type { AgentState } from "../state.js";
import { MoneybirdMCPClient } from "../../moneybird/mcpClient.js";
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

  const client = new MoneybirdMCPClient();

  try {
    // Normalize amounts: ensure positive values (credit notes should be stored as positive)
    const normalizeAmount = (amount: number | null | undefined): number | undefined => {
      if (amount === null || amount === undefined) return undefined;
      // If negative, make it positive (credit note)
      return Math.abs(amount);
    };

    // Update invoice with all resolved data
    const updates: {
      contact_id?: string;
      invoice_date?: string;
      total_price_excl_tax?: number;
      total_price_incl_tax?: number;
      tax?: number;
      reference?: string;
      notes?: string;
      currency?: string;
    } = {};

    if (state.contact?.id) {
      updates.contact_id = state.contact.id;
    }

    if (state.extraction?.invoice_date) {
      updates.invoice_date = state.extraction.invoice_date;
    }

    // Use invoice amounts if available (already normalized and in cents), otherwise convert from extraction
    // Amounts should always be positive (credit notes normalized)
    if (state.invoice?.total_price_excl_tax !== undefined) {
      updates.total_price_excl_tax = Math.abs(state.invoice.total_price_excl_tax); // Ensure positive
    } else if (state.extraction?.amount_excl_tax !== undefined) {
      const normalized = normalizeAmount(state.extraction.amount_excl_tax);
      if (normalized !== undefined) {
        updates.total_price_excl_tax = Math.round(normalized * 100);
      }
    }

    if (state.invoice?.total_price_incl_tax !== undefined) {
      updates.total_price_incl_tax = Math.abs(state.invoice.total_price_incl_tax); // Ensure positive
    } else if (state.extraction?.amount_incl_tax !== undefined) {
      const normalized = normalizeAmount(state.extraction.amount_incl_tax);
      if (normalized !== undefined) {
        updates.total_price_incl_tax = Math.round(normalized * 100);
      }
    }

    if (state.invoice?.tax !== undefined) {
      updates.tax = Math.abs(state.invoice.tax); // Ensure positive
    } else if (state.extraction?.tax_amount !== undefined) {
      const normalized = normalizeAmount(state.extraction.tax_amount);
      if (normalized !== undefined) {
        updates.tax = Math.round(normalized * 100);
      }
    }

    if (state.extraction?.invoice_number) {
      updates.reference = state.extraction.invoice_number;
    }

    if (state.extraction?.description) {
      updates.notes = state.extraction.description;
    }

    // Handle currency: if extraction has currency and it differs from invoice, log warning
    // Note: Moneybird may not allow currency changes on existing invoices, so we log it
    if (state.extraction?.currency) {
      const invoiceCurrency = state.invoice?.currency || "EUR";
      if (state.extraction.currency !== invoiceCurrency) {
        console.log(
          JSON.stringify({
            level: "warn",
            event: "currency_mismatch",
            extracted_currency: state.extraction.currency,
            invoice_currency: invoiceCurrency,
            message: "Invoice currency differs from Moneybird default. Currency conversion may be needed.",
            timestamp: new Date().toISOString(),
          })
        );
        // Try to update currency if Moneybird supports it
        updates.currency = state.extraction.currency;
      }
    }

    console.log(
      JSON.stringify({
        level: "info",
        event: "auto_booking_invoice",
        invoice_id: state.invoice.id,
        updates: {
          contact_id: updates.contact_id,
          invoice_date: updates.invoice_date,
          total_price_incl_tax: updates.total_price_incl_tax,
          currency: updates.currency,
        },
        confidence: state.overallConfidence,
        timestamp: new Date().toISOString(),
      })
    );

    // Update purchase invoice in Moneybird (this saves the invoice)
    const updatedInvoice = await client.updatePurchaseInvoice(state.invoice.id, updates);

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
