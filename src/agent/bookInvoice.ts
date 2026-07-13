/**
 * Shared invoice booking path
 *
 * Single source of truth for "apply the agent's decision to Moneybird":
 * update the purchase invoice draft and link the matched bank
 * transaction. Used by both the autoBook graph node and the Telegram
 * review approval handler, so the two can never diverge.
 */

import type { AgentState } from "./state.js";
import type { MoneybirdInvoice } from "../moneybird/types.js";
import { MoneybirdMCPClient } from "../moneybird/mcpClient.js";

/**
 * Everything needed to finish booking an invoice, snapshot-able as JSON
 * (stored in pending_reviews.proposal for deferred approval).
 * All amounts in integer cents.
 */
export interface BookingProposal {
  invoiceId: string;
  contactId?: string;
  invoiceDate?: string;
  totalPriceExclTax?: number;
  totalPriceInclTax?: number;
  tax?: number;
  reference?: string;
  notes?: string;
  currency?: string;
  /** Matched bank transaction to link after the update, if any */
  transactionId?: string;
}

const normalizeAmount = (amount: number | null | undefined): number | undefined => {
  if (amount === null || amount === undefined) return undefined;
  // Credit notes are stored as positive amounts
  return Math.abs(amount);
};

/**
 * Build a booking proposal from agent state, preferring invoice amounts
 * (already in cents) over extraction amounts (currency units).
 * Mirrors the historical autoBook update-building logic exactly.
 */
export function buildBookingProposal(state: AgentState): BookingProposal | null {
  if (!state.invoice) {
    return null;
  }

  const proposal: BookingProposal = { invoiceId: state.invoice.id };

  if (state.contact?.id) {
    proposal.contactId = state.contact.id;
  }

  if (state.extraction?.invoice_date) {
    proposal.invoiceDate = state.extraction.invoice_date;
  }

  if (state.invoice.total_price_excl_tax !== undefined) {
    proposal.totalPriceExclTax = Math.abs(state.invoice.total_price_excl_tax);
  } else if (state.extraction?.amount_excl_tax !== undefined) {
    const normalized = normalizeAmount(state.extraction.amount_excl_tax);
    if (normalized !== undefined) {
      proposal.totalPriceExclTax = Math.round(normalized * 100);
    }
  }

  if (state.invoice.total_price_incl_tax !== undefined) {
    proposal.totalPriceInclTax = Math.abs(state.invoice.total_price_incl_tax);
  } else if (state.extraction?.amount_incl_tax !== undefined) {
    const normalized = normalizeAmount(state.extraction.amount_incl_tax);
    if (normalized !== undefined) {
      proposal.totalPriceInclTax = Math.round(normalized * 100);
    }
  }

  if (state.invoice.tax !== undefined) {
    proposal.tax = Math.abs(state.invoice.tax);
  } else if (state.extraction?.tax_amount !== undefined) {
    const normalized = normalizeAmount(state.extraction.tax_amount);
    if (normalized !== undefined) {
      proposal.tax = Math.round(normalized * 100);
    }
  }

  if (state.extraction?.invoice_number) {
    proposal.reference = state.extraction.invoice_number;
  }

  if (state.extraction?.description) {
    proposal.notes = state.extraction.description;
  }

  if (state.extraction?.currency) {
    const invoiceCurrency = state.invoice.currency || "EUR";
    if (state.extraction.currency !== invoiceCurrency) {
      console.log(JSON.stringify({
        level: "warn",
        event: "currency_mismatch",
        extracted_currency: state.extraction.currency,
        invoice_currency: invoiceCurrency,
        message: "Invoice currency differs from Moneybird default. Currency conversion may be needed.",
        timestamp: new Date().toISOString(),
      }));
      proposal.currency = state.extraction.currency;
    }
  }

  if (state.matchedTransaction) {
    proposal.transactionId = state.matchedTransaction.id;
  }

  return proposal;
}

/**
 * Apply a booking proposal to Moneybird: update the draft, then link the
 * matched bank transaction. A failed link never fails the booking — the
 * invoice is already updated; the link can be made manually.
 */
export async function executeBooking(proposal: BookingProposal): Promise<MoneybirdInvoice> {
  const client = new MoneybirdMCPClient();

  const updatedInvoice = await client.updatePurchaseInvoice(proposal.invoiceId, {
    contact_id: proposal.contactId,
    invoice_date: proposal.invoiceDate,
    total_price_excl_tax: proposal.totalPriceExclTax,
    total_price_incl_tax: proposal.totalPriceInclTax,
    tax: proposal.tax,
    reference: proposal.reference,
    notes: proposal.notes,
    currency: proposal.currency,
  });

  if (proposal.transactionId && updatedInvoice) {
    try {
      const invoiceAmount = Math.abs(updatedInvoice.total_price_incl_tax) / 100;

      console.log(JSON.stringify({
        level: "info",
        event: "linking_bank_transaction",
        invoice_id: updatedInvoice.id,
        transaction_id: proposal.transactionId,
        amount: invoiceAmount,
        timestamp: new Date().toISOString(),
      }));

      await client.linkFinancialMutationToBooking({
        mutationId: proposal.transactionId,
        bookingType: "PurchaseInvoice",
        bookingId: updatedInvoice.id,
        priceBase: invoiceAmount,
        description: `Auto-matched to invoice ${updatedInvoice.reference || updatedInvoice.id}`,
      });

      console.log(JSON.stringify({
        level: "info",
        event: "bank_transaction_linked",
        invoice_id: updatedInvoice.id,
        transaction_id: proposal.transactionId,
        timestamp: new Date().toISOString(),
      }));
    } catch (linkError) {
      console.log(JSON.stringify({
        level: "warn",
        event: "bank_transaction_link_failed",
        invoice_id: updatedInvoice.id,
        transaction_id: proposal.transactionId,
        error: linkError instanceof Error ? linkError.message : String(linkError),
        timestamp: new Date().toISOString(),
      }));
    }
  }

  return updatedInvoice;
}
