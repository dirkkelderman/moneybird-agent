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

let workflowTask: ScheduledTask | null = null;
let dailySummaryTask: ScheduledTask | null = null;

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
  
  console.log(JSON.stringify({
    level: "info",
    event: "scheduler_stopped",
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Run the agent workflow once
 */
async function runAgentWorkflow(): Promise<void> {
  console.log(JSON.stringify({
    level: "info",
    event: "workflow_started",
    timestamp: new Date().toISOString(),
  }));

  try {
    const graph = createAgentGraph();
    const initialState = createInitialState();
    
    // Use stream to capture final state
    const stream = await graph.stream(initialState);
    let finalState: any = null;
    
    for await (const stateUpdate of stream) {
      finalState = stateUpdate;
    }
    
    // Extract state from final update
    const state = finalState?.__end__ || finalState || {};
    
    console.log(JSON.stringify({
      level: "info",
      event: "workflow_completed",
      invoice_id: state.invoice?.id,
      action: state.action,
      confidence: state.overallConfidence,
      current_node: state.currentNode,
      has_error: !!state.error,
      timestamp: new Date().toISOString(),
    }));
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
