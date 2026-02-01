/**
 * ClassifyKostenpost Node
 * 
 * Uses AI to classify invoice to the correct kostenpost (ledger account).
 * Considers supplier history, invoice text, and VAT context.
 */

import type { AgentState, AIDecision } from "../state.js";
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

Return JSON:
{
  "kostenpost_id": string,
  "confidence": number (0-100),
  "reasoning": string,
  "requiresReview": boolean
}

Consider:
- Supplier history (if available)
- Invoice description/content
- VAT rate context
- Account type appropriateness
`;

    const response = await llm.invoke(classificationPrompt);
    const responseText = response.content as string;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error("No JSON found in LLM response");
    }

    const decision = JSON.parse(jsonMatch[0]) as AIDecision & { kostenpost_id?: string };

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
      kostenpostId: decision.kostenpost_id,
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
