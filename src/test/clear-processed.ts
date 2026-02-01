/**
 * Clear processed invoices for testing
 */

import { getDatabase } from "../storage/db.js";

const db = getDatabase();

console.log("🗑️  Clearing processed invoices...\n");

const result = db.prepare("DELETE FROM processed_invoices").run();

console.log(`✅ Cleared ${result.changes} processed invoice(s)\n`);
console.log("You can now test the workflow again.");
