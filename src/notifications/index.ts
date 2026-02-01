/**
 * Notification service
 * 
 * Centralized notification system for errors, summaries, and alerts
 */

import type { DailySummary, WorkflowSummary } from "./types.js";
import { sendEmail, sendDailySummary as sendEmailSummary, sendErrorAlert as sendEmailError } from "./email.js";
import { sendWhatsApp, sendDailySummaryWhatsApp, sendErrorAlertWhatsApp } from "./whatsapp.js";
import { getEnv } from "../config/env.js";

/**
 * Send daily summary via all enabled channels
 */
export async function sendDailySummary(summary: DailySummary): Promise<void> {
  const env = getEnv();
  
  if (env.NOTIFICATIONS_ENABLED !== "true") {
    return;
  }

  const promises: Promise<void>[] = [];

  // Email
  if (env.EMAIL_ENABLED === "true") {
    promises.push(sendEmailSummary(summary).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "daily_summary_email_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
    }));
  }

  // WhatsApp
  if (env.WHATSAPP_ENABLED === "true") {
    promises.push(sendDailySummaryWhatsApp(summary).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "daily_summary_whatsapp_failed",
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
  
  if (env.NOTIFICATIONS_ENABLED !== "true") {
    return;
  }

  const promises: Promise<void>[] = [];

  // Email
  if (env.EMAIL_ENABLED === "true") {
    promises.push(sendEmailError(workflowSummary, errorDetails).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "error_alert_email_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
    }));
  }

  // WhatsApp
  if (env.WHATSAPP_ENABLED === "true") {
    promises.push(sendErrorAlertWhatsApp(workflowSummary, errorDetails).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "error_alert_whatsapp_failed",
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
  
  if (env.NOTIFICATIONS_ENABLED !== "true") {
    return;
  }

  const promises: Promise<void>[] = [];

  // Email
  if (env.EMAIL_ENABLED === "true" && htmlMessage) {
    promises.push(sendEmail(subject, htmlMessage, message).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "notification_email_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
    }));
  }

  // WhatsApp
  if (env.WHATSAPP_ENABLED === "true") {
    promises.push(sendWhatsApp(`${subject}\n\n${message}`).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "notification_whatsapp_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
    }));
  }

  await Promise.allSettled(promises);
}
