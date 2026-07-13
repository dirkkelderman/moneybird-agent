/**
 * Correction Reconciliation Job
 *
 * Closes the learning loop: a few days after the agent processes an
 * invoice, re-fetch it from Moneybird and diff what the agent decided
 * against what the user kept. Any difference is a correction — recorded
 * in the corrections table and, for kostenposten, applied to the
 * supplier→kostenpost learning store so the agent doesn't repeat the
 * mistake.
 *
 * Runs daily (scheduled one hour before the daily summary so fresh
 * learnings appear in it). Each invoice is reconciled at most once,
 * within a 2–14 day window after processing: earlier and the user likely
 * hasn't reviewed it yet, later and the trail has gone cold.
 */

import { getDatabase } from "../storage/db.js";
import { applyKostenpostCorrection, recordCorrection } from "../storage/learning.js";
import { MoneybirdMCPClient } from "../moneybird/mcpClient.js";
import type { MoneybirdInvoice } from "../moneybird/types.js";

const RECONCILE_MIN_AGE_DAYS = 2;
const RECONCILE_MAX_AGE_DAYS = 14;
const MAX_INVOICES_PER_RECONCILE_RUN = 30;

interface ReconcileCandidate {
  invoice_id: string;
  processed_at: string;
  status: string;
  state: string; // JSON AgentState snapshot from processing_log
}

interface AgentDecisionSnapshot {
  kostenpostId?: string;
  contactId?: string;
  supplierName?: string;
  totalInclTax?: number;
  invoiceDate?: string;
}

function parseSnapshot(stateJson: string): AgentDecisionSnapshot | null {
  try {
    const state = JSON.parse(stateJson);
    return {
      kostenpostId: state.kostenpostId,
      contactId: state.contact?.id ?? state.invoice?.contact_id,
      supplierName: state.extraction?.supplier_name || state.contact?.company_name,
      totalInclTax: state.invoice?.total_price_incl_tax,
      invoiceDate: state.invoice?.invoice_date,
    };
  } catch {
    return null;
  }
}

function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /\b404\b|not found/i.test(message);
}

/**
 * Reconcile recently processed invoices against their current state in
 * Moneybird and record any user corrections.
 * Returns the number of corrections detected.
 */
