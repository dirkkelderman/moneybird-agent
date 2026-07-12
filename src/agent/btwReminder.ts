/**
 * BTW (VAT) Quarterly Reminder
 *
 * Sends a preparation report for the Dutch quarterly BTW filing.
 * Runs on the 1st of January/April/July/October: the previous quarter has
 * just closed and the filing is due before the end of the current month.
 *
 * Uses the aggregation logic in nodes/btwPreparation.ts and pushes the
 * result through the configured notification channels.
 */

import { getBTWQuarterlyData, validateBTWData } from "./nodes/btwPreparation.js";
import { sendNotification } from "../notifications/index.js";

/**
 * Determine the most recently completed quarter relative to a date.
 */
export function getPreviousQuarter(now: Date = new Date()): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const currentQuarter = Math.floor(now.getUTCMonth() / 3) + 1;
  if (currentQuarter === 1) {
    return { year: now.getUTCFullYear() - 1, quarter: 4 };
  }
  return { year: now.getUTCFullYear(), quarter: (currentQuarter - 1) as 1 | 2 | 3 };
}

/**
 * Last day of the month in which the BTW filing for the given quarter is due
 * (the month following the quarter's end).
 */
export function getBTWFilingDeadline(year: number, quarter: 1 | 2 | 3 | 4): string {
  const deadlineMonth = quarter * 3 + 1; // month after quarter end (1-based)
  const deadlineYear = deadlineMonth > 12 ? year + 1 : year;
  const normalizedMonth = deadlineMonth > 12 ? deadlineMonth - 12 : deadlineMonth;
  // Day 0 of the next month = last day of normalizedMonth
  const lastDay = new Date(Date.UTC(deadlineYear, normalizedMonth, 0));
  return lastDay.toISOString().split("T")[0];
}

const euros = (cents: number): string => `€${(cents / 100).toFixed(2)}`;

/**
 * Generate and send the BTW preparation report for the previous quarter.
 */
export async function sendBTWQuarterlyReminder(now: Date = new Date()): Promise<void> {
  const { year, quarter } = getPreviousQuarter(now);

  try {
    const data = await getBTWQuarterlyData(year, quarter);
    const validation = validateBTWData(data);
    const deadline = getBTWFilingDeadline(year, quarter);

    const vatLines = Object.entries(data.vat_by_rate)
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([rate, amount]) => `• ${rate}%: ${euros(amount)}`)
      .join("\n");

    const issueLines = [
      ...validation.errors.map((e) => `❌ ${e}`),
      ...validation.warnings.map((w) => `⚠️ ${w}`),
    ].join("\n");

    const lines: string[] = [
      `BTW voorbereiding ${data.quarter} (${data.invoices.length} inkoopfacturen)`,
      ``,
      `Totaal excl. BTW: ${euros(data.total_excl_tax)}`,
      `Totaal incl. BTW: ${euros(data.total_incl_tax)}`,
      `Totaal BTW (voorbelasting): ${euros(data.total_vat)}`,
      ``,
      `BTW per tarief:`,
      vatLines || `• geen`,
    ];

    if (data.reverse_charge_count > 0) {
      lines.push(``, `BTW verlegd: ${data.reverse_charge_count} facturen, ${euros(data.reverse_charge_amount)}`);
    }
    if (issueLines) {
      lines.push(``, `Controlepunten:`, issueLines);
    }

    if (data.truncated) {
      lines.push(
        ``,
        `⚠️ Let op: niet alle inkoopfacturen konden worden opgehaald (paginalimiet bereikt). Deze totalen kunnen onvolledig zijn — controleer het volledige overzicht in Moneybird.`
      );
    }

    lines.push(
      ``,
      `📅 Aangifte deadline: ${deadline}`,
      ``,
      `Let op: dit overzicht bevat alleen inkoopfacturen (voorbelasting). Controleer je omzet-BTW in Moneybird voor de volledige aangifte.`
    );

    const message = lines.join("\n");

    const htmlMessage = `<pre style="font-family: Arial, sans-serif; white-space: pre-wrap;">${message}</pre>`;

    await sendNotification(
      `🧾 BTW aangifte voorbereiding ${data.quarter} - deadline ${deadline}`,
      message,
      htmlMessage
    );

    console.log(JSON.stringify({
      level: "info",
      event: "btw_quarterly_reminder_sent",
      quarter: data.quarter,
      invoice_count: data.invoices.length,
      total_vat: data.total_vat,
      is_valid: validation.isValid,
      timestamp: new Date().toISOString(),
    }));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "btw_quarterly_reminder_failed",
      year,
      quarter,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));
  }
}
