# PRD: Interactive Review via Telegram

## Problem

When the agent isn't confident enough to auto-book (confidence < 95%, new
supplier, high amount), it sends a one-way alert and marks the invoice
`review` in the local DB. The user must then open Moneybird, find the
invoice, re-derive the context the agent already had (proposed kostenpost,
matched transaction, extraction), and finish the booking by hand. In
practice flagged invoices pile up, and the agent gets no signal about
whether its proposal was actually right — review outcomes are exactly the
training data the learning loop (PRD 04) wants.

## Goals

- Clear a flagged invoice in ≤ 10 seconds from the phone for the common
  case ("the proposal was right, just approve it").
- Every review outcome (approve / change / reject) is recorded as
  learning signal.
- Safe by default: approving books a **draft**, same as auto-book today.

## Non-Goals

- A web dashboard or inline PDF viewing.
- Multi-user approval flows (project is explicitly single-user).
- WhatsApp/email interactivity (Telegram only in v1; others keep one-way
  alerts).
- Free-text chat with the agent.

## Current State

- `alert.ts` sends a text-only notification via `sendErrorAlert` and marks
  the invoice processed with status `review`; the full proposal (contact,
  kostenpost, matched transaction, confidences) is in `processing_log.state`.
- `telegram.ts` only *sends* messages via `sendMessage`; nothing receives.
  Telegram supports `inline_keyboard` buttons and callback queries via
  long-polling (`getUpdates`) — no public webhook endpoint needed, which
  fits the VPS deployment.
- `autoBook.ts` already contains the complete "apply decision to Moneybird"
  logic (update invoice, link transaction).

## Functional Requirements

### Review message

1. **FR1** — When action is `flag_review` or `alert_user`, the Telegram
   alert becomes a review card:
   ```
   🧾 Review needed — Hetzner Online GmbH
   €54.45 incl. BTW · invoice R0012345 · 2026-07-03
   Proposal: kostenpost "Hosting" (87%)
   Bank match: -€54.45 on 2026-07-04 (92%)
   Flags: new supplier
   ```
   with buttons: `✅ Approve` · `✏️ Kostenpost…` · `❌ Reject` ·
   `🔍 Open in Moneybird` (URL button).
2. **FR2** — `✅ Approve`: executes the same booking path as `autoBook`
   (update draft + link transaction), edits the message to
   "✅ Booked (draft) — {timestamp}", records the mapping as user-confirmed
   (PRD 04 FR5/FR6 semantics).
3. **FR3** — `✏️ Kostenpost…`: replaces buttons with the top-6 ledger
   accounts (top-2 LLM alternatives + most-used from learning DB); picking
   one books with that account and records a `kostenpost` correction.
4. **FR4** — `❌ Reject`: marks `processed_invoices.status = 'rejected'`,
   makes no Moneybird change, records a `rejected` correction. Invoice stays
   untouched for manual handling.
5. **FR5** — Buttons are idempotent: after any action the keyboard is
   removed; stale callbacks answer "already handled".

### Transport & security

6. **FR6** — A long-polling loop (`getUpdates` with 30s timeout) runs inside
   the existing process, started from `index.ts`; no inbound port opened.
7. **FR7** — Callback queries are only honored from chat IDs in
   `TELEGRAM_CHAT_IDS`; anything else is answered with "unauthorized" and
   logged.
8. **FR8** — Callback payloads carry `{action, reviewId}` only (Telegram
   caps callback data at 64 bytes); all invoice context is looked up
   server-side from a new `pending_reviews` table.
9. **FR9** — Pending reviews expire after `REVIEW_TTL_DAYS` (default 14):
   buttons are removed and the invoice appears in the daily summary as
   "still awaiting review".

## Technical Design

- New table:
  ```sql
  CREATE TABLE pending_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id TEXT NOT NULL,
    proposal TEXT NOT NULL,        -- JSON: contact/kostenpost/tx/confidences
    telegram_message_id TEXT,
    telegram_chat_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- pending|approved|changed|rejected|expired
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    resolved_at TEXT
  );
  ```
- New module `src/notifications/telegramBot.ts`: polling loop, callback
  dispatch, keyboard builders. Booking execution is refactored out of
  `autoBook.ts` into a shared `src/agent/bookInvoice.ts` used by both the
  graph node and the approval handler (single source of truth for the
  write path).
- `alert.ts` writes the `pending_reviews` row and sends the card instead of
  the current plain alert (plain alert remains the fallback when Telegram
  is not configured).
- Polling loop failures must never crash the process: isolate with its own
  try/catch + restart-with-backoff.

## Success Metrics

- Median time from flag → resolution drops from hours/days to minutes.
- ≥ 70% of flagged invoices resolved via Telegram (vs. manually in
  Moneybird) after one month.
- Every resolved review produces a row in `corrections` or a confirmed
  mapping.

## Risks & Mitigations

- **Double-booking race** (user approves while a new cron run reprocesses):
  invoice is already marked processed at alert time today, so the graph
  won't pick it up again; the approval handler re-checks invoice state in
  Moneybird before writing.
- **Long-poll conflicts**: only one `getUpdates` consumer may run per bot
  token. Guard with a startup check and document that the bot token must be
  dedicated to this agent.
- **Larger blast radius of a leaked bot token**: token can now trigger
  bookings; mitigated by FR7 chat-ID allowlist (already the trust model for
  alerts) and draft-only writes.

## Estimated Effort

Large. New polling infrastructure, one refactor (`bookInvoice`), one table,
UX iteration on the card layout.