export async function reconcileCorrections(): Promise<number> {
  const db = getDatabase();
  const client = new MoneybirdMCPClient();

  const candidates = db.prepare(`
    SELECT p.invoice_id, p.processed_at, p.status,
           (SELECT l.state FROM processing_log l
            WHERE l.invoice_id = p.invoice_id
            ORDER BY l.processed_at DESC LIMIT 1) AS state
    FROM processed_invoices p
    WHERE p.reconciled_at IS NULL
      AND p.status IN ('completed', 'review')
      AND p.processed_at <= datetime('now', '-${RECONCILE_MIN_AGE_DAYS} days')
      AND p.processed_at >= datetime('now', '-${RECONCILE_MAX_AGE_DAYS} days')
    ORDER BY p.processed_at ASC
    LIMIT ${MAX_INVOICES_PER_RECONCILE_RUN}
  `).all() as ReconcileCandidate[];

  if (candidates.length === 0) {
    return 0;
  }

  console.log(JSON.stringify({
    level: "info",
    event: "reconcile_started",
    candidates: candidates.length,
    timestamp: new Date().toISOString(),
  }));

  // Ledger account names for readable correction records
  let ledgerNames = new Map<string, string>();
  try {
    const accounts = await client.listLedgerAccounts();
    ledgerNames = new Map(accounts.map((a) => [a.id, a.name]));
  } catch {
    // Names are cosmetic; continue without them
  }

  const markReconciled = db.prepare(
    `UPDATE processed_invoices SET reconciled_at = datetime('now') WHERE invoice_id = ?`
  );

  let correctionsFound = 0;

  for (const candidate of candidates) {
    const snapshot = candidate.state ? parseSnapshot(candidate.state) : null;
    if (!snapshot) {
      // No usable decision snapshot — nothing to diff against
      markReconciled.run(candidate.invoice_id);
      continue;
    }

    let current: MoneybirdInvoice;
    try {
      current = await client.getPurchaseInvoice(candidate.invoice_id);
    } catch (error) {
      if (isNotFoundError(error)) {
        // User deleted the invoice the agent processed
        recordCorrection({
          invoice_id: candidate.invoice_id,
          correction_type: "rejected",
          original_value: snapshot.kostenpostId,
          notes: "Invoice no longer exists in Moneybird",
        });
        correctionsFound++;
        markReconciled.run(candidate.invoice_id);
        continue;
      }
      // Transient fetch problem: leave unreconciled for the next run
      // (still inside the window) rather than recording a bogus diff.
      console.log(JSON.stringify({
        level: "warn",
        event: "reconcile_fetch_failed",
        invoice_id: candidate.invoice_id,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
      continue;
    }

    // Kostenpost diff — only single-line invoices give an unambiguous signal
    const details = current.details ?? [];
    if (snapshot.kostenpostId && details.length === 1 && details[0].ledger_account_id) {
      const bookedLedgerId = details[0].ledger_account_id;
      if (bookedLedgerId !== snapshot.kostenpostId) {
        recordCorrection({
          invoice_id: candidate.invoice_id,
          correction_type: "kostenpost",
          original_value: ledgerNames.get(snapshot.kostenpostId) ?? snapshot.kostenpostId,
          corrected_value: ledgerNames.get(bookedLedgerId) ?? bookedLedgerId,
          notes: snapshot.supplierName,
        });
        correctionsFound++;

        if (snapshot.supplierName) {
          applyKostenpostCorrection({
            supplier_name: snapshot.supplierName,
            wrong_kostenpost_id: snapshot.kostenpostId,
            corrected_kostenpost_id: bookedLedgerId,
            corrected_kostenpost_name: ledgerNames.get(bookedLedgerId) ?? "Unknown",
          });
        }
      }
    } else if (snapshot.kostenpostId && details.length > 1) {
      console.log(JSON.stringify({
        level: "debug",
        event: "reconcile_multiline_skipped",
        invoice_id: candidate.invoice_id,
        detail_count: details.length,
        timestamp: new Date().toISOString(),
      }));
    }

    // Contact diff
    if (snapshot.contactId && current.contact_id && current.contact_id !== snapshot.contactId) {
      recordCorrection({
        invoice_id: candidate.invoice_id,
        correction_type: "contact",
        original_value: snapshot.contactId,
        corrected_value: current.contact_id,
        notes: snapshot.supplierName,
      });
      correctionsFound++;
    }

    // Amount diff (> 1 cent counts as a correction)
    if (
      snapshot.totalInclTax !== undefined &&
      Math.abs(Math.abs(current.total_price_incl_tax) - Math.abs(snapshot.totalInclTax)) > 1
    ) {
      recordCorrection({
        invoice_id: candidate.invoice_id,
        correction_type: "amount",
        original_value: String(snapshot.totalInclTax),
        corrected_value: String(current.total_price_incl_tax),
        notes: snapshot.supplierName,
      });
      correctionsFound++;
    }

    // Date diff
    if (snapshot.invoiceDate && current.invoice_date && current.invoice_date !== snapshot.invoiceDate) {
      recordCorrection({
        invoice_id: candidate.invoice_id,
        correction_type: "date",
        original_value: snapshot.invoiceDate,
        corrected_value: current.invoice_date,
        notes: snapshot.supplierName,
      });
      correctionsFound++;
    }

    markReconciled.run(candidate.invoice_id);
  }

  console.log(JSON.stringify({
    level: "info",
    event: "reconcile_completed",
    candidates: candidates.length,
    corrections_found: correctionsFound,
    timestamp: new Date().toISOString(),
  }));

  return correctionsFound;
}
