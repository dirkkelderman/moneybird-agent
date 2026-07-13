/**
 * Telegram Review Bot
 *
 * Interactive review of flagged invoices from the phone:
 * review cards with ✅ Approve / ✏️ Kostenpost / ❌ Reject buttons,
 * received via long-polling (getUpdates) — no inbound port needed.
 *
 * Security model:
 * - Callback queries are only honored from chat IDs in TELEGRAM_CHAT_IDS.
 * - Callback data carries only {action, reviewId}; all invoice context is
 *   looked up server-side from the pending_reviews table.
 * - Approving books a DRAFT, exactly like auto-book.
 *
 * Note: the kostenpost picker corrects the agent's learning (and future
 * classifications); Moneybird's ledger line itself is not rewritten —
 * the MCP update tool doesn't expose invoice details.
 */

import { getEnv } from "../config/env.js";
import { executeBooking, type BookingProposal } from "../agent/bookInvoice.js";
import { markInvoiceProcessed } from "../storage/db.js";
import {
  createPendingReview,
  getPendingReview,
  resolveReview,
  setReviewMessage,
  listExpiredReviews,
} from "../storage/reviews.js";
import {
  recordCorrection,
  recordKostenpostMapping,
  applyKostenpostCorrection,
} from "../storage/learning.js";

/** Snapshot stored in pending_reviews.proposal */
export interface ReviewProposal {
  invoiceId: string;
  supplierName?: string;
  amountInclTax?: number; // cents
  invoiceDate?: string;
  reference?: string;
  kostenpostId?: string;
  kostenpostName?: string;
  kostenpostConfidence?: number;
  transactionDescription?: string;
  matchConfidence?: number;
  flags: string[];
  booking: BookingProposal;
  kostenpostOptions: Array<{ id: string; name: string }>;
}

let running = false;
let allowedChatIds: string[] = [];
let lastExpirySweep = 0;

async function tgApi(method: string, body: Record<string, unknown>): Promise<any> {
  const env = getEnv();
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as any;
  if (!response.ok || !data?.ok) {
    throw new Error(`Telegram ${method} failed: ${data?.description || response.statusText}`);
  }
  return data.result;
}

const euros = (cents: number | undefined): string =>
  cents === undefined ? "?" : `€${(cents / 100).toFixed(2)}`;

function reviewCardText(proposal: ReviewProposal, statusLine?: string): string {
  const lines = [
    `🧾 <b>Review needed</b> — ${proposal.supplierName || "unknown supplier"}`,
    `${euros(proposal.amountInclTax)} incl. BTW${proposal.reference ? ` · ${proposal.reference}` : ""}${proposal.invoiceDate ? ` · ${proposal.invoiceDate}` : ""}`,
  ];
  if (proposal.kostenpostName) {
    lines.push(`Proposal: kostenpost "${proposal.kostenpostName}"${proposal.kostenpostConfidence !== undefined ? ` (${Math.round(proposal.kostenpostConfidence)}%)` : ""}`);
  }
  if (proposal.booking.transactionId) {
    lines.push(`Bank match: ${proposal.transactionDescription || proposal.booking.transactionId}${proposal.matchConfidence !== undefined ? ` (${Math.round(proposal.matchConfidence)}%)` : ""}`);
  }
  if (proposal.flags.length > 0) {
    lines.push(`Flags: ${proposal.flags.join(", ")}`);
  }
  if (statusLine) {
    lines.push(``, statusLine);
  }
  return lines.join("\n");
}

function mainKeyboard(reviewId: number): object {
  const env = getEnv();
  const rows: Array<Array<Record<string, string>>> = [
    [
      { text: "✅ Approve", callback_data: `rv:a:${reviewId}` },
      { text: "✏️ Kostenpost…", callback_data: `rv:c:${reviewId}` },
    ],
    [{ text: "❌ Reject", callback_data: `rv:r:${reviewId}` }],
  ];
  if (env.MONEYBIRD_ADMINISTRATION_ID) {
    rows[1].push({
      text: "🔍 Open in Moneybird",
      url: `https://moneybird.com/${env.MONEYBIRD_ADMINISTRATION_ID}/documents`,
    });
  }
  return { inline_keyboard: rows };
}

function pickerKeyboard(reviewId: number, options: Array<{ id: string; name: string }>): object {
  const rows = options.slice(0, 6).map((opt, idx) => [
    { text: opt.name.substring(0, 40), callback_data: `rv:k:${reviewId}:${idx}` },
  ]);
  rows.push([{ text: "← Back", callback_data: `rv:x:${reviewId}` }]);
  return { inline_keyboard: rows };
}

