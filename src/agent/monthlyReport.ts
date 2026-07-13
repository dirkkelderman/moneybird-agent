/**
 * Monthly Financial Report
 *
 * Sent on the 1st of each month: how did the business do last month?
 * - Revenue, costs and result vs. the month before
 * - Top cost categories (kostenposten)
 * - BTW reserve estimate for the current quarter to date
 * - Cash outlook from open sales and purchase invoices
 * - 6-month revenue/cost trend
 *
 * Month attribution is by invoice_date (accrual basis, matching how BTW
 * works for most ZZP'ers), not payment date.
 *
 * Unit convention: EVERYTHING inside this module is integer cents.
 * The two Moneybird APIs disagree (purchase invoices are cents, sales
 * invoices are currency units, sometimes strings) — that asymmetry is
 * normalized at the fetch boundary and nowhere else.
 */

import { MoneybirdMCPClient } from "../moneybird/mcpClient.js";
import type { MoneybirdInvoice } from "../moneybird/types.js";
import { getDatabase } from "../storage/db.js";
import { sendNotification } from "../notifications/index.js";

// Sales invoice states that count as real (sent) invoices for revenue
const SALES_REVENUE_STATES = new Set(["open", "late", "reminded", "paid"]);
// Sales invoice states with money still expected in
const SALES_UNPAID_STATES = new Set(["open", "late", "reminded"]);
// Purchase invoice states with money still expected out
const PURCHASE_UNPAID_STATES = new Set(["new", "open", "late"]);

/** Sales amounts arrive in currency units (e.g. "25.71" or 25.71) → cents */
export function salesAmountToCents(value: number | string | undefined | null): number {
  if (value === undefined || value === null) return 0;
  const num = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(num) ? Math.round(Math.abs(num) * 100) : 0;
}

/** Purchase amounts arrive in cents already → normalized integer cents */
export function purchaseAmountToCents(value: number | string | undefined | null): number {
  if (value === undefined || value === null) return 0;
  const num = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(num) ? Math.round(Math.abs(num)) : 0;
}

export interface MonthlyReport {
  month: string; // YYYY-MM
  revenueExclTax: number; // cents
  costsExclTax: number; // cents
  result: number; // cents (revenue - costs)
  prevMonth: string;
  prevRevenueExclTax: number;
  prevCostsExclTax: number;
  topCostCategories: Array<{ name: string; amount: number; share: number }>;
  uncategorizedShare: number; // 0-1 share of costs without a known kostenpost
  btwReserve: {
    quarter: string;
    salesVat: number; // cents charged on sales, quarter to date
    purchaseVat: number; // cents voorbelasting, quarter to date
    net: number; // cents to set aside (salesVat - purchaseVat)
  };
  cashOutlook: {
    expectedIn: number; // cents from unpaid sales invoices
    overdueIn: number; // cents of expectedIn already past due date
    expectedOut: number; // cents to unpaid purchase invoices
    net: number; // cents
  };
  trend: Array<{ month: string; revenue: number; costs: number }>;
  truncated: boolean;
}

function monthKey(dateStr: string | undefined): string | undefined {
  if (!dateStr || dateStr.length < 7) return undefined;
  return dateStr.slice(0, 7);
}

function previousMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1
    ? `${y - 1}-12`
    : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function lastNMonthKeys(month: string, n: number): string[] {
  const keys: string[] = [month];
  for (let i = 1; i < n; i++) {
    keys.unshift(previousMonthKey(keys[0]));
  }
  return keys;
}

function quarterOf(month: string): { key: string; months: Set<string> } {
  const [y, m] = month.split("-").map(Number);
  const quarter = Math.floor((m - 1) / 3) + 1;
  const months = new Set<string>();
  for (let i = 0; i < 3; i++) {
    months.add(`${y}-${String((quarter - 1) * 3 + 1 + i).padStart(2, "0")}`);
  }
  return { key: `${y}-Q${quarter}`, months };
}

/**
 * Pure computation from pre-fetched, pre-normalized inputs (unit-testable).
 */
