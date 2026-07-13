# Improvement PRDs

Product requirement documents for the next round of agent improvements.
Numbered by suggested implementation order — earlier items unblock or
amplify later ones.

| # | PRD | Theme | Effort |
|---|-----|-------|--------|
| 1 | [Structured LLM Outputs](./01-structured-llm-outputs.md) | Reliability | S |
| 2 | [MCP Retry & Backoff](./02-mcp-retry-backoff.md) | Reliability | S |
| 3 | [Full Pagination](./03-full-pagination.md) | Correctness | S |
| 4 | [Correction-Based Learning Loop](./04-learning-loop.md) | Intelligence | M |
| 5 | [Interactive Review via Telegram](./05-interactive-review.md) | UX / Intelligence | L |
| 6 | [Monthly Financial Report](./06-monthly-financial-report.md) | Insight | M |
| 7 | [Unit Test Suite](./07-unit-test-suite.md) | Quality | M |

Recommended sequencing rationale:

- **1–3 first** (reliability & correctness): they are small, reduce failure
  noise, and everything later builds on trustworthy data. Pagination in
  particular fixes a silent under-counting risk in the BTW report.
- **4 next**: the learning loop is the single biggest driver of long-term
  accuracy, and benefits from structured outputs being in place.
- **5 builds on 4**: approvals/corrections from Telegram feed the same
  learning store.
- **6 and 7** can be done independently at any point.
