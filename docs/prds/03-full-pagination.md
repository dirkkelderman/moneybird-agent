# PRD: Full Pagination for Moneybird List Calls

## Problem

Every list call fetches exactly one page and silently treats it as the full
dataset:

| Call site | Page size | Consequence when exceeded |
|---|---|---|
| `detectNewInvoices.ts` | 50 | New invoices beyond page 1 invisible until earlier ones are processed |
| `btwPreparation.ts` (`getBTWQuarterlyData`) | 100 | **BTW report silently undercounts voorbelasting** — wrong tax prep numbers |
| `summary.ts` (`findUnmatchedTransactions`) | 200 | Old unmatched transactions never surface in a 90-day window with >200 mutations |
| `salesPaymentMatcher.ts` | 50 invoices / default tx page | Open invoices or candidate payments missed → fewer auto-matches |
| `receivables.ts` | 100 per state | Overdue invoices beyond page 1 missing from daily summary |
| `resolveContact.ts` contact search | default | Contact matching may miss existing contacts → duplicate creation |

The BTW case is the most serious: it produces a *plausible-looking but
wrong* financial report, which is worse than an error.

## Goals

- Every aggregation that claims completeness (BTW, unmatched transactions,
  receivables) is actually complete.
- Bounded memory and API usage — pagination with hard caps, not unbounded
  crawls.
- Explicit visibility when a cap is hit, never silent truncation.

## Non-Goals

- Streaming/cursor APIs or caching layers.
- Changing the one-invoice-at-a-time processing model of the graph
  (detectNewInvoices intentionally selects a single invoice; it just needs
  to *see* the full queue).

## Current State

- The Moneybird MCP tools accept `page` and `per_page` string params; the
  client already plumbs them through but callers pass a single page.
- Moneybird's REST API caps `per_page` at 100 — the existing
  `per_page: "200"` in `findUnmatchedTransactions` is likely already being
  clamped server-side, making that window even smaller than assumed.

## Functional Requirements

1. **FR1** — Add a generic helper to `MoneybirdMCPClient`:
   ```ts
   async listAllPages<T>(
     fetchPage: (page: string) => Promise<T[]>,
     opts?: { perPage?: number; maxPages?: number }
   ): Promise<{ items: T[]; truncated: boolean }>
   ```
   Defaults: `perPage: 100`, `maxPages: 10` (1,000 items). Stops when a page
   returns fewer than `perPage` items.
2. **FR2** — Convenience wrappers `listAllPurchaseInvoices`,
   `listAllInvoices(state)`, `listAllFinancialMutations(range)` used by the
   aggregation call sites in the table above.
3. **FR3** — When `truncated` is true, the caller emits a structured
   `pagination_cap_reached` warning **and** surfaces it to the user where the
   data is presented (e.g. a "⚠️ list may be incomplete" line in the BTW
   report / daily summary).
4. **FR4** — All hardcoded `per_page` values above 100 corrected to 100.
5. **FR5** — Per-call-site caps tuned to context: BTW aggregation
   `maxPages: 20` (a quarter can be large); daily-summary paths keep the
   default to bound run time.

## Technical Design

- `listAllPages` lives in the client so retry/backoff (PRD 02) composes
  under it — each page fetch is independently retried.
- Page loop is sequential (not parallel) to stay polite with Moneybird rate
  limits; with 100-item pages the sequential cost is negligible.
- `detectNewInvoices` switches to `listAllPurchaseInvoices` but keeps its
  existing "filter unprocessed → pick first" logic unchanged.

## Success Metrics

- BTW quarterly totals match a manual Moneybird export for the same quarter.
- Zero `pagination_cap_reached` warnings in steady state for a typical
  ZZP-scale administration; warnings visible (not silent) if scale grows.

## Risks & Mitigations

- **Longer API bursts** per run: bounded by `maxPages` and sequential
  fetching.
- **MCP server may ignore `page` param** (behavior not fully verified): the
  helper must detect identical consecutive pages (same first-item id) and
  stop, logging `pagination_not_supported`, instead of looping.

## Estimated Effort

Small. One helper, six call-site updates, one warning surface per report.