export function computeMonthlyReport(input: {
  month: string; // YYYY-MM report month
  todayStr: string; // YYYY-MM-DD, for overdue detection
  salesInvoices: MoneybirdInvoice[];
  purchaseInvoices: MoneybirdInvoice[];
  /** invoice_id → kostenpost name, from the local processing log */
  kostenpostByInvoiceId: Map<string, string>;
  truncated: boolean;
}): MonthlyReport {
  const { month, todayStr, salesInvoices, purchaseInvoices, kostenpostByInvoiceId, truncated } = input;
  const prevMonth = previousMonthKey(month);
  const trendMonths = lastNMonthKeys(month, 6);
  const trendSet = new Set(trendMonths);

  const realSales = salesInvoices.filter((inv) => SALES_REVENUE_STATES.has(inv.state));

  // Revenue / costs per month for the trend window
  const revenueByMonth = new Map<string, number>();
  const costsByMonth = new Map<string, number>();

  for (const inv of realSales) {
    const key = monthKey(inv.invoice_date);
    if (key && trendSet.has(key)) {
      revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + salesAmountToCents(inv.total_price_excl_tax));
    }
  }
  for (const inv of purchaseInvoices) {
    const key = monthKey(inv.invoice_date);
    if (key && trendSet.has(key)) {
      costsByMonth.set(key, (costsByMonth.get(key) ?? 0) + purchaseAmountToCents(inv.total_price_excl_tax));
    }
  }

  const revenueExclTax = revenueByMonth.get(month) ?? 0;
  const costsExclTax = costsByMonth.get(month) ?? 0;

  // Top cost categories for the report month
  const byCategory = new Map<string, number>();
  let uncategorized = 0;
  for (const inv of purchaseInvoices) {
    if (monthKey(inv.invoice_date) !== month) continue;
    const amount = purchaseAmountToCents(inv.total_price_excl_tax);
    const category = kostenpostByInvoiceId.get(inv.id);
    if (category) {
      byCategory.set(category, (byCategory.get(category) ?? 0) + amount);
    } else {
      uncategorized += amount;
      byCategory.set("Uncategorized", (byCategory.get("Uncategorized") ?? 0) + amount);
    }
  }
  const topCostCategories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => ({
      name,
      amount,
      share: costsExclTax > 0 ? amount / costsExclTax : 0,
    }));

  // BTW reserve: current quarter (of the report month), quarter to date
  const { key: quarterKey, months: quarterMonths } = quarterOf(month);
  let salesVat = 0;
  let purchaseVat = 0;
  for (const inv of realSales) {
    const key = monthKey(inv.invoice_date);
    if (key && quarterMonths.has(key)) {
      salesVat += salesAmountToCents(inv.total_price_incl_tax) - salesAmountToCents(inv.total_price_excl_tax);
    }
  }
  for (const inv of purchaseInvoices) {
    const key = monthKey(inv.invoice_date);
    if (key && quarterMonths.has(key)) {
      purchaseVat += inv.tax !== undefined
        ? purchaseAmountToCents(inv.tax)
        : purchaseAmountToCents(inv.total_price_incl_tax) - purchaseAmountToCents(inv.total_price_excl_tax);
    }
  }

  // Cash outlook from unpaid invoices (any date)
  let expectedIn = 0;
  let overdueIn = 0;
  for (const inv of salesInvoices) {
    if (!SALES_UNPAID_STATES.has(inv.state)) continue;
    const amount = salesAmountToCents(inv.total_price_incl_tax);
    expectedIn += amount;
    if (inv.state === "late" || (inv.due_date && inv.due_date < todayStr)) {
      overdueIn += amount;
    }
  }
  let expectedOut = 0;
  for (const inv of purchaseInvoices) {
    if (!PURCHASE_UNPAID_STATES.has(inv.state)) continue;
    expectedOut += purchaseAmountToCents(inv.total_price_incl_tax);
  }

  return {
    month,
    revenueExclTax,
    costsExclTax,
    result: revenueExclTax - costsExclTax,
    prevMonth,
    prevRevenueExclTax: revenueByMonth.get(prevMonth) ?? 0,
    prevCostsExclTax: costsByMonth.get(prevMonth) ?? 0,
    topCostCategories,
    uncategorizedShare: costsExclTax > 0 ? uncategorized / costsExclTax : 0,
    btwReserve: {
      quarter: quarterKey,
      salesVat,
      purchaseVat,
      net: salesVat - purchaseVat,
    },
    cashOutlook: {
      expectedIn,
      overdueIn,
      expectedOut,
      net: expectedIn - expectedOut,
    },
    trend: trendMonths.map((m) => ({
      month: m,
      revenue: revenueByMonth.get(m) ?? 0,
      costs: costsByMonth.get(m) ?? 0,
    })),
    truncated,
  };
}

/**
 * Kostenpost names per processed invoice, from the local processing log.
 * (Until invoice details are fetched per invoice, this local attribution
 * is the cheap source of truth for cost categories.)
 */
