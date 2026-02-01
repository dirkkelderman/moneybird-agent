/**
 * ConfidenceGate Node
 * 
 * Determines the action based on overall confidence:
 * - ≥95%: Auto book (draft)
 * - 80-95%: Flag for review
 * - <80%: Alert user
 * 
 * Also considers special cases:
 * - New supplier → manual review
 * - High amount → manual review
 */

import type { AgentState } from "../state.js";
import { getEnv } from "../../config/env.js";

export async function confidenceGate(
  state: AgentState
): Promise<Partial<AgentState>> {
  const env = getEnv();
  
  // Calculate overall confidence from all decisions
  const confidences: number[] = [];
  
  if (state.contactMatchDecision?.confidence !== undefined) {
    confidences.push(state.contactMatchDecision.confidence);
  }
  if (state.validationDecision?.confidence !== undefined) {
    confidences.push(state.validationDecision.confidence);
  }
  if (state.kostenpostDecision?.confidence !== undefined) {
    confidences.push(state.kostenpostDecision.confidence);
  }
  if (state.matchDecision?.confidence !== undefined) {
    confidences.push(state.matchDecision.confidence);
  }

  // Average confidence (or use weighted average if needed)
  const overallConfidence = confidences.length > 0
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;

  // Check special conditions
  const isNewSupplier = state.isNewContact;
  const invoiceAmount = state.invoice?.total_price_incl_tax ?? 0;
  const isHighAmount = invoiceAmount > env.AMOUNT_REVIEW_THRESHOLD;
  const requiresReview = state.contactMatchDecision?.requiresReview ||
                        state.validationDecision?.requiresReview ||
                        state.kostenpostDecision?.requiresReview ||
                        state.matchDecision?.requiresReview;

  // Determine action
  let action: "auto_book" | "flag_review" | "alert_user";
  
  if (isNewSupplier || isHighAmount || requiresReview) {
    action = "alert_user";
  } else if (overallConfidence >= env.CONFIDENCE_AUTO_THRESHOLD) {
    action = "auto_book";
  } else if (overallConfidence >= env.CONFIDENCE_REVIEW_THRESHOLD) {
    action = "flag_review";
  } else {
    action = "alert_user";
  }

  return {
    currentNode: "confidenceGate",
    overallConfidence,
    action,
  };
}
