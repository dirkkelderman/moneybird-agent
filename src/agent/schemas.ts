/**
 * LLM Output Schemas
 *
 * Zod schemas for every structured LLM call in the agent. Used with
 * ChatOpenAI's withStructuredOutput() so responses are schema-validated
 * at the boundary instead of regex-extracted from free text.
 *
 * Convention: fields the model may not be able to determine are declared
 * .nullable() (structured output requires every field to be present), and
 * call sites convert null to undefined where the agent state expects
 * optional fields.
 */

import { z } from "zod";
import type { InvoiceExtraction } from "./state.js";

/** Confidence bounded at the boundary so NaN/out-of-range never reaches confidenceGate */
const confidence = z
  .number()
  .min(0)
  .max(100)
  .describe("Confidence in this decision, 0-100");

/** Contact matching (resolveContact) */
export const ContactMatchSchema = z.object({
  matched_contact_id: z
    .string()
    .nullable()
    .describe("ID of the best matching contact, or null if no good match (confidence < 80)"),
  confidence,
  reasoning: z.string().describe("Short explanation of the match decision"),
  requiresReview: z.boolean().describe("Whether a human should review this match"),
});

/** Amount/BTW validation (validateInvoice) */
export const ValidationResultSchema = z.object({
  confidence,
  reasoning: z.string().describe("Short assessment of the invoice's financial consistency"),
  requiresReview: z.boolean().describe("Whether a human should review these amounts"),
});

/** Kostenpost classification (classifyKostenpost) */
export const KostenpostClassificationSchema = z.object({
  kostenpost_id: z
    .string()
    .nullable()
    .describe("ID of the chosen kostenpost (ledger account), or null if none fits"),
  confidence,
  reasoning: z.string().describe("Why this kostenpost was chosen"),
  requiresReview: z.boolean().describe("Whether a human should review this classification"),
});

/** Purchase-invoice bank transaction matching (matchTransactions) */
export const TransactionMatchSchema = z.object({
  matched_transaction_id: z
    .string()
    .nullable()
    .describe("ID of the matching bank transaction, or null if no confident match"),
  confidence,
  reasoning: z.string().describe("Why this transaction matches (or why none does)"),
  requiresReview: z.boolean().describe("Whether a human should review this match"),
});

/** Sales-invoice payment matching (salesPaymentMatcher) */
export const SalesPaymentMatchSchema = z.object({
  matched_transaction_id: z
    .string()
    .nullable()
    .describe("ID of the matching bank transaction, or null if less than 80% confident"),
  confidence,
  reasoning: z.string().describe("Why this transaction matches (or why none does)"),
});

/**
 * Invoice data extraction (scanInvoicePdf, text and vision paths).
 * All data fields nullable: structured output requires every field present,
 * and the model reports unknown values as null.
 */
export const InvoiceExtractionLLMSchema = z.object({
  supplier_name: z.string().nullable().describe("Supplier/company name as shown on the invoice"),
  supplier_iban: z.string().nullable().describe("Supplier IBAN if shown"),
  supplier_vat: z.string().nullable().describe("Supplier VAT number if shown"),
  amount_excl_tax: z
    .number()
    .nullable()
    .describe("Total excluding tax, in currency units; negative amounts (credit notes) as positive"),
  amount_incl_tax: z
    .number()
    .nullable()
    .describe("Total including tax, in currency units; negative amounts (credit notes) as positive"),
  tax_amount: z
    .number()
    .nullable()
    .describe("Tax amount, in currency units; negative amounts (credit notes) as positive"),
  tax_rate: z.number().nullable().describe("Tax rate percentage, e.g. 21"),
  invoice_date: z.string().nullable().describe("Invoice date in YYYY-MM-DD format"),
  invoice_number: z.string().nullable().describe("Invoice number/reference"),
  description: z.string().nullable().describe("Short description of what was invoiced"),
  currency: z.string().nullable().describe("ISO currency code, e.g. EUR, USD"),
  confidence,
});

export type InvoiceExtractionLLM = z.infer<typeof InvoiceExtractionLLMSchema>;

/** Convert the LLM extraction (null = unknown) to agent-state form (undefined = unknown) */
export function toInvoiceExtraction(llm: InvoiceExtractionLLM): InvoiceExtraction {
  return {
    supplier_name: llm.supplier_name ?? undefined,
    supplier_iban: llm.supplier_iban ?? undefined,
    supplier_vat: llm.supplier_vat ?? undefined,
    amount_excl_tax: llm.amount_excl_tax ?? undefined,
    amount_incl_tax: llm.amount_incl_tax ?? undefined,
    tax_amount: llm.tax_amount ?? undefined,
    tax_rate: llm.tax_rate ?? undefined,
    invoice_date: llm.invoice_date ?? undefined,
    invoice_number: llm.invoice_number ?? undefined,
    description: llm.description ?? undefined,
    currency: llm.currency ?? undefined,
    confidence: llm.confidence,
  };
}