function loadKostenpostAttribution(ledgerNames: Map<string, string>): Map<string, string> {
  const result = new Map<string, string>();
  try {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT invoice_id, state FROM processing_log
      WHERE error IS NULL
      ORDER BY processed_at ASC
    `).all() as Array<{ invoice_id: string; state: string }>;

    for (const row of rows) {
      try {
        const state = JSON.parse(row.state);
        if (state.kostenpostId) {
          result.set(row.invoice_id, ledgerNames.get(state.kostenpostId) ?? state.kostenpostId);
        }
      } catch {
        // Unparseable snapshot — skip
      }
    }
  } catch (error) {
    console.log(JSON.stringify({
      level: "warn",
      event: "monthly_report_attribution_failed",
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));
  }
  return result;
}

/**
 * Fetch data and compute the report for the month before `now`.
 */
export async function generateMonthlyReport(now: Date = new Date()): Promise<MonthlyReport> {
  const client = new MoneybirdMCPClient();
  const currentMonth = now.toISOString().slice(0, 7);
  const reportMonth = previousMonthKey(currentMonth);

  const [salesResult, purchaseResult] = await Promise.all([
    client.listAllInvoices({ maxPages: 20 }),
    client.listAllPurchaseInvoices({ maxPages: 20 }),
  ]);

  let ledgerNames = new Map<string, string>();
  try {
    const accounts = await client.listLedgerAccounts();
    ledgerNames = new Map(accounts.map((a) => [a.id, a.name]));
  } catch {
    // Category names degrade to raw IDs
  }

  return computeMonthlyReport({
    month: reportMonth,
    todayStr: now.toISOString().split("T")[0],
    salesInvoices: salesResult.items,
    purchaseInvoices: purchaseResult.items,
    kostenpostByInvoiceId: loadKostenpostAttribution(ledgerNames),
    truncated: salesResult.truncated || purchaseResult.truncated,
  });
}

const euros = (cents: number): string => `€${(cents / 100).toFixed(2)}`;

function deltaLabel(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? "(new)" : "";
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `(${sign}${pct.toFixed(0)}% vs ${euros(previous)})`;
}

function formatReportText(report: MonthlyReport): string {
  const lines: string[] = [
    `Monthly report ${report.month}`,
    ``,
    `Revenue (excl. BTW): ${euros(report.revenueExclTax)} ${deltaLabel(report.revenueExclTax, report.prevRevenueExclTax)}`,
    `Costs (excl. BTW): ${euros(report.costsExclTax)} ${deltaLabel(report.costsExclTax, report.prevCostsExclTax)}`,
    `Result: ${euros(report.result)}`,
  ];

  if (report.topCostCategories.length > 0) {
    lines.push(``, `Top cost categories:`);
    for (const cat of report.topCostCategories) {
      lines.push(`• ${cat.name}: ${euros(cat.amount)} (${(cat.share * 100).toFixed(0)}%)`);
    }
    if (report.uncategorizedShare > 0.25) {
      lines.push(`(${(report.uncategorizedShare * 100).toFixed(0)}% of costs uncategorized — processed before the agent tracked kostenposten)`);
    }
  }

  lines.push(
    ``,
    `BTW reserve ${report.btwReserve.quarter} (to date): zet ~${euros(Math.max(0, report.btwReserve.net))} apart`,
    `  Charged on sales: ${euros(report.btwReserve.salesVat)} | Voorbelasting: ${euros(report.btwReserve.purchaseVat)}`,
    ``,
    `Cash outlook:`,
    `• Expected in (open invoices): ${euros(report.cashOutlook.expectedIn)}${report.cashOutlook.overdueIn > 0 ? ` — of which OVERDUE: ${euros(report.cashOutlook.overdueIn)}` : ""}`,
    `• Expected out (open bills): ${euros(report.cashOutlook.expectedOut)}`,
    `• Net: ${euros(report.cashOutlook.net)}`,
    ``,
    `6-month trend (revenue / costs):`
  );
  for (const t of report.trend) {
    lines.push(`• ${t.month}: ${euros(t.revenue)} / ${euros(t.costs)}`);
  }

  if (report.truncated) {
    lines.push(``, `⚠️ Some invoice lists hit the pagination cap — figures may be incomplete.`);
  }

  lines.push(``, `Note: months attributed by invoice date (accrual basis). Compare with Moneybird's Winst & verlies for the authoritative view.`);
  return lines.join("\n");
}

/**
 * Generate and send the monthly report for the previous month.
 */
export async function sendMonthlyReport(now: Date = new Date()): Promise<void> {
  try {
    const report = await generateMonthlyReport(now);
    const text = formatReportText(report);
    const html = `<pre style="font-family: Arial, sans-serif; white-space: pre-wrap;">${text}</pre>`;

    await sendNotification(
      `📈 Monthly report ${report.month} — result ${euros(report.result)}`,
      text,
      html
    );

    console.log(JSON.stringify({
      level: "info",
      event: "monthly_report_sent",
      month: report.month,
      revenue: report.revenueExclTax,
      costs: report.costsExclTax,
      result: report.result,
      truncated: report.truncated,
      timestamp: new Date().toISOString(),
    }));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "monthly_report_failed",
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));
  }
}
