/**
 * ValidateAmountsAndBTW Node
 * 
 * Validates invoice amounts and BTW (VAT) calculations.
 * Checks for inconsistencies and calculates confidence.
 */

import type { AgentState, AIDecision } from "../state.js";
import { ChatOpenAI } from "@langchain/openai";
import { getEnv } from "../../config/env.js";

export async function validateInvoice(
  state: AgentState
): Promise<Partial<AgentState>> {
  if (!state.invoice && !state.extraction) {
    return {
      error: "No invoice or extraction data available",
      currentNode: "validateInvoice",
    };
  }

  const env = getEnv();
  const llm = new ChatOpenAI({
    modelName: env.OPENAI_MODEL,
    temperature: 0,
  });

  try {
    const invoice = state.invoice;
    const extraction = state.extraction;

    // Get amounts (all in cents from Moneybird, but extraction might be in euros)
    const amountExcl = invoice?.total_price_excl_tax ?? (extraction?.amount_excl_tax ? Math.round(extraction.amount_excl_tax * 100) : 0);
    const amountIncl = invoice?.total_price_incl_tax ?? (extraction?.amount_incl_tax ? Math.round(extraction.amount_incl_tax * 100) : 0);
    const taxAmount = invoice?.tax ?? (extraction?.tax_amount ? Math.round(extraction.tax_amount * 100) : 0);
    const taxRate = extraction?.tax_rate;

    // Calculate expected values
    const expectedTax = amountIncl - amountExcl;
    const calculatedTaxRate = amountExcl > 0 ? (expectedTax / amountExcl) * 100 : 0;

    // Validate calculations (all in cents)
    const discrepancy = Math.abs(taxAmount - expectedTax);
    const isValid = discrepancy < 1; // Allow 1 cent tolerance (in cents)

    // Use AI to assess overall validity
    const validationPrompt = `
Validate this invoice's financial data:

Amounts (in cents):
- Excl. Tax: ${amountExcl} cents (€${(amountExcl / 100).toFixed(2)})
- Incl. Tax: ${amountIncl} cents (€${(amountIncl / 100).toFixed(2)})
- Tax Amount: ${taxAmount} cents (€${(taxAmount / 100).toFixed(2)})
- Tax Rate: ${taxRate ? `${taxRate}%` : "unknown"}

Calculations:
- Expected Tax: ${expectedTax} cents (€${(expectedTax / 100).toFixed(2)})
- Discrepancy: ${discrepancy} cents (€${(discrepancy / 100).toFixed(2)})
- Calculated Tax Rate: ${calculatedTaxRate.toFixed(2)}%

Return JSON:
{
  "confidence": number (0-100),
  "reasoning": string,
  "requiresReview": boolean
}

Consider:
- Are amounts consistent?
- Is tax rate reasonable for NL (0%, 9%, 21%)?
- Are there any red flags?
`;

    const response = await llm.invoke(validationPrompt);
    const responseText = response.content as string;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error("No JSON found in LLM response");
    }

    const decision = JSON.parse(jsonMatch[0]) as AIDecision;

    // Lower confidence if amounts don't match
    const finalConfidence = isValid 
      ? decision.confidence 
      : Math.max(0, decision.confidence - 20);

    return {
      currentNode: "validateInvoice",
      validationDecision: {
        confidence: finalConfidence,
        reasoning: `${decision.reasoning}. ${isValid ? "Amounts match." : `Discrepancy: ${discrepancy} cents (€${(discrepancy / 100).toFixed(2)})`}`,
        requiresReview: decision.requiresReview || !isValid || discrepancy > 100, // More than €1 discrepancy
      },
      amountValidation: {
        isValid,
        discrepancy: discrepancy > 1 ? discrepancy : undefined, // In cents
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown error in validateInvoice",
      currentNode: "validateInvoice",
    };
  }
}
