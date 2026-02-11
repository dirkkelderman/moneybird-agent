/**
 * Test Sales Payments Matcher
 *
 * Runs the sales payment matcher once against the current administration.
 * This will:
 * - fetch open sales invoices
 * - fetch bank transactions
 * - link high-confidence matches using MCP (preferred) or REST fallback
 */

import { initializeMCPClient, closeMCPClient } from "../moneybird/mcpConnection.js";
import { matchSalesInvoicePayments } from "../agent/salesPaymentMatcher.js";

async function testSalesPayments() {
  console.log("🧪 Testing Sales Payments Matcher\n");

  try {
    await initializeMCPClient();
    console.log("✅ MCP client initialized\n");
  } catch (error) {
    console.error("❌ Failed to initialize MCP client:", error);
    process.exit(1);
  }

  try {
    await matchSalesInvoicePayments();
    console.log("\n✅ Sales payments matcher completed");
  } catch (error) {
    console.error("\n❌ Sales payments matcher failed:", error);
    if (error instanceof Error) {
      console.error("   Message:", error.message);
      console.error("   Stack:", error.stack);
    }
    process.exit(1);
  } finally {
    await closeMCPClient();
    console.log("\n✅ MCP client closed");
  }
}

testSalesPayments().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

