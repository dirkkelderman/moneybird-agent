/**
 * Test Specific Invoice
 * 
 * Tests the workflow with a specific invoice that needs processing.
 * Invoice ID: 477720684313708316
 */

import { createAgentGraph } from "../agent/graph.js";
import { createInitialState } from "../agent/state.js";
import { initializeMCPClient, closeMCPClient } from "../moneybird/mcpConnection.js";
import { MoneybirdMCPClient } from "../moneybird/mcpClient.js";

async function testSpecificInvoice() {
  console.log("🧪 Testing Specific Invoice Processing\n");
  console.log("Invoice ID: 477720684313708316\n");

  // Initialize MCP client
  try {
    await initializeMCPClient();
    console.log("✅ MCP client initialized\n");
  } catch (error) {
    console.error("❌ Failed to initialize MCP client:", error);
    process.exit(1);
  }

  try {
    // First, let's check if we can access the invoice directly
    const client = new MoneybirdMCPClient();
    console.log("📋 Checking invoice status...\n");
    
    try {
      const invoice = await client.getPurchaseInvoice("477720684313708316");
      console.log("✅ Invoice found:");
      console.log(`   ID: ${invoice.id}`);
      console.log(`   State: ${invoice.state}`);
      console.log(`   Amount: €${(invoice.total_price_incl_tax / 100).toFixed(2)}`);
      console.log(`   Contact ID: ${invoice.contact_id || "NONE (needs resolution)"}`);
      console.log(`   Invoice Date: ${invoice.invoice_date || "NONE"}`);
      console.log(`   Reference: ${invoice.reference || "NONE"}`);
      const hasAttachments = invoice.attachments && invoice.attachments.length > 0;
      console.log(`   Has Attachments: ${hasAttachments ? "Yes" : "No"}`);
      if (hasAttachments && invoice.attachments) {
        console.log(`   Attachment: ${invoice.attachments[0].filename}`);
      }
      console.log("");
    } catch (error) {
      console.log(`⚠️  Could not fetch invoice directly: ${error instanceof Error ? error.message : String(error)}`);
      console.log("   Will try workflow detection instead...\n");
    }

    // Now run the workflow
    console.log("🚀 Running full workflow...\n");
    const graph = createAgentGraph();
    const initialState = createInitialState();
    
    const stream = await graph.stream(initialState);
    let finalState: any = null;
    let stepCount = 0;
    
    for await (const stateUpdate of stream) {
      finalState = stateUpdate;
      stepCount++;
      const nodeNames = Object.keys(stateUpdate).filter(key => key !== '__end__');
      if (nodeNames.length > 0) {
        console.log(`   Step ${stepCount}: ${nodeNames.join(", ")}`);
      }
    }
    
    console.log(`\n   Final state structure: ${finalState ? JSON.stringify(Object.keys(finalState)) : "null"}`);
    
    // Extract state - with Annotation API, state is accumulated across nodes
    // The final state should be in the last node output or __end__
    let state: any = {};
    if (finalState) {
      console.log(`   Debug: finalState keys: ${Object.keys(finalState).join(", ")}`);
      
      // Check all node outputs - state accumulates, so check the last one
      const nodeKeys = Object.keys(finalState).filter(k => k !== '__end__');
      console.log(`   Debug: node keys: ${nodeKeys.join(", ")}`);
      
      if (nodeKeys.length > 0) {
        // Get state from the last node (should have accumulated state)
        const lastNode = nodeKeys[nodeKeys.length - 1];
        console.log(`   Debug: checking last node: ${lastNode}`);
        const lastNodeState = finalState[lastNode];
        if (lastNodeState) {
          console.log(`   Debug: last node state keys: ${Object.keys(lastNodeState).join(", ")}`);
          state = lastNodeState;
        }
      }
      
      // Also check __end__ if available
      if (finalState.__end__) {
        console.log(`   Debug: __end__ state keys: ${Object.keys(finalState.__end__).join(", ")}`);
        state = { ...state, ...finalState.__end__ };
      }
    }
    
    console.log("\n📊 Workflow Results:\n");
    
    if (state.invoice) {
      console.log(`✅ Invoice Processed: ${state.invoice.id}`);
      console.log(`   State: ${state.invoice.state}`);
      console.log(`   Amount: €${(state.invoice.total_price_incl_tax / 100).toFixed(2)}`);
      
      if (state.contact) {
        console.log(`   ✅ Contact Resolved: ${state.contact.company_name || `${state.contact.firstname} ${state.contact.lastname}`}`);
        console.log(`      Contact ID: ${state.contact.id}`);
        if (state.isNewContact) {
          console.log(`      ⭐ NEW CONTACT CREATED`);
        }
      } else {
        console.log(`   ⚠️  Contact: Not resolved`);
      }
      
      if (state.extraction) {
        console.log(`   📄 PDF Extracted:`);
        console.log(`      Supplier: ${state.extraction.supplier_name || "N/A"}`);
        console.log(`      Amount Excl: ${state.extraction.amount_excl_tax ? `€${state.extraction.amount_excl_tax.toFixed(2)}` : "N/A"}`);
        console.log(`      Amount Incl: ${state.extraction.amount_incl_tax ? `€${state.extraction.amount_incl_tax.toFixed(2)}` : "N/A"}`);
        console.log(`      Invoice Date: ${state.extraction.invoice_date || "N/A"}`);
        console.log(`      Confidence: ${state.extraction.confidence}%`);
      } else {
        console.log(`   📄 PDF Extraction: Not performed or failed`);
      }
      
      if (state.kostenpostId) {
        console.log(`   📁 Kostenpost: ${state.kostenpostId}`);
        if (state.kostenpostDecision) {
          console.log(`      Classification Confidence: ${state.kostenpostDecision.confidence}%`);
        }
      } else {
        console.log(`   📁 Kostenpost: Not classified`);
      }
      
      if (state.matchedTransaction) {
        console.log(`   💰 Matched Transaction: ${state.matchedTransaction.id}`);
        if (state.matchDecision) {
          console.log(`      Match Confidence: ${state.matchDecision.confidence}%`);
        }
      } else {
        console.log(`   💰 Transaction Match: No match found`);
      }
      
      console.log(`   🎯 Overall Confidence: ${state.overallConfidence?.toFixed(1)}%`);
      console.log(`   ⚡ Action: ${state.action}`);
      console.log(`   📍 Current Node: ${state.currentNode}`);
      
      if (state.error) {
        console.log(`   ❌ Error: ${state.error}`);
      }
      
      // Show decision details
      console.log(`\n   📋 Decision Details:`);
      if (state.contactMatchDecision) {
        console.log(`      Contact Match: ${state.contactMatchDecision.confidence}% confidence`);
        console.log(`         ${state.contactMatchDecision.requiresReview ? "⚠️  Requires Review" : "✅ Auto-approved"}`);
        if (state.contactMatchDecision.reasoning) {
          console.log(`         Reasoning: ${state.contactMatchDecision.reasoning.substring(0, 150)}...`);
        }
      } else {
        console.log(`      Contact Match: No decision made`);
      }
      
      if (state.validationDecision) {
        console.log(`      Validation: ${state.validationDecision.confidence}% confidence`);
        console.log(`         ${state.validationDecision.requiresReview ? "⚠️  Requires Review" : "✅ Auto-approved"}`);
      } else {
        console.log(`      Validation: No decision made`);
      }
      
      if (state.kostenpostDecision) {
        console.log(`      Kostenpost: ${state.kostenpostDecision.confidence}% confidence`);
        console.log(`         ${state.kostenpostDecision.requiresReview ? "⚠️  Requires Review" : "✅ Auto-approved"}`);
      }
      
      if (state.matchDecision) {
        console.log(`      Transaction Match: ${state.matchDecision.confidence}% confidence`);
        console.log(`         ${state.matchDecision.requiresReview ? "⚠️  Requires Review" : "✅ Auto-approved"}`);
      }
    } else if (state.error) {
      console.log(`❌ Workflow Error: ${state.error}`);
      console.log(`   Current Node: ${state.currentNode}`);
    } else {
      console.log("ℹ️  Invoice not found in workflow result");
      console.log("   This might mean:");
      console.log("   - Invoice is already processed");
      console.log("   - Invoice is not in draft state");
      console.log("   - Invoice was filtered out");
    }

    console.log("\n✅ Workflow test completed");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
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

testSpecificInvoice().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
