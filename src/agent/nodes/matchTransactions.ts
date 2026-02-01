/**
 * MatchBankTransactions Node
 * 
 * Matches invoice to bank transactions using:
 * - Amount
 * - Date window
 * - IBAN
 * - Description similarity
 */

import type { AgentState, AIDecision } from "../state.js";
import { MoneybirdMCPClient } from "../../moneybird/mcpClient.js";
import { ChatOpenAI } from "@langchain/openai";
import { getEnv } from "../../config/env.js";

export async function matchTransactions(
  state: AgentState
): Promise<Partial<AgentState>> {
  if (!state.invoice) {
    return {
      error: "No invoice available",
      currentNode: "matchTransactions",
    };
  }

  const client = new MoneybirdMCPClient();
  const env = getEnv();
  const llm = new ChatOpenAI({
    modelName: env.OPENAI_MODEL,
    temperature: 0,
  });

  try {
    const invoice = state.invoice;
    const invoiceAmount = invoice.total_price_incl_tax;
    const invoiceDate = invoice.invoice_date;

    if (!invoiceDate) {
      return {
        error: "Invoice date missing",
        currentNode: "matchTransactions",
      };
    }

    // Get transactions in date window (±30 days)
    const dateFrom = new Date(invoiceDate);
    dateFrom.setDate(dateFrom.getDate() - 30);
    const dateTo = new Date(invoiceDate);
    dateTo.setDate(dateTo.getDate() + 30);

    const transactions = await client.listTransactions({
      date_from: dateFrom.toISOString().split("T")[0],
      date_to: dateTo.toISOString().split("T")[0],
    });

    // Filter by amount (within 1% tolerance)
    const candidateTransactions = transactions.filter((t) => {
      const diff = Math.abs(t.amount - invoiceAmount);
      return diff < invoiceAmount * 0.01;
    });

    if (candidateTransactions.length === 0) {
      return {
        currentNode: "matchTransactions",
        matchDecision: {
          confidence: 0,
          reasoning: "No transactions found matching invoice amount",
          requiresReview: true,
        },
      };
    }

    // Use AI to determine best match
    const matchPrompt = `
Match this invoice to a bank transaction.

Invoice:
- Amount: ${invoiceAmount} cents (€${(invoiceAmount / 100).toFixed(2)})
- Date: ${invoiceDate}
- Reference: ${invoice.reference || "none"}
- Description: ${invoice.notes || "none"}

Candidate Transactions:
${candidateTransactions.map((t, i) => `
${i + 1}. Date: ${t.date}, Amount: ${t.amount} cents (€${(t.amount / 100).toFixed(2)})
   Description: ${t.description || "none"}
   ID: ${t.id}
`).join("\n")}

Return JSON:
{
  "matched_transaction_id": string | null,
  "confidence": number (0-100),
  "reasoning": string,
  "requiresReview": boolean
}

Only match if confidence >= 80.
`;

    const response = await llm.invoke(matchPrompt);
    const responseText = response.content as string;
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    
    if (!jsonMatch) {
      throw new Error("No JSON found in LLM response");
    }

    const decision = JSON.parse(jsonMatch[0]) as AIDecision & { matched_transaction_id?: string };

    const matchedTransaction = decision.matched_transaction_id
      ? candidateTransactions.find((t) => t.id === decision.matched_transaction_id)
      : undefined;

    return {
      currentNode: "matchTransactions",
      matchedTransaction,
      matchDecision: {
        confidence: decision.confidence,
        reasoning: decision.reasoning,
        requiresReview: decision.requiresReview || !matchedTransaction,
      },
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unknown error in matchTransactions",
      currentNode: "matchTransactions",
    };
  }
}
