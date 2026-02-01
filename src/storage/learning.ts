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
  
  query += ` ORDER BY confidence DESC, usage_count DESC LIMIT 1`;
  
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
}): void {
  const db = getDatabase();
  
  // Check if mapping already exists
  const existing = db.prepare(`
    SELECT * FROM supplier_kostenpost_mappings
    WHERE supplier_name = ? AND kostenpost_id = ?
  `).get(params.supplier_name, params.kostenpost_id) as SupplierKostenpostMapping | undefined;
  
  if (existing) {
    // Update existing mapping
    db.prepare(`
      UPDATE supplier_kostenpost_mappings
      SET usage_count = usage_count + 1,
          last_used_at = datetime('now'),
          confidence = ?
      WHERE id = ?
    `).run(params.confidence ?? existing.confidence, existing.id);
  } else {
    // Insert new mapping
    db.prepare(`
      INSERT INTO supplier_kostenpost_mappings
      (supplier_name, supplier_iban, supplier_vat, kostenpost_id, kostenpost_name, confidence, usage_count, last_used_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
    `).run(
      params.supplier_name,
      params.supplier_iban || null,
      params.supplier_vat || null,
      params.kostenpost_id,
      params.kostenpost_name,
      params.confidence ?? 1.0
    );
  }
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
