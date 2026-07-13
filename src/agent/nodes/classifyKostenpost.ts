/**
 * ClassifyKostenpost Node
 * 
 * Uses AI to classify invoice to the correct kostenpost (ledger account).
 * Considers supplier history, invoice text, and VAT context.
 */

import type { AgentState } from "../state.js";
import { KostenpostClassificationSchema } from "../schemas.js";
import { MoneybirdMCPClient } from "../../moneybird/mcpClient.js";
import { ChatOpenAI } from "@langchain/openai";
import { getEnv } from "../../config/env.js";
import { getKostenpostMapping, recordKostenpostMapping } from "../../storage/learning.js";

export async function classifyKostenpost(
  state: AgentState
): Promise<Partial<AgentState>> {
  if (!state.invoice && !state.extraction) {
    return {
      error: "No invoice or extraction data available",
      currentNode: "classifyKostenpost",
    };
  }

  const client = new MoneybirdMCPClient();
  const env = getEnv();
  const llm = new ChatOpenAI({
    modelName: env.OPENAI_MODEL,
    temperature: 0,
  });

  try {
    // Get available kostenposten
    const ledgerAccounts = await client.listLedgerAccounts();
    
    // Check learning database for supplier mapping
    const supplierName = state.extraction?.supplier_name || 
                        state.contact?.company_name ||
                        state.invoice?.contact?.company_name;
    
    const learnedMapping = supplierName
      ? getKostenpostMapping({ supplier_name: supplierName })
      : null;

    // A mapping confirmed by user corrections at least twice overrides the
    // LLM entirely: the user has already told us where this supplier goes.
    if (
      learnedMapping &&
      learnedMapping.source === "correction" &&
      learnedMapping.usage_count >= 2
    ) {
      console.log(JSON.stringify({
        level: "info",
        event: "kostenpost_user_confirmed_mapping",
        supplier_name: supplierName,
        kostenpost_id: learnedMapping.kostenpost_id,
        kostenpost_name: learnedMapping.kostenpost_name,
        usage_count: learnedMapping.usage_count,
        timestamp: new Date().toISOString(),
      }));

      recordKostenpostMapping({
        supplier_name: supplierName!,
        kostenpost_id: learnedMapping.kostenpost_id,
        kostenpost_name: learnedMapping.kostenpost_name,
        confidence: 1.0,
        source: "correction",
      });

      return {
        currentNode: "classifyKostenpost",
        kostenpostId: learnedMapping.kostenpost_id,
        kostenpostDecision: {
          confidence: 98,
          reasoning: `User-confirmed mapping for ${supplierName}: ${learnedMapping.kostenpost_name} (confirmed ${learnedMapping.usage_count}x)`,
          requiresReview: false,
        },
      };
    }

    // Build classification prompt
    const invoiceText = state.invoicePdfText || 
                       state.extraction?.description || 
                       state.invoice?.notes || 
                       "";
    
    const invoiceAmount = state.invoice?.total_price_incl_tax 
      ? (state.invoice.total_price_incl_tax / 100).toFixed(2)
      : (state.extraction?.amount_incl_tax || 0).toFixed(2);
    
    const classificationPrompt = `
Classify this invoice to the correct kostenpost (ledger account).

Invoice Details:
- Supplier: ${supplierName || "unknown"}
- Description: ${invoiceText.substring(0, 500)}
- Amount: €${invoiceAmount}
- VAT Rate: ${state.extraction?.tax_rate || "unknown"}%

Available Kostenposten:
${ledgerAccounts.map((acc, i) => `
${i + 1}. ${acc.name} (ID: ${acc.id}, Type: ${acc.account_type})
`).join("\n")}

${learnedMapping ? `
Previous Mapping:
- This supplier was previously mapped to: ${learnedMapping.kostenpost_name} (${learnedMapping.kostenpost_id})
- Confidence: ${(learnedMapping.confidence * 100).toFixed(0)}%
- Usage count: ${learnedMapping.usage_count}
` : ""}

Consider:
- Supplier history (if available)
- Invoice description/content
- VAT rate context
- Account type appropriateness
`;

    const structuredLlm = llm.withStructuredOutput(KostenpostClassificationSchema);
    const decision = await structuredLlm.invoke(classificationPrompt);

    // Boost confidence if matches learned mapping
    let finalConfidence = decision.confidence;
    if (learnedMapping && decision.kostenpost_id === learnedMapping.kostenpost_id) {
      finalConfidence = Math.min(100, decision.confidence + 10);
    }

    // Record mapping for learning (if confidence is high enough)
    if (decision.kostenpost_id && supplierName && finalConfidence >= 80) {
      const ledgerAccount = ledgerAccounts.find((acc) => acc.id === decision.kostenpost_id);
      if (ledgerAccount) {
        recordKostenpostMapping({
          supplier_name: supplierName,
          supplier_iban: state.extraction?.supplier_iban,
          supplier_vat: state.extraction?.supplier_vat,
          kostenpost_id: decision.kostenpost_id,
          kostenpost_name: ledgerAccount.name,
          confidence: finalConfidence / 100, // Store as 0-1 range
        });
      }
    }

    return {
      currentNode: "classifyKostenpost",
      kostenpostId: decision.kostenpost_id ?? undefined,
      kostenpostDecision: {
        confidence: finalConfidence,
        reasoning: decision.reasoning,
        requiresReview: decision.requiresReview,
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown error in classifyKostenpost",
      currentNode: "classifyKostenpost",
    };
  }
}
