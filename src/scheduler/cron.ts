/**
 * Scheduler / Cron
 * 
 * Handles periodic execution of the agent workflow.
 * Runs on a configurable schedule (default: hourly).
 */

import { getEnv } from "../config/env.js";
import { createAgentGraph } from "../agent/graph.js";
import { createInitialState } from "../agent/state.js";

let intervalId: NodeJS.Timeout | null = null;

/**
 * Start the scheduler
 */
export function startScheduler(): void {
  const env = getEnv();
  
  // Parse cron schedule (simple hourly for now)
  // TODO: Use a proper cron parser for complex schedules
  const schedule = env.CRON_SCHEDULE;
  
  console.log(JSON.stringify({
    level: "info",
    event: "scheduler_started",
    schedule,
    timestamp: new Date().toISOString(),
  }));

  // For now, use simple interval (every hour = 3600000 ms)
  // In production, use a proper cron library
  const intervalMs = 3600000; // 1 hour

  intervalId = setInterval(async () => {
    await runAgentWorkflow();
  }, intervalMs);

  // Run immediately on start
  runAgentWorkflow().catch((error) => {
    console.error(JSON.stringify({
      level: "error",
      event: "scheduler_initial_run_failed",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    }));
  });
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    
    console.log(JSON.stringify({
      level: "info",
      event: "scheduler_stopped",
      timestamp: new Date().toISOString(),
    }));
  }
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
