import { describe, it, expect } from "vitest";
import { withRetry, isRetryableError, isNonIdempotentWriteTool } from "./retry.js";

const withCause = (message: string, code: string): Error =>
  Object.assign(new TypeError(message), { cause: { code } });
const withStatus = (message: string, status: number): Error =>
  Object.assign(new Error(message), { status });

describe("isRetryableError (reads / idempotent writes)", () => {
  it("retries network errors via the cause chain", () => {
    expect(isRetryableError(withCause("fetch failed", "ECONNRESET"), { nonIdempotentWrite: false })).toBe(true);
  });

  it("retries 5xx and 429 from message or property", () => {
    expect(isRetryableError(new Error("failed: 503 Service Unavailable"), { nonIdempotentWrite: false })).toBe(true);
    expect(isRetryableError(withStatus("boom", 500), { nonIdempotentWrite: false })).toBe(true);
    expect(isRetryableError(withStatus("slow down", 429), { nonIdempotentWrite: false })).toBe(true);
  });

  it("fails fast on permanent statuses", () => {
    expect(isRetryableError(new Error("MCP error: 422 Unprocessable"), { nonIdempotentWrite: false })).toBe(false);
    expect(isRetryableError(new Error("HTTP 401 Unauthorized"), { nonIdempotentWrite: false })).toBe(false);
    expect(isRetryableError(new Error("404 Not Found"), { nonIdempotentWrite: false })).toBe(false);
  });

  it("fails fast when MCP tools are unavailable", () => {
    expect(
      isRetryableError(new Error("MCP tools not available and REST API fallback not implemented"), {
        nonIdempotentWrite: false,
      })
    ).toBe(false);
  });

  it("retries transient transport messages", () => {
    expect(isRetryableError(new Error("Connection closed"), { nonIdempotentWrite: false })).toBe(true);
    expect(isRetryableError(new Error("Request timed out"), { nonIdempotentWrite: false })).toBe(true);
  });

  it("does not retry unknown errors", () => {
    expect(isRetryableError(new Error("something odd"), { nonIdempotentWrite: false })).toBe(false);
  });
});

describe("isRetryableError (non-idempotent writes)", () => {
  it("retries only request-never-sent network errors", () => {
    expect(isRetryableError(withCause("fetch failed", "ECONNREFUSED"), { nonIdempotentWrite: true })).toBe(true);
    // Ambiguous mid-flight timeout must NOT be replayed
    expect(isRetryableError(withCause("fetch failed", "ETIMEDOUT"), { nonIdempotentWrite: true })).toBe(false);
  });

  it("trusts 429 only as an explicit property, never scraped from the message", () => {
    expect(isRetryableError(withStatus("rate limited", 429), { nonIdempotentWrite: true })).toBe(true);
    // "429" in text could be an amount or an id — do not replay
    expect(isRetryableError(new Error("link failed for price_base 429"), { nonIdempotentWrite: true })).toBe(false);
  });

  it("does not retry ambiguous 5xx", () => {
    expect(isRetryableError(withStatus("boom", 503), { nonIdempotentWrite: true })).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns the first success without retrying", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      return 42;
    }, { baseDelayMs: 1 });
    expect(result).toBe(42);
    expect(calls).toBe(1);
  });

  it("retries a transient failure then succeeds", async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw withCause("fetch failed", "ECONNRESET");
      return "ok";
    }, { baseDelayMs: 1 });
    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("throws immediately on a permanent error", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new Error("MCP error: 422 Unprocessable");
      }, { baseDelayMs: 1 })
    ).rejects.toThrow("422");
    expect(calls).toBe(1);
  });

  it("gives up after maxRetries and rethrows the last error", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw withCause("fetch failed", "ECONNRESET");
      }, { baseDelayMs: 1, maxRetries: 2 })
    ).rejects.toThrow("fetch failed");
    expect(calls).toBe(3); // initial + 2 retries
  });

  it("honors maxRetries 0 as retries disabled", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw withCause("fetch failed", "ECONNRESET");
      }, { baseDelayMs: 1, maxRetries: 0 })
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });

  it("invokes onConnectionError before retrying connection errors", async () => {
    let reconnects = 0;
    let calls = 0;
    await withRetry(async () => {
      calls++;
      if (calls === 1) throw new Error("Connection closed");
      return "ok";
    }, {
      baseDelayMs: 1,
      onConnectionError: async () => {
        reconnects++;
      },
    });
    expect(reconnects).toBe(1);
  });
});

describe("isNonIdempotentWriteTool", () => {
  it("flags creates, links and sends", () => {
    expect(isNonIdempotentWriteTool("create_contact")).toBe(true);
    expect(isNonIdempotentWriteTool("mcp_Moneybird_create_purchase_invoice")).toBe(true);
    expect(isNonIdempotentWriteTool("link_booking")).toBe(true);
  });

  it("treats reads, updates and deletes as safely retryable", () => {
    expect(isNonIdempotentWriteTool("list_contacts")).toBe(false);
    expect(isNonIdempotentWriteTool("get_purchase_invoice")).toBe(false);
    expect(isNonIdempotentWriteTool("update_purchase_invoice")).toBe(false);
    expect(isNonIdempotentWriteTool("delete_purchase_invoice")).toBe(false);
  });
});
