/**
 * MCP Tool Test Script
 * 
 * Tests Moneybird MCP tool integration
 * Usage: npm run test:mcp
 */

import { MoneybirdMCPClient } from "../moneybird/mcpClient.js";

async function testListAdministrations() {
  console.log("Testing listAdministrations...");
  try {
    const client = new MoneybirdMCPClient();
    const administrations = await client.listAdministrations();
    console.log("✅ listAdministrations:", administrations.length, "administrations found");
    if (administrations.length > 0) {
      console.log("   First administration:", administrations[0]);
    }
    return true;
  } catch (error) {
    console.error("❌ listAdministrations failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

async function testListContacts() {
  console.log("Testing listContacts...");
  try {
    const client = new MoneybirdMCPClient();
    const contacts = await client.listContacts({ per_page: "5" });
    console.log("✅ listContacts:", contacts.length, "contacts found");
    if (contacts.length > 0) {
      console.log("   First contact:", {
        id: contacts[0].id,
        name: contacts[0].company_name || `${contacts[0].firstname} ${contacts[0].lastname}`,
      });
    }
    return true;
  } catch (error) {
    console.error("❌ listContacts failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

async function testGetContact() {
  console.log("Testing getContact...");
  try {
    const client = new MoneybirdMCPClient();
    // First, get a list to find an ID
    const contacts = await client.listContacts({ per_page: "1" });
    if (contacts.length === 0) {
      console.log("⚠️  No contacts available to test getContact");
      return true; // Not a failure, just no data
    }
    
    const contactId = contacts[0].id;
    const contact = await client.getContact(contactId);
    console.log("✅ getContact:", contact.id, contact.company_name || `${contact.firstname} ${contact.lastname}`);
    return true;
  } catch (error) {
    console.error("❌ getContact failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

async function testCreateContact() {
  console.log("Testing createContact...");
  try {
    const client = new MoneybirdMCPClient();
    const testContact = {
      company_name: `Test Company ${Date.now()}`,
      email: `test${Date.now()}@example.com`,
    };
    
    const contact = await client.createContact(testContact);
    console.log("✅ createContact: Created contact", contact.id, contact.company_name);
    
    // Clean up - delete the test contact (if MCP supports it)
    // For now, we'll leave it as it's a test
    return true;
  } catch (error) {
    console.error("❌ createContact failed:", error instanceof Error ? error.message : error);
    return false;
  }
}

async function main() {
  console.log("🧪 Starting MCP tool tests...\n");
  
  const results = {
    listAdministrations: false,
    listContacts: false,
    getContact: false,
    createContact: false,
  };
  
  results.listAdministrations = await testListAdministrations();
  console.log("");
  
  results.listContacts = await testListContacts();
  console.log("");
  
  results.getContact = await testGetContact();
  console.log("");
  
  results.createContact = await testCreateContact();
  console.log("");
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  console.log(`\n📊 Test Results: ${passed}/${total} passed`);
  
  if (passed === total) {
    console.log("✅ All MCP tests passed!");
    process.exit(0);
  } else {
    console.log("❌ Some tests failed");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
