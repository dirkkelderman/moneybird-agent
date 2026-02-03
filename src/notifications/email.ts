/**
 * Email notification service
 * 
 * Sends email notifications for errors, daily summaries, and alerts
 */

import type { EmailConfig, DailySummary, WorkflowSummary } from "./types.js";
import { getEnv } from "../config/env.js";

let emailConfig: EmailConfig | null = null;

/**
 * Initialize email configuration from environment
 */
export function initializeEmail(): EmailConfig | null {
  const env = getEnv();
  
  // Email is enabled if all required fields are present
  if (!env.EMAIL_SMTP_HOST || !env.EMAIL_SMTP_USER || !env.EMAIL_SMTP_PASS || !env.EMAIL_TO) {
    console.log(JSON.stringify({
      level: "warn",
      event: "email_config_incomplete",
      message: "Email enabled but configuration incomplete. Email notifications will be disabled.",
      timestamp: new Date().toISOString(),
    }));
    return null;
  }

  emailConfig = {
    enabled: true,
    smtp: {
      host: env.EMAIL_SMTP_HOST,
      port: env.EMAIL_SMTP_PORT || 587,
      secure: env.EMAIL_SMTP_PORT === 465, // Standard secure port
      auth: {
        user: env.EMAIL_SMTP_USER,
        pass: env.EMAIL_SMTP_PASS,
      },
    },
    from: env.EMAIL_SMTP_USER, // Use SMTP user as from address
    to: env.EMAIL_TO.split(",").map((email) => email.trim()),
  };

  return emailConfig;
}

/**
 * Send email notification
 */
export async function sendEmail(
  subject: string,
  htmlBody: string,
  textBody?: string
): Promise<void> {
  if (!emailConfig) {
    emailConfig = initializeEmail();
  }

  if (!emailConfig || !emailConfig.enabled) {
    return;
  }

  try {
    // Dynamic import to avoid requiring nodemailer at build time if not configured
    const nodemailer = await import("nodemailer");
    
    const transporter = nodemailer.createTransport({
      host: emailConfig.smtp.host,
      port: emailConfig.smtp.port,
      secure: emailConfig.smtp.secure,
      auth: emailConfig.smtp.auth,
    });

    await transporter.sendMail({
      from: emailConfig.from,
      to: emailConfig.to.join(", "),
      subject,
      text: textBody || htmlBody.replace(/<[^>]*>/g, ""), // Strip HTML for text version
      html: htmlBody,
    });

    console.log(JSON.stringify({
      level: "info",
      event: "email_sent",
      subject,
      recipients: emailConfig.to.length,
      timestamp: new Date().toISOString(),
    }));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "email_send_failed",
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));
    throw error;
  }
}

/**
 * Send daily summary email
 */
