/**
 * Learning System
 * 
 * Stores and retrieves patterns learned from user corrections
 * to improve future confidence scores.
 */

import { getDatabase } from "./db.js";

export interface SupplierKostenpostMapping {
  id: number;
  supplier_name: string;
  supplier_iban?: string;
  supplier_vat?: string;
  kostenpost_id: string;
  kostenpost_name: string;
  confidence: number;
  usage_count: number;
  last_used_at: string;
  source: "agent" | "correction";
}

/**
 * Get kostenpost mapping for a supplier
 */
export function getKostenpostMapping(params: {
  supplier_name?: string;
  supplier_iban?: string;
  supplier_vat?: string;
}): SupplierKostenpostMapping | null {
  const db = getDatabase();
  
  let query = `
    SELECT * FROM supplier_kostenpost_mappings
    WHERE 1=1
  `;
  const params_array: unknown[] = [];
  
  if (params.supplier_name) {
    query += ` AND supplier_name = ?`;
    params_array.push(params.supplier_name);
  }
  
  if (params.supplier_iban) {
    query += ` AND supplier_iban = ?`;
    params_array.push(params.supplier_iban);
  }
  
  if (params.supplier_vat) {
    query += ` AND supplier_vat = ?`;
    params_array.push(params.supplier_vat);
  }
  
  // User-corrected mappings outrank the agent's self-learned ones
  query += ` ORDER BY (source = 'correction') DESC, confidence DESC, usage_count DESC LIMIT 1`;

  const row = db.prepare(query).get(...params_array) as SupplierKostenpostMapping | undefined;
  return row || null;
}

/**
 * Record a supplier → kostenpost mapping
 */
export function recordKostenpostMapping(params: {
  supplier_name: string;
  supplier_iban?: string;
  supplier_vat?: string;
  kostenpost_id: string;
  kostenpost_name: string;
  confidence?: number;
  source?: "agent" | "correction";
}): void {
  const db = getDatabase();

  // Check if mapping already exists
  const existing = db.prepare(`
    SELECT * FROM supplier_kostenpost_mappings
    WHERE supplier_name = ? AND kostenpost_id = ?
  `).get(params.supplier_name, params.kostenpost_id) as SupplierKostenpostMapping | undefined;

  if (existing) {
    // Update existing mapping. A 'correction' source is sticky: the agent's
    // own re-confirmations never downgrade user-derived knowledge.
    const newSource = params.source === "correction" || existing.source === "correction"
      ? "correction"
      : "agent";
    db.prepare(`
      UPDATE supplier_kostenpost_mappings
      SET usage_count = usage_count + 1,
          last_used_at = datetime('now'),
          confidence = ?,
          source = ?
      WHERE id = ?
    `).run(params.confidence ?? existing.confidence, newSource, existing.id);
  } else {
    // Insert new mapping
    db.prepare(`
      INSERT INTO supplier_kostenpost_mappings
      (supplier_name, supplier_iban, supplier_vat, kostenpost_id, kostenpost_name, confidence, usage_count, last_used_at, source)
      VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), ?)
    `).run(
      params.supplier_name,
      params.supplier_iban || null,
      params.supplier_vat || null,
      params.kostenpost_id,
      params.kostenpost_name,
      params.confidence ?? 1.0,
      params.source ?? "agent"
    );
  }
}

/**
 * Apply a user's kostenpost correction to the learning store:
 * penalize the mapping the agent chose wrongly (halve confidence, delete
 * below 0.3) and record the corrected mapping as user-confirmed.
 */
