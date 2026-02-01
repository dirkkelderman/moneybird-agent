/**
 * Notification service
 * 
 * Centralized notification system for errors, summaries, and alerts
 */

import type { DailySummary, WorkflowSummary } from "./types.js";
import { sendEmail, sendDailySummary as sendEmailSummary, sendErrorAlert as sendEmailError } from "./email.js";
import { sendWhatsApp, sendDailySummaryWhatsApp, sendErrorAlertWhatsApp } from "./whatsapp.js";
import { sendTelegram, sendDailySummaryTelegram, sendErrorAlertTelegram } from "./telegram.js";
import { getEnv } from "../config/env.js";

/**
 * Send daily summary via all enabled channels
 */
export async function sendDailySummary(summary: DailySummary): Promise<void> {
  const env = getEnv();
  const promises: Promise<void>[] = [];

  // Email (auto-detected if configured)
  if (env.EMAIL_SMTP_HOST && env.EMAIL_SMTP_USER && env.EMAIL_TO) {
    promises.push(sendEmailSummary(summary).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "daily_summary_email_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
    }));
  }

  // WhatsApp (auto-detected if configured)
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.WHATSAPP_TO) {
    promises.push(sendDailySummaryWhatsApp(summary).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "daily_summary_whatsapp_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
    }));
  }

  // Telegram (auto-detected if configured)
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_IDS) {
    promises.push(sendDailySummaryTelegram(summary).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "daily_summary_telegram_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
    }));
  }

  await Promise.allSettled(promises);
}

/**
 * Send error alert via all enabled channels
 */
export async function sendErrorAlert(
  workflowSummary: WorkflowSummary,
  errorDetails: string
): Promise<void> {
  const env = getEnv();
  const promises: Promise<void>[] = [];

  // Email (auto-detected if configured)
  if (env.EMAIL_SMTP_HOST && env.EMAIL_SMTP_USER && env.EMAIL_TO) {
    promises.push(sendEmailError(workflowSummary, errorDetails).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "error_alert_email_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
    }));
  }

  // WhatsApp (auto-detected if configured)
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.WHATSAPP_TO) {
    promises.push(sendErrorAlertWhatsApp(workflowSummary, errorDetails).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "error_alert_whatsapp_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
    }));
  }

  // Telegram (auto-detected if configured)
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_IDS) {
    promises.push(sendErrorAlertTelegram(workflowSummary, errorDetails).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "error_alert_telegram_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
    }));
  }

  await Promise.allSettled(promises);
}

/**
 * Send custom notification
 */
export async function sendNotification(
  subject: string,
  message: string,
  htmlMessage?: string
): Promise<void> {
  const env = getEnv();
  const promises: Promise<void>[] = [];

  // Email (auto-detected if configured)
  if (env.EMAIL_SMTP_HOST && env.EMAIL_SMTP_USER && env.EMAIL_TO && htmlMessage) {
    promises.push(sendEmail(subject, htmlMessage, message).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "notification_email_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
    }));
  }

  // WhatsApp (auto-detected if configured)
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.WHATSAPP_TO) {
    promises.push(sendWhatsApp(`${subject}\n\n${message}`).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "notification_whatsapp_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
    }));
  }

  // Telegram (auto-detected if configured)
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_IDS) {
    promises.push(sendTelegram(`<b>${subject}</b>\n\n${message}`).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "notification_telegram_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
    }));
  }

  await Promise.allSettled(promises);
}
