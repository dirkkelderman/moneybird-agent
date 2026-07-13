/**
 * Daily summary generator
 * 
 * Aggregates logs and generates daily summaries
 */

import type { DailySummary, ErrorSummary, ActionSummary, UnmatchedTransaction, OverdueInvoice } from "./types.js";
import { getDatabase } from "../storage/db.js";
import { MoneybirdMCPClient } from "../moneybird/mcpClient.js";
import { getEnv } from "../config/env.js";
import { findOverdueSalesInvoices } from "../agent/receivables.js";
import { getRecentCorrections, getCorrectionRate } from "../storage/learning.js";
import { countPendingReviews } from "../storage/reviews.js";

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

  // Find unmatched bank transactions
  const unmatchedResult = await findUnmatchedTransactions();

  // Find overdue sales invoices (receivables that need chasing)
  const overdueResult = await findOverdueInvoicesSafe();
  const totalOutstanding = overdueResult.invoices.reduce((sum, inv) => sum + inv.amount, 0);

  return {
    date,
    invoicesProcessed,
    invoicesAutoBooked,
    invoicesRequiringReview,
    errors: Array.from(errors.values()),
    actions: Array.from(actions.values()),
    unmatchedTransactions: unmatchedResult.transactions,
    overdueInvoices: overdueResult.invoices,
    totalOutstanding,
    dataMayBeIncomplete: unmatchedResult.truncated || overdueResult.truncated,
    pendingReviews: countPendingReviewsSafe(),
    learnings: collectRecentLearnings(),
    correctionRate: getCorrectionRateSafe(),
  };
}

function countPendingReviewsSafe(): number {
  try {
    return countPendingReviews();
  } catch {
    return 0;
  }
}

/**
 * Human-readable list of what the reconciliation job learned this week
 */
function collectRecentLearnings(): string[] {
  try {
    return getRecentCorrections(7).map((c) => {
      const subject = c.notes || c.invoice_id;
      switch (c.correction_type) {
        case "kostenpost":
          return `${subject}: ${c.original_value ?? "?"} → ${c.corrected_value ?? "?"} (will apply next time)`;
        case "rejected":
          return `${subject}: invoice was deleted after processing`;
        default:
          return `${subject}: ${c.correction_type} corrected`;
      }
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "learnings_collection_failed",
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));
    return [];
  }
}

function getCorrectionRateSafe(): { corrections: number; autoBooked: number; rate: number | null } {
  try {
    const rate = getCorrectionRate(30);
    console.log(JSON.stringify({
      level: "info",
      event: "correction_rate_30d",
      corrections: rate.corrections,
      auto_booked: rate.autoBooked,
      rate: rate.rate,
      timestamp: new Date().toISOString(),
    }));
    return rate;
  } catch {
    return { corrections: 0, autoBooked: 0, rate: null };
  }
}

/**
 * Find overdue sales invoices without breaking the daily summary on failure
 */
async function findOverdueInvoicesSafe(): Promise<{ invoices: OverdueInvoice[]; truncated: boolean }> {
  const env = getEnv();
  if (!env.OVERDUE_INVOICES_ENABLED) {
    return { invoices: [], truncated: false };
  }

  try {
    return await findOverdueSalesInvoices();
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "overdue_invoices_check_failed",
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));
    return { invoices: [], truncated: false };
  }
}

/**
 * Find bank transactions that don't have a matching invoice
 *
 * Checks transactions from the configured lookback period that don't have an invoice_id
 */
async function findUnmatchedTransactions(): Promise<{ transactions: UnmatchedTransaction[]; truncated: boolean }> {
  try {
    const client = new MoneybirdMCPClient();
    const env = getEnv();

    // Get transactions from the configured lookback period (all pages;
    // Moneybird caps per_page at 100, the old single-page 200 was clamped)
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - env.UNMATCHED_TRANSACTIONS_DAYS);

    const { items: transactions, truncated } = await client.listAllFinancialMutations({
      from_date: fromDate.toISOString().split("T")[0],
      to_date: today.toISOString().split("T")[0],
    });
    
    // Filter for transactions without an invoice_id (unmatched)
    // Also filter out very small amounts (likely fees, rounding, etc.) - less than €1
    const unmatched = transactions
      .filter((t) => {
        // No invoice_id means unmatched
        const hasNoInvoice = !t.invoice_id;
        // Filter out very small amounts (likely fees, rounding)
        const isSignificantAmount = Math.abs(t.amount) >= 100; // €1.00 or more
        return hasNoInvoice && isSignificantAmount;
      })
      .map((t) => {
        const transactionDate = new Date(t.date);
        const daysSince = Math.floor((today.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24));
        
        return {
          id: t.id,
          date: t.date,
          amount: t.amount,
          description: t.description,
          account_id: t.account_id,
          daysUnmatched: daysSince,
        };
      })
      // Sort by date (oldest first - these are most likely to need attention)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    console.log(JSON.stringify({
      level: "info",
      event: "unmatched_transactions_found",
      count: unmatched.length,
      date_range: `${fromDate.toISOString().split("T")[0]} to ${today.toISOString().split("T")[0]}`,
      truncated,
      timestamp: new Date().toISOString(),
    }));

    return { transactions: unmatched, truncated };
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "unmatched_transactions_check_failed",
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));

    // Return empty array on error (don't break daily summary)
    return { transactions: [], truncated: false };
  }
}