export async function sendDailySummary(summary: DailySummary): Promise<void> {
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .stat { background-color: #f4f4f4; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .error { background-color: #ffebee; border-left: 4px solid #f44336; padding: 10px; margin: 10px 0; }
        .warning { background-color: #fff3e0; border-left: 4px solid #ff9800; padding: 10px; margin: 10px 0; }
        .success { background-color: #e8f5e9; border-left: 4px solid #4CAF50; padding: 10px; margin: 10px 0; }
        .action { background-color: #e3f2fd; border-left: 4px solid #2196F3; padding: 10px; margin: 10px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #4CAF50; color: white; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>📊 Moneybird Agent Daily Summary</h1>
        <p>${summary.date}</p>
      </div>
      <div class="content">
        <h2>📈 Statistics</h2>
        <div class="stat">
          <strong>Invoices Processed:</strong> ${summary.invoicesProcessed}
        </div>
        <div class="stat">
          <strong>Auto-Booked:</strong> ${summary.invoicesAutoBooked}
        </div>
        <div class="stat">
          <strong>Requiring Review:</strong> ${summary.invoicesRequiringReview}
        </div>

        ${summary.errors.length > 0 ? `
          <h2>⚠️ Errors & Warnings</h2>
          ${summary.errors.map((error) => `
            <div class="${error.level === "error" ? "error" : "warning"}">
              <strong>${error.event}</strong> (${error.count}x)<br>
              ${error.message}<br>
              <small>First: ${error.firstOccurred} | Last: ${error.lastOccurred}</small>
              ${error.requiresHumanIntervention ? '<br><strong style="color: #f44336;">🔴 Requires Human Intervention</strong>' : ""}
            </div>
          `).join("")}
        ` : ""}

        ${summary.actions.length > 0 ? `
          <h2>✅ Actions Taken</h2>
          ${summary.actions.map((action) => `
            <div class="action">
              <strong>${action.type.replace(/_/g, " ").toUpperCase()}:</strong> ${action.count}
              ${action.details && action.details.length > 0 ? `<br><small>${action.details.slice(0, 5).join(", ")}${action.details.length > 5 ? ` ... and ${action.details.length - 5} more` : ""}</small>` : ""}
            </div>
          `).join("")}
        ` : ""}

        ${summary.unmatchedTransactions.length > 0 ? `
          <h2>💳 Unmatched Bank Transactions</h2>
          <div class="warning">
            <p><strong>${summary.unmatchedTransactions.length} bank transaction(s) without matching invoices</strong></p>
            <p>These transactions may need invoices to be created or matched manually.</p>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Days Unmatched</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                ${summary.unmatchedTransactions.slice(0, 20).map((t) => `
                  <tr>
                    <td>${t.date}</td>
                    <td>€${(Math.abs(t.amount) / 100).toFixed(2)}</td>
                    <td>${t.daysUnmatched}</td>
                    <td>${t.description ? t.description.substring(0, 50) + (t.description.length > 50 ? "..." : "") : "N/A"}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
            ${summary.unmatchedTransactions.length > 20 ? `<p><em>... and ${summary.unmatchedTransactions.length - 20} more transactions</em></p>` : ""}
          </div>
        ` : ""}

        ${summary.errors.filter((e) => e.requiresHumanIntervention).length > 0 ? `
          <div class="error">
            <h3>🔴 Action Required</h3>
            <p>There are ${summary.errors.filter((e) => e.requiresHumanIntervention).length} issue(s) that require your attention.</p>
            <p>Please check the Moneybird dashboard and review the flagged invoices.</p>
          </div>
        ` : ""}
      </div>
      <div class="footer">
        <p>Moneybird Agent v0.1.0 | Automated Bookkeeping System</p>
      </div>
    </body>
    </html>
  `;

  const subject = `Moneybird Agent Daily Summary - ${summary.date}${summary.errors.filter((e) => e.requiresHumanIntervention).length > 0 ? " ⚠️ Action Required" : ""}`;

  await sendEmail(subject, htmlBody);
}

/**
 * Send error alert email
 */
export async function sendErrorAlert(
  workflowSummary: WorkflowSummary,
  errorDetails: string
): Promise<void> {
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .header { background-color: #f44336; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .error { background-color: #ffebee; border-left: 4px solid #f44336; padding: 15px; margin: 10px 0; }
        .info { background-color: #e3f2fd; border-left: 4px solid #2196F3; padding: 15px; margin: 10px 0; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🚨 Moneybird Agent Error Alert</h1>
      </div>
      <div class="content">
        <div class="error">
          <h2>Invoice Processing Failed</h2>
          <p><strong>Invoice ID:</strong> ${workflowSummary.invoiceId}</p>
          <p><strong>Status:</strong> ${workflowSummary.status}</p>
          <p><strong>Action:</strong> ${workflowSummary.action}</p>
          ${workflowSummary.confidence ? `<p><strong>Confidence:</strong> ${workflowSummary.confidence}%</p>` : ""}
        </div>

        <div class="info">
          <h3>Error Details</h3>
          <pre style="white-space: pre-wrap; word-wrap: break-word;">${errorDetails}</pre>
        </div>

        ${workflowSummary.requiresHumanIntervention ? `
          <div class="error">
            <h3>🔴 Human Intervention Required</h3>
            <p>This error requires manual attention. Please review the invoice in Moneybird and take appropriate action.</p>
          </div>
        ` : ""}

        ${workflowSummary.errors && workflowSummary.errors.length > 0 ? `
          <div class="info">
            <h3>Related Errors</h3>
            <ul>
              ${workflowSummary.errors.map((err) => `<li>${err}</li>`).join("")}
            </ul>
          </div>
        ` : ""}
      </div>
    </body>
    </html>
  `;

  const subject = `🚨 Moneybird Agent Error - Invoice ${workflowSummary.invoiceId}${workflowSummary.requiresHumanIntervention ? " - Action Required" : ""}`;

  await sendEmail(subject, htmlBody);
}
