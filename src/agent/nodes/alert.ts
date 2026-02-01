/**
 * AlertUser Node
 * 
 * Alerts the user when manual review is required.
 * This could send an email, create a notification, or log to a review queue.
 */

import type { AgentState } from "../state.js";
import { logProcessing } from "../../storage/learning.js";
import { markInvoiceProcessed } from "../../storage/db.js";
import { sendErrorAlert } from "../../notifications/index.js";
import type { WorkflowSummary } from "../../notifications/types.js";

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
      const workflowSummary: WorkflowSummary = {
        invoiceId: state.invoice.id,
        status: state.error ? "error" : "review_required",
        action: state.action || "alert_user",
        confidence: state.overallConfidence,
        errors: state.error ? [state.error] : reasons,
        requiresHumanIntervention: true,
      };

      const errorDetails = state.error 
        ? `Error: ${state.error}\n\nReasons: ${reasons.join(", ")}`
        : `Reasons requiring review: ${reasons.join(", ")}\n\nConfidence: ${state.overallConfidence}%`;

      // Send notification asynchronously (don't block workflow)
      sendErrorAlert(workflowSummary, errorDetails).catch((error) => {
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
