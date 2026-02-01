/**
 * SQLite Database Layer
 * 
 * Handles all database operations for:
 * - Learning patterns (supplier → kostenpost mappings)
 * - Correction history
 * - Processing state
 */

import Database from "better-sqlite3";
import { getEnv } from "../config/env.js";
import { mkdir } from "fs/promises";
import { dirname } from "path";

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (db) {
    return db;
  }

  const env = getEnv();
  const dbPath = env.DATABASE_PATH;

  // Ensure directory exists and has correct permissions
  const dbDir = dirname(dbPath);
  mkdir(dbDir, { recursive: true, mode: 0o755 }).catch((error) => {
    console.error(JSON.stringify({
      level: "error",
      event: "database_directory_creation_failed",
      path: dbDir,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));
    // Continue anyway - might already exist
  });

  try {
    db = new Database(dbPath);
    
    // Enable foreign keys
    db.pragma("foreign_keys = ON");
    
    // Initialize schema
    initializeSchema(db);
    
    return db;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      level: "error",
      event: "database_initialization_failed",
      path: dbPath,
      directory: dbDir,
      error: errorMessage,
      hint: "Check if directory exists and has write permissions. For Docker, ensure data directory is writable by container user (UID 1000).",
      timestamp: new Date().toISOString(),
    }));
    throw new Error(`Failed to initialize database at ${dbPath}: ${errorMessage}`);
  }
}

function initializeSchema(database: Database.Database): void {
  // Learning patterns: supplier → kostenpost mappings
  database.exec(`
    CREATE TABLE IF NOT EXISTS supplier_kostenpost_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_name TEXT NOT NULL,
      supplier_iban TEXT,
      supplier_vat TEXT,
      kostenpost_id TEXT NOT NULL,
      kostenpost_name TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      usage_count INTEGER DEFAULT 1,
      last_used_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(supplier_name, kostenpost_id)
    );

    CREATE INDEX IF NOT EXISTS idx_supplier_name ON supplier_kostenpost_mappings(supplier_name);
    CREATE INDEX IF NOT EXISTS idx_supplier_iban ON supplier_kostenpost_mappings(supplier_iban);
    CREATE INDEX IF NOT EXISTS idx_supplier_vat ON supplier_kostenpost_mappings(supplier_vat);
  `);

  // Correction history: track user corrections
  database.exec(`
    CREATE TABLE IF NOT EXISTS corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id TEXT NOT NULL,
      correction_type TEXT NOT NULL, -- 'contact', 'kostenpost', 'amount', etc.
      original_value TEXT,
      corrected_value TEXT,
      corrected_at TEXT NOT NULL DEFAULT (datetime('now')),
      notes TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_invoice_id ON corrections(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_correction_type ON corrections(correction_type);
  `);

  // Processing state: track invoice processing
  database.exec(`
    CREATE TABLE IF NOT EXISTS processing_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id TEXT NOT NULL,
      state TEXT NOT NULL, -- JSON string of AgentState
      action_taken TEXT,
      confidence REAL,
      error TEXT,
      processed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_invoice_id_log ON processing_log(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_processed_at ON processing_log(processed_at);
  `);

  // Processed invoices: track which invoices have been processed
  database.exec(`
    CREATE TABLE IF NOT EXISTS processed_invoices (
      invoice_id TEXT PRIMARY KEY,
      processed_at TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'completed' -- 'completed', 'failed', 'review'
    );

    CREATE INDEX IF NOT EXISTS idx_processed_at_invoices ON processed_invoices(processed_at);
  `);
}

/**
 * Check if an invoice has already been processed
 */
export function isInvoiceProcessed(invoiceId: string): boolean {
  const database = getDatabase();
  const result = database
    .prepare("SELECT invoice_id FROM processed_invoices WHERE invoice_id = ?")
    .get(invoiceId);
  return !!result;
}

/**
 * Mark an invoice as processed
 */
export function markInvoiceProcessed(
  invoiceId: string,
  status: "completed" | "failed" | "review" = "completed"
): void {
  const database = getDatabase();
  database
    .prepare(
      "INSERT OR REPLACE INTO processed_invoices (invoice_id, status, processed_at) VALUES (?, ?, datetime('now'))"
    )
    .run(invoiceId, status);
}

/**
 * Close database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
