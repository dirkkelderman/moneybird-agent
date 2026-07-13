/**
 * Pending Reviews Store
 *
 * Invoices awaiting an interactive (Telegram) review decision. The
 * proposal column stores the full JSON snapshot needed to finish the
 * booking on approval — Telegram callback data only carries the review id.
 */

import { getDatabase } from "./db.js";

export type ReviewStatus = "pending" | "approved" | "changed" | "rejected" | "expired";

export interface PendingReviewRow {
  id: number;
  invoice_id: string;
  proposal: string; // JSON ReviewProposal
  telegram_message_id: string | null;
  telegram_chat_id: string | null;
  status: ReviewStatus;
  created_at: string;
  resolved_at: string | null;
}

export function createPendingReview(invoiceId: string, proposalJson: string): number {
  const db = getDatabase();
  const result = db.prepare(`
    INSERT INTO pending_reviews (invoice_id, proposal) VALUES (?, ?)
  `).run(invoiceId, proposalJson);
  return Number(result.lastInsertRowid);
}

export function setReviewMessage(id: number, chatId: string, messageId: string): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE pending_reviews SET telegram_chat_id = ?, telegram_message_id = ? WHERE id = ?
  `).run(chatId, messageId, id);
}

export function getPendingReview(id: number): PendingReviewRow | null {
  const db = getDatabase();
  const row = db.prepare(`SELECT * FROM pending_reviews WHERE id = ?`).get(id) as
    | PendingReviewRow
    | undefined;
  return row ?? null;
}

export function resolveReview(id: number, status: Exclude<ReviewStatus, "pending">): void {
  const db = getDatabase();
  db.prepare(`
    UPDATE pending_reviews SET status = ?, resolved_at = datetime('now')
    WHERE id = ? AND status = 'pending'
  `).run(status, id);
}

/** Pending reviews older than ttlDays, for the expiry sweep */
export function listExpiredReviews(ttlDays: number): PendingReviewRow[] {
  const db = getDatabase();
  return db.prepare(`
    SELECT * FROM pending_reviews
    WHERE status = 'pending' AND created_at <= datetime('now', ?)
  `).all(`-${ttlDays} days`) as PendingReviewRow[];
}

export function countPendingReviews(): number {
  const db = getDatabase();
  const row = db.prepare(`SELECT COUNT(*) AS n FROM pending_reviews WHERE status = 'pending'`).get() as { n: number };
  return row.n;
}
