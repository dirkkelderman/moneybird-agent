/**
 * Telegram notification service
 * 
 * Sends Telegram notifications via Bot API
 */

import type { TelegramConfig, DailySummary, WorkflowSummary } from "./types.js";
import { getEnv } from "../config/env.js";

let telegramConfig: TelegramConfig | null = null;

/**
 * Initialize Telegram configuration from environment
 */
export function initializeTelegram(): TelegramConfig | null {
  const env = getEnv();
  
  // Telegram is enabled if bot token and chat IDs are present
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_IDS) {
    return null;
  }

  telegramConfig = {
    enabled: true,
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatIds: env.TELEGRAM_CHAT_IDS.split(",").map((id) => id.trim()),
  };
  
  return telegramConfig;
}

/**
 * Send Telegram message
 */
export async function sendTelegram(
  message: string
): Promise<void> {
  if (!telegramConfig) {
    telegramConfig = initializeTelegram();
  }

  if (!telegramConfig || !telegramConfig.enabled) {
    return;
  }

  const apiUrl = `https://api.telegram.org/bot${telegramConfig.botToken}/sendMessage`;

  // Send to all configured chat IDs
  const promises = telegramConfig.chatIds.map(async (chatId) => {
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML", // Support basic HTML formatting
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ description: "Unknown error" }));
        const errorMsg = error.description || response.statusText;
        
        // Provide helpful error messages
        if (errorMsg.includes("chat not found")) {
          throw new Error(`Telegram API error: Chat not found. Make sure:\n1. You've sent /start to the bot first\n2. The chat ID is correct\n3. If it's a group, the bot is added to the group`);
        }
        
        throw new Error(`Telegram API error: ${errorMsg}`);
      }

      console.log(JSON.stringify({
        level: "info",
        event: "telegram_sent",
        chat_id: chatId,
        timestamp: new Date().toISOString(),
      }));
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "telegram_send_failed",
        chat_id: chatId,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
      throw error;
    }
  });

  await Promise.all(promises);
}

/**
 * Send daily summary via Telegram
 */
export async function sendDailySummaryTelegram(summary: DailySummary): Promise<void> {
  const message = `
📊 <b>Daily Summary - ${summary.date}</b>

✅ Processed: ${summary.invoicesProcessed}
🤖 Auto-booked: ${summary.invoicesAutoBooked}
👤 Review required: ${summary.invoicesRequiringReview}

${summary.errors.length > 0 ? `\n⚠️ <b>Errors:</b>\n${summary.errors.map(e => `• ${e.message} (${e.count}x)`).join("\n")}` : ""}

${summary.actions.length > 0 ? `\n📝 <b>Actions:</b>\n${summary.actions.map(a => `• ${a.type}: ${a.count}`).join("\n")}` : ""}
  `.trim();

  await sendTelegram(message);
}

/**
 * Send error alert via Telegram
 */
export async function sendErrorAlertTelegram(
  workflowSummary: WorkflowSummary,
  errorDetails: string
): Promise<void> {
  const emoji = workflowSummary.requiresHumanIntervention ? "🚨" : "⚠️";
  const message = `
${emoji} <b>Moneybird Agent Alert</b>

Invoice: ${workflowSummary.invoiceId}
Status: ${workflowSummary.status}
Action: ${workflowSummary.action}
${workflowSummary.confidence !== undefined ? `Confidence: ${workflowSummary.confidence}%` : ""}

${workflowSummary.errors && workflowSummary.errors.length > 0 ? `\n<b>Errors:</b>\n${workflowSummary.errors.map(e => `• ${e}`).join("\n")}` : ""}

<b>Details:</b>
${errorDetails}
  `.trim();

  await sendTelegram(message);
}
