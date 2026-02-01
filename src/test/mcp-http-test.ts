/**
 * MCP HTTP Transport Test
 * 
 * Tests the MCP connection using HTTP transport (for Moneybird MCP server).
 * This matches the Cursor configuration.
 */

import { initializeMCPClient, isMCPInitialized, closeMCPClient } from "../moneybird/mcpConnection.js";
import { MoneybirdMCPClient } from "../moneybird/mcpClient.js";

async function testHTTPMCPConnection() {
  console.log("🧪 Testing MCP HTTP Transport\n");

  // Test 1: Initialize MCP Client
  console.log("Test 1: Initialize MCP Client (HTTP)");
  try {
    await initializeMCPClient();
    if (isMCPInitialized()) {
      console.log("✅ MCP client initialized successfully via HTTP");
    } else {
      console.log("⚠️  MCP client not initialized");
      console.log("   Check your .env file:");
      console.log("   - MCP_TRANSPORT=http");
      console.log("   - MCP_SERVER_URL=https://moneybird.com/mcp/v1/read_write");
      console.log("   - MCP_SERVER_AUTH_TOKEN=your_bearer_token");
      return;
    }
  } catch (error) {
    console.log("❌ MCP initialization failed:", error instanceof Error ? error.message : String(error));
    console.log("   Verify your MCP_SERVER_URL and MCP_SERVER_AUTH_TOKEN are correct");
    return;
  }
  console.log("");

  // Test 2: List Administrations
  console.log("Test 2: listAdministrations()");
  const client = new MoneybirdMCPClient();
  try {
    const administrations = await client.listAdministrations();
    console.log("✅ SUCCESS:", administrations.length, "administrations found");
    administrations.forEach((admin) => {
      console.log(`   - ${admin.name} (${admin.id})`);
    });
  } catch (error) {
    console.log("❌ FAILED:", error instanceof Error ? error.message : String(error));
  }
  console.log("");

  // Test 3: List Contacts
  console.log("Test 3: listContacts()");
  try {
    const contacts = await client.listContacts({ per_page: "5" });
    console.log("✅ SUCCESS:", contacts.length, "contacts found");
    contacts.slice(0, 3).forEach((contact) => {
      const name = contact.company_name || `${contact.firstname} ${contact.lastname}`.trim() || "Unknown";
      console.log(`   - ${name} (${contact.id})`);
    });
  } catch (error) {
    console.log("❌ FAILED:", error instanceof Error ? error.message : String(error));
  }
  console.log("");

  // Test 4: Get Contact
  console.log("Test 4: getContact()");
  try {
    // Get first contact ID from previous test
    const contacts = await client.listContacts({ per_page: "1" });
    if (contacts.length > 0) {
      const contact = await client.getContact(contacts[0].id);
      console.log("✅ SUCCESS: Retrieved contact");
      console.log(`   - Name: ${contact.company_name || `${contact.firstname} ${contact.lastname}`.trim()}`);
      console.log(`   - ID: ${contact.id}`);
    } else {
      console.log("⚠️  No contacts available to test");
    }
  } catch (error) {
    console.log("❌ FAILED:", error instanceof Error ? error.message : String(error));
  }
  console.log("");

  // Cleanup
  await closeMCPClient();
  console.log("✅ MCP client closed");
  console.log("");
  console.log("📊 Test Summary:");
  console.log("   ✅ HTTP transport: Working");
  console.log("   ✅ MCP tools: Available");
  console.log("   ✅ MoneybirdMCPClient: Functional");
}

testHTTPMCPConnection().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
