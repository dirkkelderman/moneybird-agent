/**
 * Manual Test Script
 * 
 * Run this to test individual components without full integration.
 * Usage: npm run test:manual
 */

import { getEnv } from "../config/env.js";
import { getDatabase } from "../storage/db.js";
import { createInitialState } from "../agent/state.js";
import { detectNewInvoices } from "../agent/nodes/detectNewInvoices.js";
import { checkCompleteness } from "../agent/nodes/checkCompleteness.js";
import { confidenceGate } from "../agent/nodes/confidenceGate.js";

async function testDatabase() {
  console.log("Testing database setup...");
  const db = getDatabase();
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    )
    .all() as Array<{ name: string }>;
  
  console.log("✅ Database initialized");
  console.log("Tables:", tables.map((t) => t.name).join(", "));
}

async function testEnv() {
  console.log("Testing environment configuration...");
  try {
    const env = getEnv();
    console.log("✅ Environment loaded");
    console.log("OpenAI Model:", env.OPENAI_MODEL);
    console.log("Database Path:", env.DATABASE_PATH);
    console.log("Confidence Auto Threshold:", env.CONFIDENCE_AUTO_THRESHOLD);
  } catch (error) {
    console.error("❌ Environment error:", error);
    throw error;
  }
}

async function testState() {
  console.log("Testing state creation...");
  const state = createInitialState();
  console.log("✅ State created");
  console.log("State keys:", Object.keys(state));
}

async function testNodes() {
  console.log("Testing node functions...");
  
  // Test with empty state
  const initialState = createInitialState();
  
  try {
    const result1 = await detectNewInvoices(initialState);
    console.log("✅ detectNewInvoices:", result1.currentNode);
  } catch (error) {
    console.error("❌ detectNewInvoices error:", error);
  }
  
  // Test completeness check with mock invoice
  const stateWithInvoice = createInitialState({
    invoice: {
      id: "test-123",
      total_price_excl_tax: 100,
      total_price_incl_tax: 121,
      tax: 21,
      currency: "EUR",
      state: "draft",
      invoice_date: "2024-01-01",
    } as any,
  });
  
  try {
    const result2 = await checkCompleteness(stateWithInvoice);
    console.log("✅ checkCompleteness:", result2.currentNode);
  } catch (error) {
    console.error("❌ checkCompleteness error:", error);
  }
  
  // Test confidence gate
  const stateWithConfidence = createInitialState({
    overallConfidence: 96,
    action: "auto_book",
  });
  
  try {
    const result3 = await confidenceGate(stateWithConfidence);
    console.log("✅ confidenceGate:", result3.action, result3.overallConfidence);
  } catch (error) {
    console.error("❌ confidenceGate error:", error);
  }
}

async function main() {
  console.log("🧪 Starting manual tests...\n");
  
  try {
    await testEnv();
    console.log("");
    
    await testDatabase();
    console.log("");
    
    await testState();
    console.log("");
    
    await testNodes();
    console.log("");
    
    console.log("✅ All manual tests completed!");
  } catch (error) {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }
}

main();
