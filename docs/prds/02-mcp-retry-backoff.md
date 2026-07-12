# PRD: MCP Retry & Backoff

## Problem

Every Moneybird operation goes through `MoneybirdMCPClient`
(`src/moneybird/mcpClient.ts`), which calls MCP tools exactly once. A single
transient failure — network blip, Moneybird 429/5xx, MCP server restart —
throws, the node catches it and sets `state.error`, and the invoice run is
aborted until the next hourly cron tick. With batch processing
(`MAX_INVOICES_PER_RUN`) a transient failure in `detectNewInvoices` now
kills the *entire batch*, not just one invoice.

There is also no distinction between retryable errors (timeouts, 429, 5xx)
and permanent ones (401 bad token, 404, 422 validation), so genuine
configuration errors would be retried pointlessly if naive retry were added.

## Goals

- Transient Moneybird/MCP failures self-heal within a run instead of costing
  an hour.
- Permanent errors fail fast with a clear message, exactly as today.
- No thundering retries against Moneybird when it is rate limiting.

## Non-Goals

- Circuit breaking across runs or persistent failure state.
- Retrying LLM/OpenAI calls (LangChain has its own `maxRetries` for that).
- Making non-idempotent operations magically safe (see FR4).

## Current State

- ~20 client methods each wrap one `mcpTool(...)` call in try/catch and
  rethrow with context.
- `src/moneybird/mcpConnection.ts` manages the connection lifecycle;
  reconnection on a dropped session is a related but separate concern.
- The REST fallbacks (`linkFinancialMutationToBooking`,
  `deletePurchaseInvoice`) use raw `fetch` with no retry either.

## Functional Requirements

1. **FR1** — A single shared helper `withRetry(fn, opts)` in
   `src/moneybird/retry.ts`:
   - Default: 3 attempts, exponential backoff with jitter (1s, 2s, 4s base).
   - Configurable per call site (attempts, base delay).
2. **FR2** — Error classification:
   - **Retryable**: network errors (ECONNRESET, ETIMEDOUT, fetch failures),
     HTTP 408/429/5xx, MCP transport errors, JSON-RPC internal errors.
   - **Not retryable**: HTTP 400/401/403/404/422, schema/validation errors,
     "MCP tools not available".
3. **FR3** — On HTTP 429, honor `Retry-After` when present, capped at 30s.
4. **FR4** — Idempotency rules:
   - Read operations (`list*`, `get*`, `download*`): always retryable.
   - Writes (`createContact`, `createPurchaseInvoice`,
     `linkFinancialMutationToBooking`): retry **only** on errors that
     guarantee the request never reached Moneybird (connection refused,
     DNS). Ambiguous failures (timeout mid-flight) must NOT be retried —
     a duplicated contact or double-linked mutation is worse than a missed
     hour. `updatePurchaseInvoice`/`updateContact` are idempotent and may
     retry normally.
5. **FR5** — Every retry emits a structured log event
   (`mcp_call_retrying` with attempt number, delay, error) so retry storms
   are visible in the logs.
6. **FR6** — Env var `MCP_MAX_RETRIES` (default 3, 0 disables) documented in
   README and `.env.example`.

## Technical Design

- `withRetry` wraps the `mcpTool(...)` invocation *inside* each client
  method (not around whole methods) so error-message construction and
  response transformation stay outside the retry loop.
- Classification lives in one function `isRetryableError(error, method)` so
  policy is auditable in a single place.
- The connection layer: on "connection closed / not initialized" errors,
  attempt one `initializeMCPClient()` re-init before the retry counts as
  failed (bounded to once per run to avoid loops).

## Success Metrics

- `workflow_failed` / node-level MCP errors per week drop substantially;
  transient errors appear as `mcp_call_retrying` followed by success.
- Zero duplicate contacts/invoices/links attributable to retries (audit via
  `processing_log`).

## Risks & Mitigations

- **Retrying non-idempotent writes** → duplicates. Mitigated by FR4's
  conservative write policy.
- **Longer runs**: worst case adds ~7s per failing call. Bounded by attempt
  cap; acceptable inside an hourly schedule.

## Estimated Effort

Small. One helper + classification function + mechanical adoption in the
client.
