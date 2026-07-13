/**
 * WhatsApp notification service
 * 
 * Sends WhatsApp notifications via Twilio or WhatsApp Business API
 */

import type { WhatsAppConfig, DailySummary, WorkflowSummary } from "./types.js";
import { getEnv } from "../config/env.js";
import { humanizeStatus, humanizeAction, humanizeActionType, humanizeError, formatInvoiceLabel } from "./humanize.js";

let whatsappConfig: WhatsAppConfig | null = null;

/**
 * Initialize WhatsApp configuration from environment
 */
export function initializeWhatsApp(): WhatsAppConfig | null {
  const env = getEnv();
  
  // WhatsApp is enabled if all required Twilio fields are present
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM || !env.WHATSAPP_TO) {
    return null;
  }

  whatsappConfig = {
    enabled: true,
    provider: "twilio",
    twilio: {
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      from: env.TWILIO_WHATSAPP_FROM,
    },
    to: env.WHATSAPP_TO.split(",").map((num) => num.trim()),
  };
  
  return whatsappConfig;
}

/**
 * Send WhatsApp message via Twilio
 */
export async function sendWhatsApp(
  message: string
): Promise<void> {
  if (!whatsappConfig) {
    whatsappConfig = initializeWhatsApp();
  }

  if (!whatsappConfig || !whatsappConfig.enabled) {
    return;
  }

  if (whatsappConfig.provider === "twilio" && whatsappConfig.twilio) {
    try {
      // Dynamic import to avoid requiring twilio at build time if not configured
      const twilio = await import("twilio");
      
      const client = twilio.default(
        whatsappConfig.twilio.accountSid,
        whatsappConfig.twilio.authToken
      );

      // Send to all recipients
      const twilioConfig = whatsappConfig.twilio!;
      const promises = whatsappConfig.to.map((to) =>
        client.messages.create({
          from: `whatsapp:${twilioConfig.from}`,
          to: `whatsapp:${to}`,
          body: message,
        })
      );

      await Promise.all(promises);

      console.log(JSON.stringify({
        level: "info",
        event: "whatsapp_sent",
        recipients: whatsappConfig.to.length,
        timestamp: new Date().toISOString(),
      }));
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "whatsapp_send_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
      throw error;
    }
  }
}

/**
 * Send daily summary via WhatsApp
 */
export async function sendDailySummaryWhatsApp(summary: DailySummary): Promise<void> {
  const message = `📊 *Moneybird Agent Daily Summary* - ${summary.date}

📈 *Statistics:*
• Invoices Processed: ${summary.invoicesProcessed}
• Auto-Booked: ${summary.invoicesAutoBooked}
• Requiring Review: ${summary.invoicesRequiringReview}

${summary.errors.length > 0 ? `
⚠️ *Needs attention:* ${summary.errors.length}
${summary.errors.slice(0, 5).map((e) => `• ${humanizeError(e.message).summary}${e.count > 1 ? ` (${e.count}×)` : ""}${e.requiresHumanIntervention ? " 🔴" : ""}`).join("\n")}
${summary.errors.length > 5 ? `... and ${summary.errors.length - 5} more` : ""}
` : ""}

${summary.actions.length > 0 ? `
✅ *What the agent did:*
${summary.actions.map((a) => `• ${humanizeActionType(a.type)}: ${a.count}`).join("\n")}
` : ""}

${summary.unmatchedTransactions.length > 0 ? `
💳 *Unmatched Transactions:* ${summary.unmatchedTransactions.length}
${summary.unmatchedTransactions.slice(0, 5).map((t) => `• €${(Math.abs(t.amount) / 100).toFixed(2)} on ${t.date} (${t.daysUnmatched}d ago)${t.description ? `\n  ${t.description.substring(0, 40)}${t.description.length > 40 ? "..." : ""}` : ""}`).join("\n")}
${summary.unmatchedTransactions.length > 5 ? `... and ${summary.unmatchedTransactions.length - 5} more` : ""}
` : ""}

${summary.overdueInvoices.length > 0 ? `
💸 *Overdue Invoices:* ${summary.overdueInvoices.length} (€${summary.totalOutstanding.toFixed(2)} outstanding)
${summary.overdueInvoices.slice(0, 5).map((inv) => `• ${inv.contactName || inv.invoiceNumber || inv.id}: €${inv.amount.toFixed(2)} (${inv.daysOverdue}d overdue)`).join("\n")}
${summary.overdueInvoices.length > 5 ? `... and ${summary.overdueInvoices.length - 5} more` : ""}
` : ""}

${summary.pendingReviews > 0 ? `
⏳ *Awaiting your review:* ${summary.pendingReviews} invoice(s)
` : ""}

${summary.learnings.length > 0 ? `
📚 *Learned this week:*
${summary.learnings.slice(0, 5).map((l) => `• ${l}`).join("\n")}
${summary.learnings.length > 5 ? `... and ${summary.learnings.length - 5} more` : ""}
` : ""}

${summary.correctionRate.autoBooked > 0 ? `
🎯 Accuracy (30d): ${summary.correctionRate.corrections} correction(s) on ${summary.correctionRate.autoBooked} auto-booked
` : ""}

${summary.dataMayBeIncomplete ? `
⚠️ Some lists hit the pagination cap and may be incomplete.
` : ""}

${summary.errors.filter((e) => e.requiresHumanIntervention).length > 0 ? `
🔴 *Action Required:* ${summary.errors.filter((e) => e.requiresHumanIntervention).length} issue(s) need your attention.
` : ""}`;

  await sendWhatsApp(message);
}

/**
 * Send error alert via WhatsApp
 */
export async function sendErrorAlertWhatsApp(
  workflowSummary: WorkflowSummary,
  errorDetails: string
): Promise<void> {
  const message = `${workflowSummary.status === "error" ? "🚨" : "👀"} *${humanizeStatus(workflowSummary.status)}*

🧾 ${formatInvoiceLabel({
    supplierName: workflowSummary.supplierName,
    amountInclTaxCents: workflowSummary.amountInclTaxCents,
    reference: workflowSummary.reference,
    invoiceId: workflowSummary.invoiceId,
  })}
• Status: ${humanizeAction(workflowSummary.action)}
${workflowSummary.confidence !== undefined ? `• How sure the agent was: ${Math.round(workflowSummary.confidence)}%` : ""}

${errorDetails.substring(0, 500)}${errorDetails.length > 500 ? "..." : ""}

_Invoice ID for reference: ${workflowSummary.invoiceId}_`;

  await sendWhatsApp(message);
}
