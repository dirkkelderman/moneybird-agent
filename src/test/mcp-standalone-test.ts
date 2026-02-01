/**
 * MCP Standalone Test
 * 
 * Tests the MCP connection in a standalone Node.js environment.
 * This verifies that the MCP client can connect and use tools.
 */

import { initializeMCPClient, isMCPInitialized, closeMCPClient } from "../moneybird/mcpConnection.js";
import { MoneybirdMCPClient } from "../moneybird/mcpClient.js";

async function testMCPConnection() {
  console.log("🧪 Testing MCP Connection in Standalone Node.js\n");

  // Test 1: Initialize MCP Client
  console.log("Test 1: Initialize MCP Client");
  try {
    await initializeMCPClient();
    if (isMCPInitialized()) {
      console.log("✅ MCP client initialized successfully");
    } else {
      console.log("⚠️  MCP client not initialized (MCP_SERVER_COMMAND may not be set)");
      console.log("   This is OK if you're testing without MCP server configured");
      return;
    }
  } catch (error) {
    console.log("⚠️  MCP initialization failed:", error instanceof Error ? error.message : String(error));
    console.log("   This is expected if MCP_SERVER_COMMAND is not configured");
    return;
  }
  console.log("");

  // Test 2: Use MoneybirdMCPClient
  console.log("Test 2: Use MoneybirdMCPClient with MCP tools");
  const client = new MoneybirdMCPClient();

  try {
    const administrations = await client.listAdministrations();
    console.log("✅ listAdministrations():", administrations.length, "found");
    administrations.forEach((admin) => {
      console.log(`   - ${admin.name} (${admin.id})`);
    });
  } catch (error) {
    console.log("❌ listAdministrations() failed:", error instanceof Error ? error.message : String(error));
  }
  console.log("");

  try {
    const contacts = await client.listContacts({ per_page: "3" });
    console.log("✅ listContacts():", contacts.length, "found");
    contacts.slice(0, 2).forEach((contact) => {
      const name = contact.company_name || `${contact.firstname} ${contact.lastname}`.trim() || "Unknown";
      console.log(`   - ${name} (${contact.id})`);
    });
  } catch (error) {
    console.log("❌ listContacts() failed:", error instanceof Error ? error.message : String(error));
  }
  console.log("");

  // Cleanup
  await closeMCPClient();
  console.log("✅ MCP client closed");
}

testMCPConnection().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
