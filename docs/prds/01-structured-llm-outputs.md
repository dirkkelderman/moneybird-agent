# PRD: Structured LLM Outputs

## Problem

Every LLM call in the agent parses the model's reply with a regex:

```ts
const jsonMatch = responseText.match(/\{[\s\S]*\}/);
if (!jsonMatch) throw new Error("No JSON found in LLM response");
const decision = JSON.parse(jsonMatch[0]);
```

This pattern appears in `classifyKostenpost.ts`, `resolveContact.ts`,
`validateInvoice.ts`, `matchTransactions.ts`, `scanInvoicePdf.ts`, and
`salesPaymentMatcher.ts`. It fails whenever the model adds prose around the
JSON, returns multiple JSON blocks (greedy match grabs the wrong span), emits
trailing commas, or omits a field. A single malformed reply crashes the node,
which routes the invoice to `alert` as an error — even though nothing was
actually wrong with the invoice. The failure also produces no usable partial
data.

Additionally, nothing validates the *shape* of the parsed JSON. A reply with
`"confidence": "high"` instead of a number flows into `confidenceGate` and
produces `NaN` averages.

## Goals

- Zero JSON-parse failures from LLM responses under normal operation.
- Every LLM decision validated against a schema before entering agent state.
- Out-of-range or missing fields rejected at the boundary with a clear error.

## Non-Goals

- Changing prompts' semantic content or the decision logic itself.
- Switching LLM providers or models.
- Retrying semantically bad decisions (that is confidence gating's job).

## Current State

- Zod schemas already exist in `src/agent/state.ts` (`AIDecisionSchema`,
  `InvoiceExtractionSchema`) but are only used as TypeScript types — they are
  never called with `.parse()`.
- The project uses `@langchain/openai`'s `ChatOpenAI`, which supports
  `withStructuredOutput(schema)` backed by OpenAI's native structured output
  / function-calling, guaranteeing schema-conformant JSON.

## Functional Requirements

1. **FR1** — All LLM calls that expect JSON use
   `llm.withStructuredOutput(zodSchema)` instead of free-text + regex.
2. **FR2** — Each call site gets a dedicated zod schema extending the
   existing ones where needed, e.g. `AIDecisionSchema.extend({
   kostenpost_id: z.string() })` for classification, and a match schema with
   `matched_transaction_id: z.string().nullable()` for transaction matching.
3. **FR3** — Schema validation failures (should be rare with structured
   output) are caught per-node and produce the node's existing error path —
   never an unhandled exception.
4. **FR4** — `confidence` fields are constrained to `z.number().min(0).max(100)`
   so invalid values are rejected at the boundary, not averaged into `NaN`.
5. **FR5** — Remove the regex-extraction helper pattern entirely once all six
   call sites are migrated, so it cannot be copied into new nodes.

## Technical Design

- Per call site:
  ```ts
  const structuredLlm = llm.withStructuredOutput(ClassificationSchema);
  const decision = await structuredLlm.invoke(prompt); // typed + validated
  ```
- Prompts keep their context sections but drop the "Return JSON: {...}"
  instruction blocks (the schema handles that), reducing prompt size.
- `scanInvoicePdf.ts` (vision call) keeps its image content blocks; only the
  response format changes.
- Schemas live next to the existing ones in `src/agent/state.ts` (or a new
  `src/agent/schemas.ts` if state.ts grows too large).

## Success Metrics

- `No JSON found in LLM response` errors in `processing_log`: currently
  recurring → zero after rollout.
- No `NaN` or out-of-range confidence values ever reach `confidenceGate`.

## Risks & Mitigations

- **Model/feature mismatch**: structured output requires a model that
  supports it. `OPENAI_MODEL` defaults to `gpt-4.1`, which does. Document the
  requirement in README next to `OPENAI_MODEL`.
- **Behavioral drift**: removing "Return JSON" boilerplate can subtly change
  responses. Mitigate by migrating one node per commit and comparing logged
  confidence distributions before/after on real traffic.

## Estimated Effort

Small. Six call sites, mechanical change, no new infrastructure.