/**
 * Create a pending review and send the interactive card to the first
 * configured chat. Returns false when Telegram is not configured.
 */
export async function sendReviewCard(proposal: ReviewProposal): Promise<boolean> {
  const env = getEnv();
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_IDS) {
    return false;
  }
  const chatId = env.TELEGRAM_CHAT_IDS.split(",")[0].trim();

  const reviewId = createPendingReview(proposal.invoiceId, JSON.stringify(proposal));

  const message = await tgApi("sendMessage", {
    chat_id: chatId,
    text: reviewCardText(proposal),
    parse_mode: "HTML",
    reply_markup: mainKeyboard(reviewId),
  });

  setReviewMessage(reviewId, chatId, String(message.message_id));

  console.log(JSON.stringify({
    level: "info",
    event: "review_card_sent",
    review_id: reviewId,
    invoice_id: proposal.invoiceId,
    chat_id: chatId,
    timestamp: new Date().toISOString(),
  }));

  return true;
}

async function editCard(
  chatId: string,
  messageId: string,
  text: string,
  replyMarkup?: object
): Promise<void> {
  await tgApi("editMessageText", {
    chat_id: chatId,
    message_id: Number(messageId),
    text,
    parse_mode: "HTML",
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

async function answerCallback(callbackQueryId: string, text?: string): Promise<void> {
  try {
    await tgApi("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    });
  } catch {
    // Best effort — an unanswered callback only leaves a spinner
  }
}

async function handleCallback(callback: any): Promise<void> {
  const callbackId: string = callback.id;
  const chatId = String(callback.message?.chat?.id ?? "");
  const messageId = String(callback.message?.message_id ?? "");
  const data: string = callback.data ?? "";

  if (!allowedChatIds.includes(chatId)) {
    console.log(JSON.stringify({
      level: "warn",
      event: "review_callback_unauthorized",
      chat_id: chatId,
      timestamp: new Date().toISOString(),
    }));
    await answerCallback(callbackId, "Unauthorized");
    return;
  }

  const match = data.match(/^rv:(a|c|r|k|x):(\d+)(?::(\d+))?$/);
  if (!match) {
    await answerCallback(callbackId);
    return;
  }
  const action = match[1];
  const reviewId = Number(match[2]);
  const optionIdx = match[3] !== undefined ? Number(match[3]) : undefined;

  const review = getPendingReview(reviewId);
  if (!review || review.status !== "pending") {
    await answerCallback(callbackId, "Already handled");
    return;
  }

  let proposal: ReviewProposal;
  try {
    proposal = JSON.parse(review.proposal) as ReviewProposal;
  } catch {
    await answerCallback(callbackId, "Corrupt review data");
    resolveReview(reviewId, "expired");
    return;
  }

  try {
    switch (action) {
      case "a": {
        // Approve: same write path as auto-book
        await executeBooking(proposal.booking);
        markInvoiceProcessed(proposal.invoiceId, "completed");
        if (proposal.kostenpostId && proposal.kostenpostName && proposal.supplierName) {
          // Approval is a user confirmation of the proposed mapping
          recordKostenpostMapping({
            supplier_name: proposal.supplierName,
            kostenpost_id: proposal.kostenpostId,
            kostenpost_name: proposal.kostenpostName,
            confidence: 1.0,
            source: "correction",
          });
        }
        resolveReview(reviewId, "approved");
        await editCard(
          chatId,
          messageId,
          reviewCardText(proposal, `✅ <b>Booked (draft)</b> — ${new Date().toISOString().replace("T", " ").substring(0, 16)} UTC`)
        );
        await answerCallback(callbackId, "Booked as draft");
        break;
      }
      case "c": {
        // Show the kostenpost picker
        await tgApi("editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: Number(messageId),
          reply_markup: pickerKeyboard(reviewId, proposal.kostenpostOptions),
        });
        await answerCallback(callbackId);
        break;
      }
      case "x": {
        // Back to the main keyboard
        await tgApi("editMessageReplyMarkup", {
          chat_id: chatId,
          message_id: Number(messageId),
          reply_markup: mainKeyboard(reviewId),
        });
        await answerCallback(callbackId);
        break;
      }
      case "k": {
        const option = optionIdx !== undefined ? proposal.kostenpostOptions[optionIdx] : undefined;
        if (!option) {
          await answerCallback(callbackId, "Unknown option");
          return;
        }
        await executeBooking(proposal.booking);
        markInvoiceProcessed(proposal.invoiceId, "completed");
        recordCorrection({
          invoice_id: proposal.invoiceId,
          correction_type: "kostenpost",
          original_value: proposal.kostenpostName,
          corrected_value: option.name,
          notes: proposal.supplierName,
        });
        if (proposal.supplierName) {
          applyKostenpostCorrection({
            supplier_name: proposal.supplierName,
            wrong_kostenpost_id: proposal.kostenpostId,
            corrected_kostenpost_id: option.id,
            corrected_kostenpost_name: option.name,
          });
        }
        resolveReview(reviewId, "changed");
        await editCard(
          chatId,
          messageId,
          reviewCardText(proposal, `✅ <b>Booked (draft)</b> with kostenpost "${option.name}" — learning updated`)
        );
        await answerCallback(callbackId, `Booked with ${option.name}`);
        break;
      }
      case "r": {
        markInvoiceProcessed(proposal.invoiceId, "rejected");
        recordCorrection({
          invoice_id: proposal.invoiceId,
          correction_type: "rejected",
          original_value: proposal.kostenpostName,
          notes: proposal.supplierName,
        });
        resolveReview(reviewId, "rejected");
        await editCard(
          chatId,
          messageId,
          reviewCardText(proposal, `❌ <b>Rejected</b> — invoice left untouched in Moneybird`)
        );
        await answerCallback(callbackId, "Rejected");
        break;
      }
    }
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "review_callback_failed",
      review_id: reviewId,
      action,
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));
    await answerCallback(callbackId, "Failed — see logs");
  }
}

async function expireOldReviews(): Promise<void> {
  const env = getEnv();
  for (const review of listExpiredReviews(env.REVIEW_TTL_DAYS)) {
    resolveReview(review.id, "expired");
    if (review.telegram_chat_id && review.telegram_message_id) {
      try {
        let proposal: ReviewProposal | null = null;
        try {
          proposal = JSON.parse(review.proposal) as ReviewProposal;
        } catch { /* keep null */ }
        await editCard(
          review.telegram_chat_id,
          review.telegram_message_id,
          proposal
            ? reviewCardText(proposal, `⌛ <b>Expired</b> after ${env.REVIEW_TTL_DAYS} days — handle manually in Moneybird`)
            : `⌛ Review expired`
        );
      } catch {
        // Message may be deleted; expiry still recorded
      }
    }
    console.log(JSON.stringify({
      level: "info",
      event: "review_expired",
      review_id: review.id,
      invoice_id: review.invoice_id,
      timestamp: new Date().toISOString(),
    }));
  }
}

/**
 * Start the long-polling loop. No-op when Telegram is not configured.
 * Failures never crash the process: the loop restarts with backoff.
 */
export function startTelegramReviewBot(): void {
  const env = getEnv();
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_IDS) {
    console.log(JSON.stringify({
      level: "info",
      event: "telegram_review_bot_disabled",
      reason: "TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_IDS not configured",
      timestamp: new Date().toISOString(),
    }));
    return;
  }
  if (running) return;

  allowedChatIds = env.TELEGRAM_CHAT_IDS.split(",").map((id) => id.trim());
  running = true;

  console.log(JSON.stringify({
    level: "info",
    event: "telegram_review_bot_started",
    allowed_chats: allowedChatIds.length,
    timestamp: new Date().toISOString(),
  }));

  void (async () => {
    let offset = 0;
    let backoffMs = 1000;

    while (running) {
      try {
        const updates = await tgApi("getUpdates", {
          offset,
          timeout: 30,
          allowed_updates: ["callback_query"],
        });

        for (const update of updates as any[]) {
          offset = Math.max(offset, update.update_id + 1);
          if (update.callback_query) {
            await handleCallback(update.callback_query);
          }
        }

        backoffMs = 1000; // Healthy cycle resets backoff

        // Hourly expiry sweep, piggybacked on the poll loop
        if (Date.now() - lastExpirySweep > 60 * 60 * 1000) {
          lastExpirySweep = Date.now();
          await expireOldReviews();
        }
      } catch (error) {
        console.error(JSON.stringify({
          level: "error",
          event: "telegram_poll_failed",
          error: error instanceof Error ? error.message : String(error),
          retry_in_ms: backoffMs,
          note: "If this repeats with a 409, another getUpdates consumer is using this bot token.",
          timestamp: new Date().toISOString(),
        }));
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
        backoffMs = Math.min(backoffMs * 2, 60_000);
      }
    }
  })();
}

export function stopTelegramReviewBot(): void {
  running = false;
}
