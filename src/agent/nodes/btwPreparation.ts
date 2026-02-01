/**
 * BTW Preparation Node
 * 
 * Prepares BTW (VAT) data for quarterly reporting:
 * - Aggregates VAT by quarter
 * - Validates VAT calculations
 * - Detects reverse charge
 * - Exports ready-to-use data
 */

import { MoneybirdMCPClient } from "../../moneybird/mcpClient.js";

export interface BTWQuarterlyData {
  quarter: string; // e.g., "2024-Q1"
  total_excl_tax: number;
  total_incl_tax: number;
  total_vat: number;
  vat_by_rate: Record<string, number>; // e.g., { "21": 1000, "9": 500, "0": 0 }
  reverse_charge_count: number;
  reverse_charge_amount: number;
  invoices: string[]; // Invoice IDs
}

/**
 * Get BTW data for a specific quarter
 */
export async function getBTWQuarterlyData(
  year: number,
  quarter: 1 | 2 | 3 | 4
): Promise<BTWQuarterlyData> {
  const client = new MoneybirdMCPClient();

  // Calculate quarter date range
  const quarterStartMonth = (quarter - 1) * 3;
  const quarterEndMonth = quarterStartMonth + 2;
  const dateFrom = `${year}-${String(quarterStartMonth + 1).padStart(2, "0")}-01`;
  const dateTo = new Date(year, quarterEndMonth + 1, 0).toISOString().split("T")[0];

  // Get all purchase invoices for the quarter
  const invoices = await client.listPurchaseInvoices({
    // Note: MCP may not support date filtering directly
    // May need to filter client-side
  });

  // Filter by date range
  const quarterInvoices = invoices.filter((inv) => {
    if (!inv.invoice_date) return false;
    return inv.invoice_date >= dateFrom && inv.invoice_date <= dateTo;
  });

  // Aggregate data
  let totalExclTax = 0;
  let totalInclTax = 0;
  let totalVat = 0;
  const vatByRate: Record<string, number> = {};
  let reverseChargeCount = 0;
  let reverseChargeAmount = 0;
  const invoiceIds: string[] = [];

  for (const invoice of quarterInvoices) {
    invoiceIds.push(invoice.id);

    const exclTax = invoice.total_price_excl_tax || 0;
    const inclTax = invoice.total_price_incl_tax || 0;
    const vat = invoice.tax || 0;

    totalExclTax += exclTax;
    totalInclTax += inclTax;
    totalVat += vat;

    // Calculate VAT rate
    const vatRate = exclTax > 0 ? Math.round((vat / exclTax) * 100) : 0;
    const rateKey = String(vatRate);
    vatByRate[rateKey] = (vatByRate[rateKey] || 0) + vat;

    // Check for reverse charge (VAT = 0 but invoice exists)
    if (vat === 0 && exclTax > 0) {
      reverseChargeCount++;
      reverseChargeAmount += exclTax;
    }
  }

  return {
    quarter: `${year}-Q${quarter}`,
    total_excl_tax: totalExclTax,
    total_incl_tax: totalInclTax,
    total_vat: totalVat,
    vat_by_rate: vatByRate,
    reverse_charge_count: reverseChargeCount,
    reverse_charge_amount: reverseChargeAmount,
    invoices: invoiceIds,
  };
}

/**
 * Validate BTW data for a quarter
 */
export function validateBTWData(data: BTWQuarterlyData): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Validate VAT calculation
  const calculatedVat = data.total_incl_tax - data.total_excl_tax;
  const discrepancy = Math.abs(calculatedVat - data.total_vat);

  if (discrepancy > 1) {
    // Allow 1 cent tolerance
    errors.push(`VAT calculation mismatch: expected €${(calculatedVat / 100).toFixed(2)}, got €${(data.total_vat / 100).toFixed(2)}`);
  }

  // Check for common VAT rates in NL
  const validRates = ["0", "9", "21"];
  for (const rate of Object.keys(data.vat_by_rate)) {
    if (!validRates.includes(rate) && data.vat_by_rate[rate] > 0) {
      warnings.push(`Unusual VAT rate detected: ${rate}%`);
    }
  }

  // Check reverse charge
  if (data.reverse_charge_count > 0) {
    warnings.push(`${data.reverse_charge_count} reverse charge invoices found`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Export BTW data as CSV
 */
export function exportBTWDataAsCSV(data: BTWQuarterlyData): string {
  const lines: string[] = [];
  lines.push(`Quarter,${data.quarter}`);
  lines.push(`Total Excl. Tax,€${(data.total_excl_tax / 100).toFixed(2)}`);
  lines.push(`Total Incl. Tax,€${(data.total_incl_tax / 100).toFixed(2)}`);
  lines.push(`Total VAT,€${(data.total_vat / 100).toFixed(2)}`);
  lines.push("");
  lines.push("VAT by Rate:");
  lines.push("Rate,VAT Amount");
  for (const [rate, amount] of Object.entries(data.vat_by_rate)) {
    lines.push(`${rate}%,€${(amount / 100).toFixed(2)}`);
  }
  lines.push("");
  lines.push(`Reverse Charge Count,${data.reverse_charge_count}`);
  lines.push(`Reverse Charge Amount,€${(data.reverse_charge_amount / 100).toFixed(2)}`);
  lines.push("");
  lines.push(`Invoice Count,${data.invoices.length}`);

  return lines.join("\n");
}
