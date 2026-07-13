/**
 * SalesPaymentMatcher
 *
 * Matches incoming bank transactions to outgoing (sales) invoices.
 * This is a separate workflow from the purchase-invoice agent graph.
 *
 * Limitations:
 * - With current MCP tools we cannot directly attach a financial mutation
 *   to an invoice (no "create payment" or "update financial mutation" tool).
 * - For now, we only detect high-confidence matches and log them so you can
 *   quickly confirm them in the Moneybird UI.
 */

import { ChatOpenAI } from "@langchain/openai";
import { getEnv } from "../config/env.js";
import { MoneybirdMCPClient } from "../moneybird/mcpClient.js";
import { SalesPaymentMatchSchema } from "./schemas.js";

export async function matchSalesInvoicePayments(): Promise<void> {
  const env = getEnv();
  const client = new MoneybirdMCPClient();
  const llm = new ChatOpenAI({
    modelName: env.OPENAI_MODEL,
    temperature: 0,
  });

  try {
    // 1) Get open sales invoices (these are invoices you sent that are not fully paid yet)
    const invoices = await client.listInvoices({
      state: "open",
      per_page: "50",
    });

    if (invoices.length === 0) {
      console.log(
        JSON.stringify({
          level: "info",
          event: "sales_matcher_no_open_invoices",
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    console.log(
      JSON.stringify({
        level: "info",
        event: "sales_matcher_open_invoices_found",
        count: invoices.length,
        invoice_ids: invoices.map((i) => i.id),
        timestamp: new Date().toISOString(),
      })
    );

    // 2) For performance, get a single bank-transaction window that covers all invoices
    const dates = invoices
      .map((inv) => inv.invoice_date)
      .filter(Boolean) as string[];

    if (dates.length === 0) {
      console.log(
        JSON.stringify({
          level: "warn",
          event: "sales_matcher_invoices_without_dates",
          message:
            "Open sales invoices have no invoice_date; skipping automatic payment matching",
          timestamp: new Date().toISOString(),
        })
      );
      return;
    }

    const minDate = new Date(dates.reduce((a, b) => (a < b ? a : b)));
    const maxDate = new Date(dates.reduce((a, b) => (a > b ? a : b)));

    // Extend window ±30 days
    minDate.setDate(minDate.getDate() - 30);
    maxDate.setDate(maxDate.getDate() + 30);

    const transactions = await client.listTransactions({
      date_from: minDate.toISOString().split("T")[0],
      date_to: maxDate.toISOString().split("T")[0],
    });

    console.log(
      JSON.stringify({
        level: "info",
        event: "sales_matcher_transactions_loaded",
        count: transactions.length,
        date_from: minDate.toISOString().split("T")[0],
        date_to: maxDate.toISOString().split("T")[0],
        timestamp: new Date().toISOString(),
      })
    );

    if (transactions.length === 0) {
      return;
    }

    // 3) For each invoice, find best matching transaction using LLM
    // Ensure we never link the same bank mutation to multiple invoices.
    const usedMutationIds = new Set<string>();
    for (const invoice of invoices) {
      const invoiceDate = invoice.invoice_date;
      // For sales invoices, Moneybird amounts are in currency units (e.g. 25.71 for €25,71),
      // not cents. Normalize to a number for calculations.
      const invoiceAmount = Math.abs(
        typeof invoice.total_price_incl_tax === "string"
          ? parseFloat(invoice.total_price_incl_tax)
          : invoice.total_price_incl_tax
      );

      if (!invoiceDate || !invoiceAmount) {
        continue;
      }

      // Only consider transactions in a reasonable date window around the invoice date
      const dateFrom = new Date(invoiceDate);
      dateFrom.setDate(dateFrom.getDate() - 30);
      const dateTo = new Date(invoiceDate);
      dateTo.setDate(dateTo.getDate() + 60); // allow late payments

      const windowed = transactions.filter((t) => {
        const txDate = new Date(t.date);
        return (
          txDate >= dateFrom &&
          txDate <= dateTo &&
          !t.invoice_id &&
          !usedMutationIds.has(t.id)
        );
      });

      if (windowed.length === 0) {
        continue;
      }

      // Narrow by amount (1% tolerance, absolute values)
      const amountFiltered = windowed.filter((t) => {
        const txAmount = Math.abs(
          typeof t.amount === "string" ? parseFloat(t.amount) : t.amount
        );
        const diff = Math.abs(txAmount - invoiceAmount);
        return diff < invoiceAmount * 0.01;
      });

      if (amountFiltered.length === 0) {
        continue;
      }

      // Extra safety: only consider transactions whose description clearly
      // mentions this invoice (invoice number, payment reference or reference).
      const expectedTokens = [
        invoice.invoice_id,
        invoice.reference,
      ].filter(Boolean) as string[];

      const descriptionFiltered = amountFiltered.filter((t) => {
        if (!t.description || expectedTokens.length === 0) return false;
        const descLower = t.description.toLowerCase();
        return expectedTokens.some((token) =>
          descLower.includes(String(token).toLowerCase())
        );
      });

      // Tier 1: strong match based on explicit invoice number/reference
      if (descriptionFiltered.length === 0) {
        // Tier 2 fallback:
        // If there is exactly one open invoice for this contact and exactly one
        // amount-matching transaction for the same contact in the date window,
        // auto-link without LLM.
        if (invoice.contact_id) {
          const sameContact = amountFiltered.filter(
            (t) => t.contact_id === invoice.contact_id
          );

          if (sameContact.length === 1) {
            const tx = sameContact[0];

            try {
              await client.linkFinancialMutationToBooking({
                mutationId: tx.id,
                bookingType: "SalesInvoice",
                bookingId: invoice.id,
                priceBase: invoiceAmount,
              });

              usedMutationIds.add(tx.id);

              console.log(
                JSON.stringify({
                  level: "info",
                  event: "sales_invoice_payment_linked_contact_fallback",
                  invoice_id: invoice.id,
                  invoice_number: invoice.invoice_id || invoice.reference,
                  contact_id: invoice.contact_id,
                  transaction_id: tx.id,
                  transaction_date: tx.date,
                  amount: tx.amount,
                  reasoning:
                    "Unique match by contact_id, amount and date window without explicit invoice number in description.",
                  timestamp: new Date().toISOString(),
                })
              );
            } catch (linkError) {
              console.error(
                JSON.stringify({
                  level: "error",
                  event: "sales_invoice_payment_link_contact_fallback_failed",
                  invoice_id: invoice.id,
                  contact_id: invoice.contact_id,
                  transaction_id: tx.id,
                  error:
                    linkError instanceof Error
                      ? linkError.message
                      : String(linkError),
                  timestamp: new Date().toISOString(),
                })
              );
            }
          }

          // Whether fallback succeeded or not, skip LLM when there was no explicit reference.
          continue;
        }

        // No contact-based fallback possible; rely on manual matching.
        continue;
      }

      const prompt = `
We are matching a paid sales invoice to a bank transaction.

      Invoice:
      - Invoice ID: ${invoice.id}
      - Invoice Number: ${invoice.invoice_id || invoice.reference || "unknown"}
      - Contact ID: ${invoice.contact_id || "unknown"}
      - Amount: €${invoiceAmount.toFixed(2)}
      - Date: ${invoiceDate}
      - Description: ${invoice.notes || "none"}

      Candidate Bank Transactions (all amounts are in currency units, e.g. 25.71):
${descriptionFiltered
  .map(
    (t, i) => `
${i + 1}. ID: ${t.id}
   Date: ${t.date}
   Amount: ${typeof t.amount === "string" ? t.amount : (t.amount as number).toFixed(2)}
   Description: ${t.description || "none"}
   Contact ID: ${t.contact_id || "none"}
`
  )
  .join("\n")}

Only choose a match if you are at least 80% confident; otherwise set matched_transaction_id to null.
`;

      const structuredLlm = llm.withStructuredOutput(SalesPaymentMatchSchema);
      let decision;
      try {
        decision = await structuredLlm.invoke(prompt);
      } catch (llmError) {
        console.error(
          JSON.stringify({
            level: "error",
            event: "sales_matcher_llm_failed",
            invoice_id: invoice.id,
            error: llmError instanceof Error ? llmError.message : String(llmError),
            timestamp: new Date().toISOString(),
          })
        );
        continue;
      }

      if (
        decision.matched_transaction_id &&
        decision.confidence >= 90
      ) {
        const tx = descriptionFiltered.find(
          (t) => t.id === decision.matched_transaction_id
        );

        if (tx) {
          // Try to link the financial mutation to the sales invoice using the REST API.
          try {
            await client.linkFinancialMutationToBooking({
              mutationId: tx.id,
              bookingType: "SalesInvoice",
              bookingId: invoice.id,
              priceBase: invoiceAmount,
            });

            usedMutationIds.add(tx.id);

            console.log(
              JSON.stringify({
                level: "info",
                event: "sales_invoice_payment_linked",
                invoice_id: invoice.id,
                invoice_number: invoice.invoice_id || invoice.reference,
                transaction_id: tx.id,
                transaction_date: tx.date,
                amount: tx.amount,
                confidence: decision.confidence,
                reasoning: decision.reasoning,
                timestamp: new Date().toISOString(),
              })
            );
          } catch (linkError) {
            console.error(
              JSON.stringify({
                level: "error",
                event: "sales_invoice_payment_link_failed",
                invoice_id: invoice.id,
                transaction_id: tx.id,
                error:
                  linkError instanceof Error
                    ? linkError.message
                    : String(linkError),
                timestamp: new Date().toISOString(),
              })
            );
          }
        }
      }
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "sales_matcher_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      })
    );
  }
}

