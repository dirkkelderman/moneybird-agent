/**
 * Retry & Backoff for Moneybird calls
 *
 * Wraps MCP tool invocations (and REST fallbacks) with bounded retries and
 * exponential backoff with jitter. Transient failures (network blips,
 * 429/5xx, dropped MCP connections) self-heal within a run instead of
 * costing an hour until the next cron tick.
 *
 * Policy:
 * - Reads and idempotent writes (update/delete): retry any retryable error.
 * - Non-idempotent writes (create/link): retry ONLY errors that guarantee
 *   the request never reached Moneybird (connection refused, DNS) or an
 *   explicit 429 — a duplicated contact or double-linked mutation is worse
 *   than a missed hour.
 */

import { getEnv } from "../config/env.js";

export interface RetryOptions {
  /** Maximum retry attempts after the initial call. Defaults to MCP_MAX_RETRIES. */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (1s, 2s, 4s, ...). */
  baseDelayMs?: number;
  /** Conservative policy for non-idempotent writes (create/link). */
  nonIdempotentWrite?: boolean;
  /** Operation name for structured retry logs. */
  label?: string;
  /** Called before retrying a connection-level error (e.g. reconnect MCP). */
  onConnectionError?: () => Promise<void>;
}

// Node/undici error codes for network-level failures
const NETWORK_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

// Codes that guarantee the request never reached the server —
// the only network errors safe to retry for non-idempotent writes.
const SAFE_WRITE_ERROR_CODES = new Set(["ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]);

// Message fragments indicating a transient transport/connection problem
const TRANSIENT_MESSAGE_PATTERNS = [
  "fetch failed",
  "socket hang up",
  "terminated",
  "network",
  "connection closed",
  "connection reset",
  "not connected",
  "premature close",
  "sse error",
  "timed out",
  "timeout",
];

function getErrorCode(error: unknown): string | undefined {
  let current: any = error;
  // Walk the cause chain (undici wraps network errors in TypeError with .cause)
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current.code === "string") return current.code;
    current = current.cause;
  }
  return undefined;
}

/** Status carried as an explicit property on the error (trustworthy) */
function getExplicitStatus(error: unknown): number | undefined {
  const err = error as any;
  if (typeof err?.status === "number") return err.status;
  if (typeof err?.response?.status === "number") return err.response.status;
  return undefined;
}

function getHttpStatus(error: unknown): number | undefined {
  const explicit = getExplicitStatus(error);
  if (explicit !== undefined) return explicit;
  // Fall back to extracting a status code from the message
  // (client methods embed "... failed: 503 Service Unavailable ...").
  // Heuristic only — never used to justify replaying a non-idempotent write.
  const err = error as any;
  const message = err instanceof Error ? err.message : String(err ?? "");
  const match = message.match(/\b(408|429|500|502|503|504)\b/);
  return match ? Number(match[1]) : undefined;
}

/** Connection-level errors that may be fixed by reconnecting the MCP client */
export function isConnectionError(error: unknown): boolean {
  const code = getErrorCode(error);
  if (code && NETWORK_ERROR_CODES.has(code)) return true;
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  return (
    message.includes("connection closed") ||
    message.includes("not connected") ||
    message.includes("transport") ||
    message.includes("socket hang up")
  );
}

/**
 * Decide whether an error is worth retrying under the given policy.
 * Permanent errors (401/403/404/422, validation, missing MCP tools) always
 * fail fast.
 */
export function isRetryableError(
  error: unknown,
  opts: { nonIdempotentWrite: boolean }
): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();

  // Permanent conditions — never retry
  if (message.includes("mcp tools not available")) return false;
  if (/\b(400|401|403|404|422)\b/.test(message)) return false;

  const status = getHttpStatus(error);
  const code = getErrorCode(error);

  if (opts.nonIdempotentWrite) {
    // 429 means the server rejected before processing — safe to retry,
    // but only when the status is an explicit property, not scraped from
    // the message (a "429" there could be an amount or an ID).
    if (getExplicitStatus(error) === 429) return true;
    // Only network errors where the request never left this machine
    return code !== undefined && SAFE_WRITE_ERROR_CODES.has(code);
  }

  if (status !== undefined && (status === 408 || status === 429 || status >= 500)) {
    return true;
  }
  if (code && NETWORK_ERROR_CODES.has(code)) return true;
  return TRANSIENT_MESSAGE_PATTERNS.some((pattern) => message.includes(pattern));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run fn with bounded retries and exponential backoff with jitter.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const env = getEnv();
  const maxRetries = options.maxRetries ?? env.MCP_MAX_RETRIES;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const nonIdempotentWrite = options.nonIdempotentWrite ?? false;

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const retriesLeft = maxRetries - attempt;
      if (retriesLeft <= 0 || !isRetryableError(error, { nonIdempotentWrite })) {
        throw error;
      }

      if (isConnectionError(error) && options.onConnectionError) {
        try {
          await options.onConnectionError();
        } catch {
          // Reconnect failures surface on the retried call itself
        }
      }

      // Exponential backoff with full jitter; rate limits get a floor of 5s
      const exponential = baseDelayMs * 2 ** attempt;
      const isRateLimited = getHttpStatus(error) === 429;
      const delayMs = Math.min(
        30_000,
        Math.max(isRateLimited ? 5_000 : 0, exponential * (0.5 + Math.random() * 0.5))
      );

      console.log(JSON.stringify({
        level: "warn",
        event: "mcp_call_retrying",
        label: options.label,
        attempt: attempt + 1,
        max_retries: maxRetries,
        delay_ms: Math.round(delayMs),
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));

      await sleep(delayMs);
    }
  }
}

/**
 * Non-idempotent write detection by MCP tool name. Creates and links must
 * not be replayed on ambiguous failures; updates/deletes are idempotent
 * and reads are always safe.
 */
export function isNonIdempotentWriteTool(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return name.includes("create") || name.includes("link") || name.includes("send");
}
