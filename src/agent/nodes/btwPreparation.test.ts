import "../../test/setup.js";
import { describe, it, expect } from "vitest";
import { validateBTWData, exportBTWDataAsCSV, type BTWQuarterlyData } from "./btwPreparation.js";

const baseData = (overrides: Partial<BTWQuarterlyData> = {}): BTWQuarterlyData => ({
  quarter: "2026-Q2",
  total_excl_tax: 100000,
  total_incl_tax: 121000,
  total_vat: 21000,
  vat_by_rate: { "21": 21000 },
  reverse_charge_count: 0,
  reverse_charge_amount: 0,
  invoices: ["1", "2"],
  truncated: false,
  ...overrides,
});

describe("validateBTWData", () => {
  it("accepts consistent totals", () => {
    const result = validateBTWData(baseData());
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("tolerates a 1-cent rounding difference", () => {
    const result = validateBTWData(baseData({ total_vat: 21001 }));
    expect(result.isValid).toBe(true);
  });

  it("rejects a VAT mismatch beyond tolerance", () => {
    const result = validateBTWData(baseData({ total_vat: 20000 }));
    expect(result.isValid).toBe(false);
    expect(result.errors[0]).toContain("VAT calculation mismatch");
  });

  it("warns on unusual VAT rates but stays valid", () => {
    const result = validateBTWData(
      baseData({ vat_by_rate: { "21": 20000, "19": 1000 } })
    );
    expect(result.isValid).toBe(true);
    expect(result.warnings.some((w) => w.includes("19%"))).toBe(true);
  });

  it("does not warn for standard NL rates (0, 9, 21)", () => {
    const result = validateBTWData(
      baseData({ vat_by_rate: { "21": 15000, "9": 6000, "0": 0 } })
    );
    expect(result.warnings.filter((w) => w.includes("Unusual"))).toHaveLength(0);
  });

  it("warns when reverse-charge invoices are present", () => {
    const result = validateBTWData(
      baseData({ reverse_charge_count: 3, reverse_charge_amount: 50000 })
    );
    expect(result.warnings.some((w) => w.includes("reverse charge"))).toBe(true);
  });
});

describe("exportBTWDataAsCSV", () => {
  it("renders totals in euros with rates", () => {
    const csv = exportBTWDataAsCSV(baseData());
    expect(csv).toContain("Quarter,2026-Q2");
    expect(csv).toContain("Total Excl. Tax,€1000.00");
    expect(csv).toContain("Total VAT,€210.00");
    expect(csv).toContain("21%,€210.00");
    expect(csv).toContain("Invoice Count,2");
  });
});
