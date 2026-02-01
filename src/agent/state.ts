/**
 * LangGraph State Definition
 * 
 * This defines the shared state that flows through the agent workflow.
 * All nodes receive and update this state.
 */

import { z } from "zod";
import type { MoneybirdInvoice, MoneybirdContact, MoneybirdTransaction } from "../moneybird/types.js";

/**
 * AI Decision with confidence and reasoning
 */
export const AIDecisionSchema = z.object({
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  requiresReview: z.boolean(),
});

export type AIDecision = z.infer<typeof AIDecisionSchema>;

/**
 * Invoice extraction result from OCR/vision
 */
export const InvoiceExtractionSchema = z.object({
  supplier_name: z.string().optional(),
  supplier_iban: z.string().optional(),
  supplier_vat: z.string().optional(),
  amount_excl_tax: z.number().optional(),
  amount_incl_tax: z.number().optional(),
  tax_amount: z.number().optional(),
  tax_rate: z.number().optional(),
  invoice_date: z.string().optional(),
  invoice_number: z.string().optional(),
  description: z.string().optional(),
  currency: z.string().optional(), // ISO currency code (e.g., "USD", "EUR")
  confidence: z.number().min(0).max(100),
});

export type InvoiceExtraction = z.infer<typeof InvoiceExtractionSchema>;

/**
 * Main agent state
 */
export const AgentStateSchema = z.object({
  // Current invoice being processed
  invoice: z.custom<MoneybirdInvoice>().optional(),
  
  // Invoice PDF content (base64 or path)
  invoicePdfPath: z.string().optional(),
  invoicePdfText: z.string().optional(),
  
  // Extracted invoice data
  extraction: InvoiceExtractionSchema.optional(),
  
  // Contact resolution
  contact: z.custom<MoneybirdContact>().optional(),
  contactMatchDecision: AIDecisionSchema.optional(),
  isNewContact: z.boolean().default(false),
  
  // Validation
  validationDecision: AIDecisionSchema.optional(),
  amountValidation: z.object({
    isValid: z.boolean(),
    discrepancy: z.number().optional(),
  }).optional(),
  
  // Kostenpost classification
  kostenpostId: z.string().optional(),
  kostenpostDecision: AIDecisionSchema.optional(),
  
  // Bank transaction matching
  matchedTransaction: z.custom<MoneybirdTransaction>().optional(),
  matchDecision: AIDecisionSchema.optional(),
  
  // Overall confidence and action
  overallConfidence: z.number().min(0).max(100).optional(),
  action: z.enum(["auto_book", "flag_review", "alert_user"]).optional(),
  
  // Error handling
  error: z.string().optional(),
  currentNode: z.string().optional(),
  
  // Metadata
  processingStartedAt: z.string().optional(),
  processingCompletedAt: z.string().optional(),
});

export type AgentState = z.infer<typeof AgentStateSchema>;

/**
 * Helper to create initial state
 */
export function createInitialState(overrides?: Partial<AgentState>): AgentState {
  return {
    isNewContact: false,
    processingStartedAt: new Date().toISOString(),
    ...overrides,
  };
}
