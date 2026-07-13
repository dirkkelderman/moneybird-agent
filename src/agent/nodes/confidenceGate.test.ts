import { describe, it, expect } from "vitest";
import { confidenceGate } from "./confidenceGate.js";
import type { AgentState } from "../state.js";

const decision = (confidence: number, requiresReview = false) => ({
  confidence,
  reasoning: "test",
  requiresReview,
});

const baseState = (overrides: Partial<AgentState> = {}): AgentState =>
  ({
    invoice: {
      id: "inv-1",
      total_price_excl_tax: 10000,
      total_price_incl_tax: 12100,
      currency: "EUR",
      state: "draft",
    },
    isNewContact: false,
    ...overrides,
  }) as AgentState;

describe("confidenceGate", () => {
  it("averages all present decision confidences", async () => {
    const result = await confidenceGate(
      baseState({
        contactMatchDecision: decision(100),
        validationDecision: decision(90),
        kostenpostDecision: decision(80),
        matchDecision: decision(70),
      })
    );
    expect(result.overallConfidence).toBe(85);
  });

  it("ignores missing decisions instead of counting them as zero", async () => {
    const result = await confidenceGate(
      baseState({
        contactMatchDecision: decision(96),
        kostenpostDecision: decision(96),
      })
    );
    expect(result.overallConfidence).toBe(96);
    expect(result.action).toBe("auto_book");
  });

  it("auto-books at exactly the auto threshold (95)", async () => {
    const result = await confidenceGate(baseState({ validationDecision: decision(95) }));
    expect(result.action).toBe("auto_book");
  });

  it("flags for review just below the auto threshold", async () => {
    const result = await confidenceGate(baseState({ validationDecision: decision(94.9) }));
    expect(result.action).toBe("flag_review");
  });

  it("flags for review at exactly the review threshold (80)", async () => {
    const result = await confidenceGate(baseState({ validationDecision: decision(80) }));
    expect(result.action).toBe("flag_review");
  });

  it("alerts the user below the review threshold", async () => {
    const result = await confidenceGate(baseState({ validationDecision: decision(79.9) }));
    expect(result.action).toBe("alert_user");
  });

  it("alerts with zero confidence when no decisions exist", async () => {
    const result = await confidenceGate(baseState());
    expect(result.overallConfidence).toBe(0);
    expect(result.action).toBe("alert_user");
  });

  it("a new supplier overrides high confidence", async () => {
    const result = await confidenceGate(
      baseState({ isNewContact: true, validationDecision: decision(100) })
    );
    expect(result.action).toBe("alert_user");
  });

  it("a high amount overrides high confidence", async () => {
    const state = baseState({ validationDecision: decision(100) });
    state.invoice!.total_price_incl_tax = 100001; // > €1000 default threshold
    const result = await confidenceGate(state);
    expect(result.action).toBe("alert_user");
  });

  it("any requiresReview flag overrides high confidence", async () => {
    const result = await confidenceGate(
      baseState({
        validationDecision: decision(100),
        kostenpostDecision: decision(100, true),
      })
    );
    expect(result.action).toBe("alert_user");
  });
});
