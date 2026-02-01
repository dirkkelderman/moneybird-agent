/**
 * WhatsApp notification service
 * 
 * Sends WhatsApp notifications via Twilio or WhatsApp Business API
 */

import type { WhatsAppConfig, DailySummary, WorkflowSummary } from "./types.js";
import { getEnv } from "../config/env.js";

let whatsappConfig: WhatsAppConfig | null = null;

/**
 * Initialize WhatsApp configuration from environment
 */
export function initializeWhatsApp(): WhatsAppConfig | null {
  const env = getEnv();
  
  if (!env.WHATSAPP_ENABLED || env.WHATSAPP_ENABLED !== "true") {
    return null;
  }

  const provider = env.WHATSAPP_PROVIDER || "twilio";

  if (provider === "twilio") {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_WHATSAPP_FROM || !env.WHATSAPP_TO) {
      console.log(JSON.stringify({
        level: "warn",
        event: "whatsapp_config_incomplete",
        message: "WhatsApp enabled but Twilio configuration incomplete. WhatsApp notifications will be disabled.",
        timestamp: new Date().toISOString(),
      }));
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
  } else if (provider === "whatsapp-business-api") {
    // WhatsApp Business API implementation would go here
    console.log(JSON.stringify({
      level: "warn",
      event: "whatsapp_business_api_not_implemented",
      message: "WhatsApp Business API not yet implemented",
      timestamp: new Date().toISOString(),
    }));
    return null;
  }

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
⚠️ *Errors & Warnings:* ${summary.errors.length}
${summary.errors.slice(0, 5).map((e) => `• ${e.event} (${e.count}x): ${e.message}${e.requiresHumanIntervention ? " 🔴" : ""}`).join("\n")}
${summary.errors.length > 5 ? `... and ${summary.errors.length - 5} more` : ""}
` : ""}

${summary.actions.length > 0 ? `
✅ *Actions Taken:*
${summary.actions.map((a) => `• ${a.type.replace(/_/g, " ")}: ${a.count}`).join("\n")}
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
  const message = `🚨 *Moneybird Agent Error Alert*

*Invoice Processing Failed*
• Invoice ID: ${workflowSummary.invoiceId}
• Status: ${workflowSummary.status}
• Action: ${workflowSummary.action}
${workflowSummary.confidence ? `• Confidence: ${workflowSummary.confidence}%` : ""}

*Error Details:*
${errorDetails.substring(0, 500)}${errorDetails.length > 500 ? "..." : ""}

${workflowSummary.requiresHumanIntervention ? `
🔴 *Human Intervention Required*
Please review the invoice in Moneybird.
` : ""}`;

  await sendWhatsApp(message);
}
