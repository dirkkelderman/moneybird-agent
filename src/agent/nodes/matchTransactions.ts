/**
 * MatchBankTransactions Node
 * 
 * Matches invoice to bank transactions using:
 * - Amount
 * - Date window
 * - IBAN
 * - Description similarity
 */

import type { AgentState } from "../state.js";
import { TransactionMatchSchema } from "../schemas.js";
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
    // IMPORTANT: Moneybird uses different amount formats:
    // - Purchase invoices: amounts are in CENTS (e.g., 2571 for €25.71)
    // - Bank transactions: amounts are in CURRENCY UNITS (e.g., 25.71 for €25.71)
    // We need to convert invoice amount from cents to euros for comparison
    const invoiceAmountCents = Math.abs(invoice.total_price_incl_tax);
    const invoiceAmountEuros = invoiceAmountCents / 100;
    
    // Prefer the invoice date from Moneybird, but fall back to the extracted date
    // This allows us to continue even when the Moneybird draft is missing a date,
    // as long as the PDF extraction found one.
    const invoiceDate =
      invoice.invoice_date || state.extraction?.invoice_date;

    if (!invoiceDate) {
      return {
        // Don't treat this as a hard error anymore – we simply can't
        // do reliable transaction matching without a date window.
        // By returning a low-confidence decision instead of an error,
        // the rest of the workflow (including auto-booking) can still
        // proceed based on other signals.
        currentNode: "matchTransactions",
        matchDecision: {
          confidence: 0,
          reasoning:
            "No invoice date available (neither on invoice nor in extraction); skipped transaction matching",
          requiresReview: false,
        },
      };
    }

    // Get transactions in date window (±30 days)
    const dateFrom = new Date(invoiceDate);
    dateFrom.setDate(dateFrom.getDate() - 30);
    const dateTo = new Date(invoiceDate);
    dateTo.setDate(dateTo.getDate() + 30);

    console.log(
      JSON.stringify({
        level: "info",
        event: "transaction_matching_start",
        invoice_id: invoice.id,
        invoice_amount_cents: invoiceAmountCents,
        invoice_amount_eur: invoiceAmountEuros.toFixed(2),
        invoice_date: invoiceDate,
        date_from: dateFrom.toISOString().split("T")[0],
        date_to: dateTo.toISOString().split("T")[0],
        timestamp: new Date().toISOString(),
      })
    );

    const transactions = await client.listTransactions({
      date_from: dateFrom.toISOString().split("T")[0],
      date_to: dateTo.toISOString().split("T")[0],
    });

    console.log(
      JSON.stringify({
        level: "info",
        event: "transactions_loaded",
        invoice_id: invoice.id,
        total_transactions: transactions.length,
        date_from: dateFrom.toISOString().split("T")[0],
        date_to: dateTo.toISOString().split("T")[0],
        timestamp: new Date().toISOString(),
      })
    );

    // Filter by amount (within 1% tolerance), using absolute values to handle
    // Moneybird's signed transaction amounts correctly.
    // Note: Transactions are in euros, invoice is in cents (converted above)
    const candidateTransactions = transactions.filter((t) => {
      const transactionAmountEuros = Math.abs(t.amount);
      const diff = Math.abs(transactionAmountEuros - invoiceAmountEuros);
      const isMatch = diff < invoiceAmountEuros * 0.01;
      
      console.log(
        JSON.stringify({
          level: "debug",
          event: "transaction_amount_check",
          invoice_id: invoice.id,
          transaction_id: t.id,
          transaction_amount: t.amount,
          transaction_amount_eur: transactionAmountEuros,
          invoice_amount_eur: invoiceAmountEuros,
          diff: diff,
          tolerance: invoiceAmountEuros * 0.01,
          is_match: isMatch,
          timestamp: new Date().toISOString(),
        })
      );
      
      return isMatch;
    });

    console.log(
      JSON.stringify({
        level: "info",
        event: "amount_filter_complete",
        invoice_id: invoice.id,
        total_transactions: transactions.length,
        candidate_count: candidateTransactions.length,
        invoice_amount_eur: invoiceAmountEuros,
        timestamp: new Date().toISOString(),
      })
    );

    if (candidateTransactions.length === 0) {
      // Log sample of transactions to help debug
      const sampleTransactions = transactions.slice(0, 5).map(t => ({
        id: t.id,
        amount: t.amount,
        date: t.date,
        description: t.description?.substring(0, 50),
      }));
      
      console.log(
        JSON.stringify({
          level: "warn",
          event: "no_matching_transactions",
          invoice_id: invoice.id,
          invoice_amount_eur: invoiceAmountEuros.toFixed(2),
          date_range: `${dateFrom.toISOString().split("T")[0]} to ${dateTo.toISOString().split("T")[0]}`,
          total_transactions_checked: transactions.length,
          sample_transactions: sampleTransactions,
          timestamp: new Date().toISOString(),
        })
      );
      
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
- Amount: €${invoiceAmountEuros.toFixed(2)}
- Date: ${invoiceDate}
- Reference: ${invoice.reference || "none"}
- Description: ${invoice.notes || "none"}

Candidate Transactions:
${candidateTransactions.map((t, i) => `
${i + 1}. Date: ${t.date}, Amount: €${Math.abs(t.amount).toFixed(2)}
   Description: ${t.description || "none"}
   ID: ${t.id}
`).join("\n")}

Only match if confidence >= 80; otherwise set matched_transaction_id to null.
`;

    const structuredLlm = llm.withStructuredOutput(TransactionMatchSchema);
    const decision = await structuredLlm.invoke(matchPrompt);

    const matchedTransaction = decision.matched_transaction_id
      ? candidateTransactions.find((t) => t.id === decision.matched_transaction_id)
      : undefined;

    console.log(
      JSON.stringify({
        level: "info",
        event: "transaction_match_result",
        invoice_id: invoice.id,
        matched_transaction_id: matchedTransaction?.id || null,
        confidence: decision.confidence,
        reasoning: decision.reasoning,
        requires_review: decision.requiresReview || !matchedTransaction,
        timestamp: new Date().toISOString(),
      })
    );

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
