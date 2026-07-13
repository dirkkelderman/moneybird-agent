import { describe, it, expect } from "vitest";
import {
  recordKostenpostMapping,
  getKostenpostMapping,
  recordCorrection,
  logProcessing,
} from "./learning.js";
import { isInvoiceProcessed, markInvoiceProcessed, getDatabase } from "./db.js";

// setup.ts points DATABASE_PATH at :memory:, so this exercises the real
// schema and SQL against a throwaway SQLite database.

describe("supplier_kostenpost_mappings", () => {
  it("stores and retrieves a mapping", () => {
    recordKostenpostMapping({
      supplier_name: "Hetzner Online GmbH",
      kostenpost_id: "L1",
      kostenpost_name: "Hosting",
      confidence: 0.9,
    });
    const mapping = getKostenpostMapping({ supplier_name: "Hetzner Online GmbH" });
    expect(mapping).not.toBeNull();
    expect(mapping!.kostenpost_id).toBe("L1");
    expect(mapping!.usage_count).toBe(1);
  });

  it("increments usage_count on repeated confirmation", () => {
    recordKostenpostMapping({
      supplier_name: "Mollie B.V.",
      kostenpost_id: "L2",
      kostenpost_name: "Payment fees",
    });
    recordKostenpostMapping({
      supplier_name: "Mollie B.V.",
      kostenpost_id: "L2",
      kostenpost_name: "Payment fees",
    });
    const mapping = getKostenpostMapping({ supplier_name: "Mollie B.V." });
    expect(mapping!.usage_count).toBe(2);
  });

  it("prefers the higher-confidence mapping when a supplier has several", () => {
    recordKostenpostMapping({
      supplier_name: "Dual Corp",
      kostenpost_id: "LA",
      kostenpost_name: "A",
      confidence: 0.5,
    });
    recordKostenpostMapping({
      supplier_name: "Dual Corp",
      kostenpost_id: "LB",
      kostenpost_name: "B",
      confidence: 0.95,
    });
    const mapping = getKostenpostMapping({ supplier_name: "Dual Corp" });
    expect(mapping!.kostenpost_id).toBe("LB");
  });

  it("returns null for an unknown supplier", () => {
    expect(getKostenpostMapping({ supplier_name: "Nope BV" })).toBeNull();
  });
});

describe("corrections and processing log", () => {
  it("records corrections with all fields", () => {
    recordCorrection({
      invoice_id: "inv-c1",
      correction_type: "kostenpost",
      original_value: "Hosting",
      corrected_value: "Software",
      notes: "Hetzner",
    });
    const row = getDatabase()
      .prepare("SELECT * FROM corrections WHERE invoice_id = ?")
      .get("inv-c1") as { correction_type: string; corrected_value: string };
    expect(row.correction_type).toBe("kostenpost");
    expect(row.corrected_value).toBe("Software");
  });

  it("logs processing state as retrievable JSON", () => {
    logProcessing({
      invoice_id: "inv-l1",
      state: JSON.stringify({ kostenpostId: "L9" }),
      action_taken: "auto_book",
      confidence: 97,
    });
    const row = getDatabase()
      .prepare("SELECT * FROM processing_log WHERE invoice_id = ?")
      .get("inv-l1") as { state: string; action_taken: string };
    expect(row.action_taken).toBe("auto_book");
    expect(JSON.parse(row.state).kostenpostId).toBe("L9");
  });
});

describe("processed_invoices", () => {
  it("round-trips the processed flag", () => {
    expect(isInvoiceProcessed("inv-p1")).toBe(false);
    markInvoiceProcessed("inv-p1", "review");
    expect(isInvoiceProcessed("inv-p1")).toBe(true);
  });
});
