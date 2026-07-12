# PRD: Monthly Financial Report

## Problem

The agent automates data entry but gives no financial insight. The daily
summary answers "what did the agent do?"; nothing answers "how is my
business doing?" — revenue trend, cost structure, how much BTW to set
aside, expected cash position. For a ZZP'er this is the report an
accountant would send monthly, and all the underlying data is already
reachable through the existing `MoneybirdMCPClient`.

## Goals

- On the 1st of each month, a report that answers in one read:
  1. What did I earn and spend last month, and vs. the month before?
  2. Where did the money go (top cost categories)?
  3. How much BTW should I have set aside so far this quarter?
  4. What cash is coming in / going out (open invoices vs. open bills)?
- Zero new data entry or configuration for the default experience.

## Non-Goals

- Replacing the quarterly BTW preparation report (separate, existing
  feature) — the monthly report only shows a running BTW *reserve* estimate.
- Balance-sheet accounting, depreciation, or income-tax estimation.
- Interactive dashboards; this is a push report over the existing channels.
- Bank-balance tracking (financial account balances aren't reliably exposed
  via the current MCP tools; "expected cash movement" is derived from open
  invoices/bills instead).

## Current State

- Sales invoices: `listInvoices` (amounts in currency units; states include
  `open`, `late`, `paid`).
- Purchase invoices: `listPurchaseInvoices` (amounts in cents — note the
  unit asymmetry, a known trap).
- Ledger accounts: `listLedgerAccounts` gives kostenpost names for grouping;
  purchase-invoice → kostenpost attribution can come from the local
  `supplier_kostenpost_mappings` + `processing_log` until invoice `details`
  are mapped (PRD 04 adds that).
- Scheduler already supports cron-based jobs (`scheduler/cron.ts`).

## Functional Requirements

### Content

1. **FR1 — Result summary**: revenue (sales invoices by invoice_date in the
   month, excl. BTW), costs (purchase invoices, excl. BTW), result
   (revenue − costs), each with absolute and % delta vs. previous month.
2. **FR2 — Cost breakdown**: top 5 kostenposten by spend with amounts and
   share; remainder bucketed as "other".
3. **FR3 — BTW reserve**: BTW charged on sales minus voorbelasting on
   purchases, accumulated for the current quarter to date → "zet ~€X apart
   voor de BTW-aangifte".
4. **FR4 — Cash outlook**: sum of open/late sales invoices (expected in,
   with overdue portion highlighted — reuses `receivables.ts`) and open
   purchase invoices (expected out), netted into "expected cash movement".
5. **FR5 — Trend**: 6-month mini-trend of revenue and costs (text-based in
   Telegram/WhatsApp, small table in email).

### Delivery

6. **FR6** — Sent on the 1st of each month at `DAILY_SUMMARY_TIME` + 1h via
   the existing `sendNotification` multi-channel path; email gets a full
   HTML layout, Telegram/WhatsApp a compact version.
7. **FR7** — Env vars: `MONTHLY_REPORT_ENABLED` (default true).
8. **FR8** — Manual trigger export `triggerMonthlyReport()` for testing,
   mirroring `triggerBTWReminder()`.

## Technical Design

- New module `src/agent/monthlyReport.ts`:
  - `generateMonthlyReport(year, month): MonthlyReport` (pure aggregation,
    unit-testable) + `sendMonthlyReport()` (fetch, format, notify).
  - Normalizes the cents-vs-units asymmetry at the fetch boundary into one
    `Money` representation (cents everywhere internally) — single place
    where the asymmetry is allowed to exist.
- Uses paginated fetchers from PRD 03; without them the report must emit
  the truncation warning (PRD 03 FR3).
- Formatters live with the other channel formatters in
  `src/notifications/`.
- Month attribution by `invoice_date` (accrual basis — matches how BTW
  works for most ZZP'ers), not payment date. Stated explicitly in the
  report footer.

## Success Metrics

- Report totals match Moneybird's own "Winst & verlies" view for the same
  month within rounding.
- User stops needing to open Moneybird for the monthly "how am I doing"
  check (qualitative).

## Risks & Mitigations

- **Unit confusion (cents vs. units)** is the highest defect risk — the
  existing codebase already shows both conventions. Mitigated by the single
  normalization boundary + unit tests with fixtures from both APIs (PRD 07).
- **Kostenpost attribution gaps** (purchase invoices processed before the
  agent existed have no local mapping): bucket as "uncategorized" rather
  than guessing; percentage of uncategorized shown so trust is calibrated.
- **Quarter-boundary edge cases** in the BTW reserve: reuse the
  quarter-window logic already validated in `btwReminder.ts`.

## Estimated Effort

Medium. One aggregation module, three formatters, one cron entry. Benefits
significantly from PRDs 03 (pagination) and 07 (test harness) landing first.
