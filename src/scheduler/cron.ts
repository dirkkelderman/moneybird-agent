/**
 * Scheduler / Cron
 * 
 * Handles periodic execution of the agent workflow and daily summaries.
 * Runs on a configurable schedule (default: hourly).
 */

import * as cron from "node-cron";
import type { ScheduledTask } from "node-cron";
import { getEnv } from "../config/env.js";
import { createAgentGraph } from "../agent/graph.js";
import { createInitialState } from "../agent/state.js";
import { matchSalesInvoicePayments } from "../agent/salesPaymentMatcher.js";
import { sendBTWQuarterlyReminder } from "../agent/btwReminder.js";
import { sendMonthlyReport } from "../agent/monthlyReport.js";

let workflowTask: ScheduledTask | null = null;
let dailySummaryTask: ScheduledTask | null = null;
let btwReminderTask: ScheduledTask | null = null;
let monthlyReportTask: ScheduledTask | null = null;

/**
 * Start the scheduler
 */
export function startScheduler(): void {
  const env = getEnv();
  
  // Start workflow scheduler
  const workflowSchedule = env.CRON_SCHEDULE;
  
  console.log(JSON.stringify({
    level: "info",
    event: "scheduler_started",
    workflow_schedule: workflowSchedule,
    daily_summary_time: env.DAILY_SUMMARY_TIME,
    timestamp: new Date().toISOString(),
  }));

  // Schedule workflow execution using cron
  if (cron.validate(workflowSchedule)) {
    workflowTask = cron.schedule(workflowSchedule, async () => {
      await runAgentWorkflow();
    }, {
      timezone: "UTC",
    });
    
    // Run immediately on start
    runAgentWorkflow().catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "scheduler_initial_run_failed",
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      }));
    });
  } else {
    console.error(JSON.stringify({
      level: "error",
      event: "invalid_cron_schedule",
      schedule: workflowSchedule,
      timestamp: new Date().toISOString(),
    }));
  }

  // Schedule daily summary
  // Parse time string (HH:MM) and convert to cron format
  const [hours, minutes] = env.DAILY_SUMMARY_TIME.split(":").map(Number);
  if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
    const dailySummaryCron = `${minutes} ${hours} * * *`; // Every day at specified time
    
    dailySummaryTask = cron.schedule(dailySummaryCron, async () => {
      await sendDailySummary();
    }, {
      timezone: "UTC",
    });
    
    console.log(JSON.stringify({
      level: "info",
      event: "daily_summary_scheduled",
      time: env.DAILY_SUMMARY_TIME,
      cron: dailySummaryCron,
      timezone: "UTC",
      note: "Amsterdam is UTC+1 (winter) or UTC+2 (summer). Adjust DAILY_SUMMARY_TIME accordingly.",
      timestamp: new Date().toISOString(),
    }));
  } else {
    console.error(JSON.stringify({
      level: "error",
      event: "invalid_daily_summary_time",
      time: env.DAILY_SUMMARY_TIME,
      timestamp: new Date().toISOString(),
    }));
  }

  // Schedule monthly financial report on the 1st of each month, one hour
  // after the daily summary time so both don't fire at once.
  if (env.MONTHLY_REPORT_ENABLED) {
    const [summaryHours, summaryMinutes] = env.DAILY_SUMMARY_TIME.split(":").map(Number);
    if (summaryHours >= 0 && summaryHours < 24 && summaryMinutes >= 0 && summaryMinutes < 60) {
      const monthlyReportCron = `${summaryMinutes} ${(summaryHours + 1) % 24} 1 * *`;
      monthlyReportTask = cron.schedule(monthlyReportCron, async () => {
        await sendMonthlyReport();
      }, {
        timezone: "UTC",
      });

      console.log(JSON.stringify({
        level: "info",
        event: "monthly_report_scheduled",
        cron: monthlyReportCron,
        timezone: "UTC",
        timestamp: new Date().toISOString(),
      }));
    }
  }

  // Schedule quarterly BTW preparation reminder
  // Runs on the 1st of Jan/Apr/Jul/Oct at 07:00 UTC: the previous quarter has
  // just closed and the Dutch BTW filing is due before the end of that month.
  if (env.BTW_REMINDER_ENABLED) {
    btwReminderTask = cron.schedule("0 7 1 1,4,7,10 *", async () => {
      await sendBTWQuarterlyReminder();
    }, {
      timezone: "UTC",
    });

    console.log(JSON.stringify({
      level: "info",
      event: "btw_reminder_scheduled",
      cron: "0 7 1 1,4,7,10 *",
      timezone: "UTC",
      timestamp: new Date().toISOString(),
    }));
  }
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (workflowTask) {
    workflowTask.stop();
    workflowTask = null;
  }
  
  if (dailySummaryTask) {
    dailySummaryTask.stop();
    dailySummaryTask = null;
  }

  if (btwReminderTask) {
    btwReminderTask.stop();
    btwReminderTask = null;
  }

  if (monthlyReportTask) {
    monthlyReportTask.stop();
    monthlyReportTask = null;
  }

  console.log(JSON.stringify({
    level: "info",
    event: "scheduler_stopped",
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Run the agent graph for a single invoice.
 * Returns the merged final state so the caller can see whether an invoice
 * was actually picked up.
 */
async function runSingleInvoice(): Promise<Record<string, any>> {
  const graph = createAgentGraph();
  const initialState = createInitialState();

  // Stream yields updates keyed by node name ({ nodeName: partialState });
  // merge them to reconstruct the final state.
  const stream = await graph.stream(initialState);
  const state: Record<string, any> = {};

  for await (const stateUpdate of stream) {
    for (const nodeState of Object.values(stateUpdate as Record<string, any>)) {
      if (nodeState && typeof nodeState === "object") {
        Object.assign(state, nodeState);
      }
    }
  }

  return state;
}

/**
 * Run the agent workflow once
 *
 * Processes up to MAX_INVOICES_PER_RUN invoices per run. Each graph
 * invocation handles one invoice; keep invoking until the queue is empty
 * so a batch of incoming invoices doesn't take a full day to clear.
 */
async function runAgentWorkflow(): Promise<void> {
  const env = getEnv();

  console.log(JSON.stringify({
    level: "info",
    event: "workflow_started",
    max_invoices_per_run: env.MAX_INVOICES_PER_RUN,
    timestamp: new Date().toISOString(),
  }));

  try {
    let processedCount = 0;
    let lastInvoiceId: string | undefined;

    for (let i = 0; i < env.MAX_INVOICES_PER_RUN; i++) {
      const state = await runSingleInvoice();

      // No invoice picked up means the queue is empty
      if (!state.invoice) {
        break;
      }

      // Same invoice twice in a row means it never got marked as processed
      // (e.g. the alert node failed); stop to avoid a tight retry loop.
      if (state.invoice.id && state.invoice.id === lastInvoiceId) {
        console.log(JSON.stringify({
          level: "warn",
          event: "workflow_stuck_on_invoice",
          invoice_id: state.invoice.id,
          timestamp: new Date().toISOString(),
        }));
        break;
      }
      lastInvoiceId = state.invoice.id;

      processedCount++;

      console.log(JSON.stringify({
        level: "info",
        event: "invoice_workflow_completed",
        invoice_id: state.invoice?.id,
        action: state.action,
        confidence: state.overallConfidence,
        current_node: state.currentNode,
        has_error: !!state.error,
        timestamp: new Date().toISOString(),
      }));

      // If the run errored before the invoice was marked as processed, stop
      // looping: detectNewInvoices would pick the same invoice again.
      if (state.error && state.currentNode !== "alert" && state.currentNode !== "autoBook") {
        break;
      }
    }

    console.log(JSON.stringify({
      level: "info",
      event: "workflow_completed",
      invoices_processed: processedCount,
      timestamp: new Date().toISOString(),
    }));

    // After processing purchase invoices, run the sales-invoice
    // payment matcher. This is independent of the LangGraph flow.
    await matchSalesInvoicePayments();
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "workflow_failed",
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    }));
  }
}

/**
 * Manually trigger workflow (for testing)
 */
export async function triggerWorkflow(): Promise<void> {
  await runAgentWorkflow();
}

/**
 * Manually trigger the quarterly BTW reminder (for testing)
 */
export async function triggerBTWReminder(): Promise<void> {
  await sendBTWQuarterlyReminder();
}

/**
 * Manually trigger the monthly financial report (for testing)
 */
export async function triggerMonthlyReport(): Promise<void> {
  await sendMonthlyReport();
}

/**
 * Send daily summary (called by scheduler at end of day)
 */
export async function sendDailySummary(): Promise<void> {
  try {
    const { generateDailySummary } = await import("../notifications/summary.js");
    const { sendDailySummary: sendSummary } = await import("../notifications/index.js");
    
    const summary = await generateDailySummary();
    await sendSummary(summary);
    
    console.log(JSON.stringify({
      level: "info",
      event: "daily_summary_sent",
      date: summary.date,
      invoices_processed: summary.invoicesProcessed,
      timestamp: new Date().toISOString(),
    }));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "daily_summary_failed",
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));
  }
}
