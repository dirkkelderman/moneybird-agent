/**
 * Human-friendly wording for notifications
 *
 * Single place that translates the agent's internal codes (reason slugs,
 * action enums, event types, raw error messages) into language a person
 * reading an alert on their phone actually understands. Internal codes
 * stay in the structured logs; notifications go through this module.
 */

/** Review reason slugs (from the alert node) → plain language */
const REVIEW_REASON_LABELS: Record<string, string> = {
  new_supplier: "First invoice from this supplier",
  contact_match_low_confidence: "Not sure this is the right contact",
  validation_issue: "The amounts on the invoice don't add up",
  kostenpost_classification_uncertain: "Not sure which kostenpost (expense category) fits",
  transaction_match_uncertain: "Couldn't confidently match a bank payment",
};

export function humanizeReasons(reasons: string[]): string[] {
  return reasons.map((reason) => REVIEW_REASON_LABELS[reason] ?? reason.replace(/_/g, " "));
}

/** Workflow action enum → what it means for the reader */
export function humanizeAction(action: string | undefined): string {
  switch (action) {
    case "auto_book":
      return "Booked automatically (as draft)";
    case "flag_review":
      return "Flagged for your review";
    case "alert_user":
      return "Waiting for you";
    default:
      return action ? action.replace(/_/g, " ") : "Unknown";
  }
}

/** Workflow status → plain language */
export function humanizeStatus(status: string): string {
  switch (status) {
    case "error":
      return "Something went wrong";
    case "review_required":
      return "Needs your review";
    case "success":
      return "Processed successfully";
    default:
      return status.replace(/_/g, " ");
  }
}

/** Daily-summary action types → section labels */
export function humanizeActionType(type: string): string {
  switch (type) {
    case "contact_created":
      return "New suppliers added";
    case "auto_booked":
      return "Invoices booked automatically";
    case "invoice_updated":
      return "Invoices filled in from their PDF";
    case "invoice_created":
      return "Invoices created";
    case "invoice_deleted":
      return "Invoices replaced";
    default:
      return type.replace(/_/g, " ");
  }
}

/**
 * A short, human label for an invoice: supplier and amount first,
 * falling back to reference and only then the raw ID.
 */
export function formatInvoiceLabel(params: {
  supplierName?: string;
  amountInclTaxCents?: number;
  reference?: string;
  invoiceId?: string;
}): string {
  const amount =
    params.amountInclTaxCents !== undefined
      ? `€${(params.amountInclTaxCents / 100).toFixed(2)}`
      : undefined;

  if (params.supplierName) {
    return [params.supplierName, amount].filter(Boolean).join(" — ");
  }
  if (params.reference) {
    return [`Invoice ${params.reference}`, amount].filter(Boolean).join(" — ");
  }
  return [`Invoice ${params.invoiceId ?? "unknown"}`, amount].filter(Boolean).join(" — ");
}

/**
 * Translate a raw error message into something actionable. The original
 * message is preserved as `detail` for anyone who wants the specifics.
 */
export function humanizeError(message: string): { summary: string; detail: string } {
  const lower = message.toLowerCase();

  let summary: string;
  if (lower.includes("no supplier name")) {
    summary = "Couldn't work out who sent this invoice — it may need a quick look in Moneybird.";
  } else if (lower.includes("422") && (lower.includes("new") || lower.includes("update"))) {
    summary =
      "Moneybird won't let the agent edit this invoice yet (it's still in 'new' status). Open it in Moneybird once and convert it to a draft — the agent picks it up on the next run.";
  } else if (lower.includes("mcp tools not available") || lower.includes("mcp client not initialized")) {
    summary = "The connection to Moneybird isn't working. If this keeps happening, check the MCP token in the agent's settings.";
  } else if (lower.includes("no pdf") || lower.includes("attachment")) {
    summary = "The invoice has no readable PDF attached, so its details couldn't be extracted.";
  } else if (lower.includes("openai") || lower.includes("quota") || lower.includes("rate limit")) {
    summary = "The AI service was temporarily unavailable — the invoice will be retried on the next run.";
  } else if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("fetch failed") || lower.includes("network")) {
    summary = "A network hiccup interrupted processing — the invoice will be retried on the next run.";
  } else if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("403")) {
    summary = "Moneybird rejected the agent's credentials — the access token probably needs to be renewed.";
  } else {
    summary = "Something unexpected went wrong while processing this invoice.";
  }

  return { summary, detail: message };
}
