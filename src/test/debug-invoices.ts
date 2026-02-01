/**
 * Debug: Check what invoices are returned
 */

import { initializeMCPClient, closeMCPClient } from "../moneybird/mcpConnection.js";
import { MoneybirdMCPClient } from "../moneybird/mcpClient.js";

async function debugInvoices() {
  await initializeMCPClient();
  const client = new MoneybirdMCPClient();
  
  console.log("📋 Fetching all purchase invoices...\n");
  
  const invoices = await client.listPurchaseInvoices({ per_page: "50" });
  
  console.log(`Found ${invoices.length} invoices:\n`);
  
  invoices.forEach((inv, i) => {
    console.log(`${i + 1}. ID: ${inv.id}`);
    console.log(`   State: ${inv.state}`);
    console.log(`   Amount: €${(inv.total_price_incl_tax / 100).toFixed(2)}`);
    console.log(`   Contact: ${inv.contact_id || "NONE"}`);
    console.log(`   Date: ${inv.invoice_date || "NONE"}`);
    console.log("");
  });
  
  // Check for our specific invoice
  const targetInvoice = invoices.find(inv => inv.id === "477720684313708316");
  if (targetInvoice) {
    console.log("✅ Target invoice FOUND in list!");
    console.log(`   State: ${targetInvoice.state}`);
  } else {
    console.log("❌ Target invoice NOT FOUND in list");
    console.log("   This means it's either:");
    console.log("   - Not in the first 50 invoices");
    console.log("   - Filtered out by Moneybird");
    console.log("   - Not accessible via MCP");
  }
  
  await closeMCPClient();
}

debugInvoices().catch(console.error);