export function applyKostenpostCorrection(params: {
  supplier_name: string;
  wrong_kostenpost_id?: string;
  corrected_kostenpost_id: string;
  corrected_kostenpost_name: string;
}): void {
  const db = getDatabase();

  if (params.wrong_kostenpost_id) {
    const wrong = db.prepare(`
      SELECT * FROM supplier_kostenpost_mappings
      WHERE supplier_name = ? AND kostenpost_id = ?
    `).get(params.supplier_name, params.wrong_kostenpost_id) as SupplierKostenpostMapping | undefined;

    if (wrong) {
      const halved = wrong.confidence / 2;
      if (halved < 0.3) {
        db.prepare(`DELETE FROM supplier_kostenpost_mappings WHERE id = ?`).run(wrong.id);
      } else {
        db.prepare(`
          UPDATE supplier_kostenpost_mappings SET confidence = ? WHERE id = ?
        `).run(halved, wrong.id);
      }
    }
  }

  recordKostenpostMapping({
    supplier_name: params.supplier_name,
    kostenpost_id: params.corrected_kostenpost_id,
    kostenpost_name: params.corrected_kostenpost_name,
    confidence: 1.0,
    source: "correction",
  });
}

/**
 * Most-used kostenposten across all suppliers (for the review picker)
 */
export function getTopKostenposten(limit: number): Array<{ kostenpost_id: string; kostenpost_name: string }> {
  const db = getDatabase();
  return db.prepare(`
    SELECT kostenpost_id, kostenpost_name
    FROM supplier_kostenpost_mappings
    GROUP BY kostenpost_id, kostenpost_name
    ORDER BY SUM(usage_count) DESC
    LIMIT ?
  `).all(limit) as Array<{ kostenpost_id: string; kostenpost_name: string }>;
}

/**
 * Corrections detected in the last N days (for the daily summary's
 * "learned this week" section).
 */
export function getRecentCorrections(days: number): Array<{
  invoice_id: string;
  correction_type: string;
  original_value: string | null;
  corrected_value: string | null;
  notes: string | null;
  corrected_at: string;
}> {
  const db = getDatabase();
  return db.prepare(`
    SELECT invoice_id, correction_type, original_value, corrected_value, notes, corrected_at
    FROM corrections
    WHERE corrected_at >= datetime('now', ?)
    ORDER BY corrected_at DESC
  `).all(`-${days} days`) as Array<{
    invoice_id: string;
    correction_type: string;
    original_value: string | null;
    corrected_value: string | null;
    notes: string | null;
    corrected_at: string;
  }>;
}

/**
 * Rolling correction rate: corrections per auto-booked invoice.
 * This is the agent's real accuracy KPI — lower is better.
 */
export function getCorrectionRate(days: number): {
  corrections: number;
  autoBooked: number;
  rate: number | null;
} {
  const db = getDatabase();

  const corrections = (db.prepare(`
    SELECT COUNT(DISTINCT invoice_id) AS n FROM corrections
    WHERE corrected_at >= datetime('now', ?)
  `).get(`-${days} days`) as { n: number }).n;

  const autoBooked = (db.prepare(`
    SELECT COUNT(*) AS n FROM processing_log
    WHERE action_taken = 'auto_book' AND error IS NULL
      AND processed_at >= datetime('now', ?)
  `).get(`-${days} days`) as { n: number }).n;

  return {
    corrections,
    autoBooked,
    rate: autoBooked > 0 ? corrections / autoBooked : null,
  };
}

/**
 * Record a user correction
 */
export function recordCorrection(params: {
  invoice_id: string;
  correction_type: string;
  original_value?: string;
  corrected_value?: string;
  notes?: string;
}): void {
  const db = getDatabase();
  
  db.prepare(`
    INSERT INTO corrections
    (invoice_id, correction_type, original_value, corrected_value, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    params.invoice_id,
    params.correction_type,
    params.original_value || null,
    params.corrected_value || null,
    params.notes || null
  );
}

/**
 * Log processing state
 */
export function logProcessing(params: {
  invoice_id: string;
  state: string; // JSON string of AgentState
  action_taken?: string;
  confidence?: number;
  error?: string;
}): void {
  const db = getDatabase();
  
  db.prepare(`
    INSERT INTO processing_log
    (invoice_id, state, action_taken, confidence, error)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    params.invoice_id,
    params.state,
    params.action_taken || null,
    params.confidence || null,
    params.error || null
  );
}
