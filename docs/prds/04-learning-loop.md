# PRD: Correction-Based Learning Loop

## Problem

The learning system only learns from itself. `recordKostenpostMapping`
(`src/storage/learning.ts`) is called in exactly one place —
`classifyKostenpost.ts` — and only when the *agent's own* confidence is
≥ 80%. The `corrections` table has a writer API (`recordCorrection`) that is
**never called from anywhere**, and neither table is ever read to adjust
future behavior beyond the single "previous mapping" hint in the
classification prompt.

Concretely: if the agent books "Hetzner" to *Hosting* and the user moves it
to *Software & subscriptions* in Moneybird, the agent never notices. Next
month it books Hetzner to *Hosting* again — with a +10 confidence boost from
its own reinforced mapping. The system gets more confidently wrong over
time, and the user's corrections are wasted effort.

## Goals

- Every manual correction the user makes in Moneybird becomes training
  signal automatically — no extra user action required.
- Repeated corrections change agent behavior: the corrected kostenpost wins,
  and confidence reflects the user's history, not just the model's opinion.
- The user can see what the agent has learned (auditability).

## Non-Goals

- Model fine-tuning or any cloud-side learning; all learning stays in the
  local SQLite database (consistent with the project's privacy stance).
- Learning contact-matching or amount-extraction corrections in v1 (record
  them, but only kostenpost corrections change behavior initially).
- Real-time webhooks from Moneybird (polling is sufficient).

## Current State

- `processing_log` stores the full agent state JSON per processed invoice,
  including `kostenpostId` chosen and confidence — this is the "what the
  agent did" side of the diff.
- `processed_invoices` tracks status (`completed` / `review` / `failed`).
- The Moneybird purchase invoice details (`getPurchaseInvoice`) expose the
  booked ledger account after user edits — the "what the user kept" side.
  (The `details` array with `ledger_account_id` needs to be added to the
  response mapping in `mcpClient.ts`; the raw MCP response already carries
  it.)

## Functional Requirements

### Reconciliation job

1. **FR1** — A new scheduled job (`reconcileCorrections`, runs daily before
   the daily summary) scans invoices processed 2–14 days ago from
   `processing_log` and re-fetches each from Moneybird.
2. **FR2** — For each invoice, diff agent decision vs. current state in
   Moneybird:
   - kostenpost (ledger account) changed → `recordCorrection(type:
     "kostenpost", original, corrected)`
   - contact changed → `recordCorrection(type: "contact", ...)`
   - amounts/date changed → `recordCorrection(type: "amount" | "date", ...)`
   - invoice deleted → `recordCorrection(type: "rejected")`
3. **FR3** — Each invoice is reconciled at most once (new column
   `reconciled_at` on `processed_invoices`; only re-check while inside the
   14-day window and unreconciled).
4. **FR4** — A kostenpost correction immediately updates
   `supplier_kostenpost_mappings`: decrement/delete the wrong mapping,
   upsert the corrected one with `confidence = 1.0`.

### Behavior change in classification

5. **FR5** — `classifyKostenpost` reads correction history for the supplier:
   - A user-corrected mapping (source: correction) overrides the LLM when
     the supplier matches exactly and the mapping was used/confirmed ≥ 2
     times: skip the LLM entirely, confidence 98, reasoning "user-confirmed
     mapping (n× )".
   - A mapping contradicted by a recent correction gets its stored
     confidence halved instead of the current flat +10 boost.
6. **FR6** — Add `source` column to `supplier_kostenpost_mappings`
   (`agent` | `correction`) so user-derived knowledge outranks
   self-reinforcement.

### Visibility

7. **FR7** — Daily summary gains a "📚 Learned this week" section when
   corrections were detected: "Hetzner: Hosting → Software (will apply next
   time)".
8. **FR8** — Correction rate (corrections / auto-booked invoices, rolling
   30 days) is logged with each daily summary — this is the agent's real
   accuracy KPI.

## Technical Design

- New module `src/agent/reconcile.ts`; scheduled from `scheduler/cron.ts`
  one hour before `DAILY_SUMMARY_TIME` so fresh learnings appear in the
  summary.
- Schema migration in `storage/db.ts` (`ALTER TABLE` guarded by pragma
  `user_version`): `processed_invoices.reconciled_at`,
  `supplier_kostenpost_mappings.source`.
- `mcpClient.getPurchaseInvoice` mapping extended with
  `details: [{ id, ledger_account_id, amount, ... }]`.
- Comparison uses the ledger account of the invoice's first detail line
  (v1 assumption: single-line purchase invoices; multi-line invoices are
  skipped and logged).

## Success Metrics

- Correction rate (FR8) trends down month over month.
- A supplier corrected twice is never mis-booked a third time.
- ≥ 90% of manual Moneybird edits on agent-processed invoices are captured
  as corrections within 48h.

## Risks & Mitigations

- **User edits vs. accountant edits vs. agent edits are indistinguishable**:
  anything that differs from the agent's final decision counts as a
  correction — that is the intended signal regardless of who made it.
- **Multi-line invoices**: excluded in v1 (logged), to avoid wrong diffs.
- **State JSON drift**: `processing_log.state` parsing already has
  defensive try/catch in `summary.ts`; reuse the same tolerance.

## Estimated Effort

Medium. One new job, two small migrations, one node change, summary surface.
