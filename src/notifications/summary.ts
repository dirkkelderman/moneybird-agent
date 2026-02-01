/**
 * Daily summary generator
 * 
 * Aggregates logs and generates daily summaries
 */

import type { DailySummary, ErrorSummary, ActionSummary } from "./types.js";
import { getDatabase } from "../storage/db.js";

/**
 * Generate daily summary from database logs
 */
export async function generateDailySummary(date: string = new Date().toISOString().split("T")[0]): Promise<DailySummary> {
  const db = getDatabase();
  
  // Get all processing logs for the date
  const logs = db.prepare(`
    SELECT * FROM processing_log
    WHERE date(processed_at) = date(?)
    ORDER BY processed_at DESC
  `).all(date) as Array<{
    id: number;
    invoice_id: string;
    state: string;
    action_taken: string | null;
    confidence: number | null;
    error: string | null;
    processed_at: string;
  }>;

  // Parse states to extract information
  const invoicesProcessed = logs.length;
  let invoicesAutoBooked = 0;
  let invoicesRequiringReview = 0;
  const errors: Map<string, ErrorSummary> = new Map();
  const actions: Map<string, ActionSummary> = new Map();

  for (const log of logs) {
    try {
      const state = JSON.parse(log.state);
      
      // Count auto-booked
      if (log.action_taken === "auto_book") {
        invoicesAutoBooked++;
      }
      
      // Count requiring review
      if (log.action_taken === "flag_review" || log.action_taken === "alert_user") {
        invoicesRequiringReview++;
      }

      // Track errors
      if (log.error) {
        const errorKey = log.error.substring(0, 100); // Use first 100 chars as key
        if (!errors.has(errorKey)) {
          errors.set(errorKey, {
            level: "error",
            event: "processing_error",
            message: log.error,
            count: 0,
            firstOccurred: log.processed_at,
            lastOccurred: log.processed_at,
            requiresHumanIntervention: true,
          });
        }
        const errorSummary = errors.get(errorKey)!;
        errorSummary.count++;
        if (log.processed_at < errorSummary.firstOccurred) {
          errorSummary.firstOccurred = log.processed_at;
        }
        if (log.processed_at > errorSummary.lastOccurred) {
          errorSummary.lastOccurred = log.processed_at;
        }
      }

      // Track actions
      if (state.contact && state.isNewContact) {
        const actionKey = "contact_created";
        if (!actions.has(actionKey)) {
          actions.set(actionKey, {
            type: "contact_created",
            count: 0,
            details: [],
          });
        }
        const action = actions.get(actionKey)!;
        action.count++;
        if (state.contact.company_name && action.details && action.details.length < 10) {
          action.details.push(state.contact.company_name);
        }
      }

      if (log.action_taken === "auto_book") {
        const actionKey = "auto_booked";
        if (!actions.has(actionKey)) {
          actions.set(actionKey, {
            type: "auto_booked",
            count: 0,
            details: [],
          });
        }
        actions.get(actionKey)!.count++;
      }

      // Track invoice updates/creates
      if (state.invoice) {
        // Check if invoice was updated (has extraction data)
        if (state.extraction && state.extraction.confidence >= 70) {
          const actionKey = "invoice_updated";
          if (!actions.has(actionKey)) {
            actions.set(actionKey, {
              type: "invoice_updated",
              count: 0,
              details: [],
            });
          }
          actions.get(actionKey)!.count++;
          if (state.invoice.id && actions.get(actionKey)!.details && actions.get(actionKey)!.details!.length < 10) {
            actions.get(actionKey)!.details!.push(state.invoice.id);
          }
        }
      }
    } catch (parseError) {
      // Skip logs that can't be parsed
      console.log(JSON.stringify({
        level: "warn",
        event: "summary_log_parse_error",
        log_id: log.id,
        error: parseError instanceof Error ? parseError.message : String(parseError),
        timestamp: new Date().toISOString(),
      }));
    }
  }

  // Also check for warnings/errors in console logs (if stored in database)
  // For now, we'll rely on processing_log errors

  return {
    date,
    invoicesProcessed,
    invoicesAutoBooked,
    invoicesRequiringReview,
    errors: Array.from(errors.values()),
    actions: Array.from(actions.values()),
  };
}
