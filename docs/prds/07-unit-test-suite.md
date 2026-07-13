# PRD: Unit Test Suite

## Problem

`src/test/` contains 16 files, but they are all *manual integration
scripts* (hit real Moneybird/OpenAI/Telegram, run via `npm run test:*`).
`npm test` invokes jest, but jest is not in `devDependencies` and there are
zero automated tests, so CI (`.github/workflows/ci.yml`) effectively only
type-checks. Meanwhile the codebase is full of pure money-handling logic
where a silent bug costs real euros: confidence averaging, BTW aggregation,
amount normalization (the cents-vs-currency-units split), date-window
matching, overdue detection.

Recent examples of the class of bug tests would catch: the final-state
extraction in `cron.ts` that always logged `invoice_id: undefined`, and a
blank-line filter bug found during review of `btwReminder.ts` message
building.

## Goals

- The financially sensitive pure logic is covered by fast, deterministic
  unit tests that run in CI on every PR.
- A test harness exists so new features (PRDs 01–06) ship with tests by
  default.
- `npm test` actually works.

## Non-Goals

- End-to-end tests against real Moneybird/OpenAI (existing manual scripts
  remain for that; they move to `src/test/manual/` for clarity).
- Coverage targets for glue code (index.ts, notification transports).
- Testing LangGraph wiring itself (framework behavior).

## Current State

- `package.json` declares `"test": "node --experimental-vm-modules
  node_modules/jest/bin/jest.js"` but jest is not installed.
- The project is ESM (`"type": "module"`) + TypeScript — a combination
  where **vitest** requires zero configuration while jest requires the
  experimental VM modules flag and ts-jest/babel setup. Recommendation:
  switch to vitest.
- Several units are pure already (`validateBTWData`, `exportBTWDataAsCSV`,
  `getPreviousQuarter`, `getBTWFilingDeadline`, `confidenceGate`); others
  need light refactoring to become testable (extract pure helpers from
  nodes that currently construct their own `MoneybirdMCPClient`).

## Functional Requirements

1. **FR1** — `npm test` runs vitest; `npm run test:watch` for local dev.
   Manual scripts move to `src/test/manual/` and keep their npm aliases.
2. **FR2** — CI runs lint → typecheck → test on every push/PR;
   the workflow fails on test failure.
3. **FR3** — Priority-ordered test targets (v1 scope):
   | Unit | Cases that must be covered |
   |---|---|
   | `confidenceGate` | averaging, missing decisions, new-supplier/high-amount/requiresReview overrides, threshold boundaries (exactly 95 / 80) |
   | `getBTWQuarterlyData` aggregation + `validateBTWData` | rate bucketing, reverse-charge detection, 1-cent tolerance, quarter date ranges incl. Q4→Jan |
   | `getPreviousQuarter` / `getBTWFilingDeadline` | all four quarters, year rollover |
   | `receivables` filtering/sorting | due-date boundary (due today ≠ overdue), `late` state without due_date, dedupe across states, string amounts |
   | Amount normalization in `autoBook` | cents vs. extraction units, credit-note negatives, undefined passthrough |
   | `salesPaymentMatcher` windowing | 1% tolerance boundary, date window edges, used-mutation exclusion, contact-fallback uniqueness rule |
   | `routeAfterCompleteness` | each missing-field branch, tax `0` vs `undefined` distinction |
   | Daily summary generation | log parsing tolerance (bad JSON rows), error/action aggregation |
4. **FR4** — DB-dependent units (`storage/learning.ts`, `storage/db.ts`)
   tested against an in-memory SQLite (`better-sqlite3` `:memory:`) — no
   mocking needed, real SQL exercised.
5. **FR5** — Units that call Moneybird get a thin injected client interface
   (constructor/parameter injection) so tests pass fakes; no network in any
   unit test, enforced by test setup that stubs `fetch` to throw.
6. **FR6** — Shared fixtures in `src/test/fixtures/`: realistic MCP
   responses for both amount conventions (purchase = cents, sales =
   currency units, including string amounts) so the unit asymmetry is
   pinned down by tests.

## Technical Design

- Refactor pattern (small, mechanical): nodes like `matchTransactions`
  keep their LangGraph signature but delegate to exported pure functions
  (e.g. `filterCandidateTransactions(invoice, transactions, now)`) which
  are what tests target. LLM-dependent behavior is tested around the LLM:
  candidate filtering in, decision application out.
- Vitest config: default ESM handling, `include: ["src/**/*.test.ts"]`,
  tests colocated next to the unit under test.
- CI: add `npm test` step to `.github/workflows/ci.yml` after typecheck.

## Success Metrics

- CI fails when money math regresses (verified by mutation-style spot
  check: flip a `>=` to `>` in `confidenceGate` locally → a test fails).
- All PRD 01–06 implementations land with tests using this harness.
- Suite runtime < 10 seconds.

## Risks & Mitigations

- **Refactor risk while extracting pure functions**: keep extractions
  behavior-preserving and small; land the harness + already-pure targets
  first (BTW, receivables, confidenceGate), refactor-dependent targets
  incrementally.
- **ESM/tooling friction**: vitest chosen specifically to avoid the jest
  ESM flag dance; if the team prefers jest, budget extra setup time.

## Estimated Effort

Medium. One-time harness setup is small; the listed v1 targets are ~8 test
files, several against already-pure functions.
