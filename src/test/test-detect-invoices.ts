/**
 * Test detectNewInvoices node
 */

import { detectNewInvoices } from "../agent/nodes/detectNewInvoices.js";
import { initializeMCPClient, closeMCPClient } from "../moneybird/mcpConnection.js";
import type { AgentState } from "../agent/state.js";

async function testDetectNewInvoices() {
  console.log("🧪 Testing detectNewInvoices Node\n");

  // Initialize MCP client
  try {
    await initializeMCPClient();
    console.log("✅ MCP client initialized\n");
  } catch (error) {
    console.error("❌ Failed to initialize MCP client:", error);
    process.exit(1);
  }

  // Test with empty state
  const initialState: AgentState = {
    currentNode: "start",
    isNewContact: false,
  };

  try {
    console.log("Test: detectNewInvoices with empty state");
    const result = await detectNewInvoices(initialState);
    
    if (result.invoice) {
      console.log("✅ SUCCESS: Found invoice to process");
      console.log(`   Invoice ID: ${result.invoice.id}`);
      console.log(`   State: ${result.invoice.state}`);
      console.log(`   Amount: €${(result.invoice.total_price_incl_tax / 100).toFixed(2)}`);
      if (result.invoice.contact) {
        console.log(`   Contact: ${result.invoice.contact.company_name || `${result.invoice.contact.firstname} ${result.invoice.contact.lastname}`}`);
      } else if (result.invoice.contact_id) {
        console.log(`   Contact ID: ${result.invoice.contact_id}`);
      }
      console.log(`   Current Node: ${result.currentNode}`);
    } else if (result.error) {
      console.log("❌ ERROR:", result.error);
    } else {
      console.log("ℹ️  No new invoices found (this is normal if all invoices are processed)");
    }
  } catch (error) {
    console.error("❌ FAILED:", error);
  }

  // Cleanup
  await closeMCPClient();
  console.log("\n✅ Test completed");
}

testDetectNewInvoices().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
