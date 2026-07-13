/**
 * AlertUser Node
 * 
 * Alerts the user when manual review is required.
 * This could send an email, create a notification, or log to a review queue.
 */

import type { AgentState } from "../state.js";
import { logProcessing, getTopKostenposten } from "../../storage/learning.js";
import { markInvoiceProcessed } from "../../storage/db.js";
import { sendErrorAlert } from "../../notifications/index.js";
import type { WorkflowSummary } from "../../notifications/types.js";
import { sendReviewCard, type ReviewProposal } from "../../notifications/telegramBot.js";
import { humanizeReasons, humanizeError } from "../../notifications/humanize.js";
import { buildBookingProposal } from "../bookInvoice.js";
import { MoneybirdMCPClient } from "../../moneybird/mcpClient.js";
import { getEnv } from "../../config/env.js";

/**
 * Kostenpost choices for the review picker: the proposal first, then the
 * most-used mappings from the learning store, filled up with ledger
 * accounts to at most six unique options.
 */
async function buildKostenpostOptions(
  proposedId: string | undefined,
  proposedName: string | undefined
): Promise<Array<{ id: string; name: string }>> {
  const options: Array<{ id: string; name: string }> = [];
  const seen = new Set<string>();
  const add = (id: string | undefined, name: string | undefined) => {
    if (id && name && !seen.has(id) && options.length < 6) {
      seen.add(id);
      options.push({ id, name });
    }
  };

  add(proposedId, proposedName);
  try {
    for (const top of getTopKostenposten(6)) {
      add(top.kostenpost_id, top.kostenpost_name);
    }
  } catch { /* learning store empty */ }
  try {
    const client = new MoneybirdMCPClient();
    for (const account of await client.listLedgerAccounts()) {
      add(account.id, account.name);
    }
  } catch { /* picker just gets fewer options */ }

  return options;
}

/**
 * Build and send the interactive Telegram review card for this invoice.
 * Returns false when Telegram is not configured or the card failed.
 */
async function tryInteractiveReview(state: AgentState, reasons: string[]): Promise<boolean> {
  const env = getEnv();
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_IDS || !state.invoice) {
    return false;
  }

  try {
    const booking = buildBookingProposal(state);
    if (!booking) return false;

    const client = new MoneybirdMCPClient();
    let kostenpostName: string | undefined;
    if (state.kostenpostId) {
      try {
        kostenpostName = (await client.getLedgerAccount(state.kostenpostId)).name;
      } catch { /* name stays undefined */ }
    }

    const proposal: ReviewProposal = {
      invoiceId: state.invoice.id,
      supplierName:
        state.extraction?.supplier_name ||
        state.contact?.company_name ||
        state.invoice.contact?.company_name,
      amountInclTax: booking.totalPriceInclTax,
      invoiceDate: state.invoice.invoice_date || state.extraction?.invoice_date,
      reference: state.invoice.reference || state.extraction?.invoice_number,
      kostenpostId: state.kostenpostId,
      kostenpostName,
      kostenpostConfidence: state.kostenpostDecision?.confidence,
      transactionDescription: state.matchedTransaction?.description,
      matchConfidence: state.matchDecision?.confidence,
      flags: reasons,
      booking,
      kostenpostOptions: await buildKostenpostOptions(state.kostenpostId, kostenpostName),
    };

    return await sendReviewCard(proposal);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "review_card_send_failed",
      invoice_id: state.invoice.id,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));
    return false;
  }
}

export async function alert(
  state: AgentState
): Promise<Partial<AgentState>> {
  // Alert can be called even without invoice (e.g., when no invoices found)
  if (!state.invoice && !state.error) {
    // No invoice to process - this is normal
    return {
      currentNode: "alert",
      processingCompletedAt: new Date().toISOString(),
      // Preserve any state that exists
      ...(state.contact && { contact: state.contact }),
      ...(state.extraction && { extraction: state.extraction }),
    };
  }

  if (!state.invoice || !state.invoice.id) {
    return {
      error: "No invoice available or invoice ID missing",
      currentNode: "alert",
    };
  }

  try {
    // TODO: Implement actual alert mechanism
    // Options:
    // - Send email
    // - Create notification in Moneybird
    // - Log to review queue file
    // - Webhook to external system

    // For now, just log to database (only if we have invoice ID)
    if (state.invoice.id) {
      logProcessing({
        invoice_id: state.invoice.id,
        state: JSON.stringify(state),
        action_taken: state.action || "alert_user",
        confidence: state.overallConfidence,
      });
    }

    // Mark invoice as processed (with review status)
    const status = state.action === "auto_book" ? "completed" : 
                   state.action === "flag_review" ? "review" : "review";
    markInvoiceProcessed(state.invoice.id, status);

    // Log to console (structured JSON)
    const reasons = [
      state.isNewContact && "new_supplier",
      state.contactMatchDecision?.requiresReview && "contact_match_low_confidence",
      state.validationDecision?.requiresReview && "validation_issue",
      state.kostenpostDecision?.requiresReview && "kostenpost_classification_uncertain",
      state.matchDecision?.requiresReview && "transaction_match_uncertain",
    ].filter(Boolean) as string[];

    console.log(JSON.stringify({
      level: "warn",
      event: "manual_review_required",
      invoice_id: state.invoice.id,
      confidence: state.overallConfidence,
      action: state.action,
      reasons,
      timestamp: new Date().toISOString(),
    }));

    // Send notification if human intervention is required
    const requiresHumanIntervention = 
      state.action === "alert_user" || 
      state.action === "flag_review" ||
      state.error !== undefined ||
      reasons.length > 0;

    if (requiresHumanIntervention && state.invoice) {
      // Notifications speak human; the machine codes stay in the logs above
      const humanReasons = humanizeReasons(reasons);

      const workflowSummary: WorkflowSummary = {
        invoiceId: state.invoice.id,
        status: state.error ? "error" : "review_required",
        action: state.action || "alert_user",
        confidence: state.overallConfidence,
        errors: state.error ? [humanizeError(state.error).summary] : humanReasons,
        requiresHumanIntervention: true,
        supplierName:
          state.extraction?.supplier_name ||
          state.contact?.company_name ||
          state.invoice.contact?.company_name,
        amountInclTaxCents: state.invoice.total_price_incl_tax
          ? Math.abs(state.invoice.total_price_incl_tax)
          : undefined,
        reference: state.invoice.reference || state.extraction?.invoice_number,
      };

      const errorDetails = state.error
        ? `${humanizeError(state.error).summary}\n\nTechnical detail: ${state.error}${humanReasons.length > 0 ? `\n\nAlso noted:\n${humanReasons.map((r) => `• ${r}`).join("\n")}` : ""}`
        : `Why this needs a look:\n${humanReasons.map((r) => `• ${r}`).join("\n")}\n\nOverall confidence: ${state.overallConfidence !== undefined ? `${Math.round(state.overallConfidence)}%` : "unknown"}`;

      // For reviewable invoices (no hard error), try the interactive
      // Telegram review card; the plain Telegram alert is skipped when it
      // succeeds so the user gets one actionable message, not two.
      const interactiveSent = !state.error
        ? await tryInteractiveReview(state, humanReasons)
        : false;

      // Send notification asynchronously (don't block workflow)
      sendErrorAlert(workflowSummary, errorDetails, { skipTelegram: interactiveSent }).catch((error) => {
        console.error(JSON.stringify({
          level: "error",
          event: "notification_send_failed",
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        }));
      });
    }

    return {
      currentNode: "alert",
      processingCompletedAt: new Date().toISOString(),
      // Preserve invoice and key state for final result
      invoice: state.invoice,
      contact: state.contact,
      extraction: state.extraction,
      kostenpostId: state.kostenpostId,
      matchedTransaction: state.matchedTransaction,
      overallConfidence: state.overallConfidence,
      action: state.action,
      contactMatchDecision: state.contactMatchDecision,
      validationDecision: state.validationDecision,
      kostenpostDecision: state.kostenpostDecision,
      matchDecision: state.matchDecision,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown error in alert",
      currentNode: "alert",
      invoice: state.invoice, // Preserve invoice even on error
    };
  }
}
