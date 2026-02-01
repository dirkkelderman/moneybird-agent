/**
 * LangGraph Workflow
 * 
 * Defines the agent workflow as a directed graph.
 * Each node processes the state and routes to the next node.
 * 
 * Note: This implementation uses LangGraph's StateGraph API.
 * The state is passed through nodes and merged automatically.
 */

import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import type { MoneybirdInvoice, MoneybirdContact, MoneybirdTransaction } from "../moneybird/types.js";
import type { InvoiceExtraction, AIDecision } from "./state.js";
import { detectNewInvoices } from "./nodes/detectNewInvoices.js";
import { checkCompleteness } from "./nodes/checkCompleteness.js";
import { scanInvoicePdf } from "./nodes/scanInvoicePdf.js";
import { resolveContact } from "./nodes/resolveContact.js";
import { validateInvoice } from "./nodes/validateInvoice.js";
import { classifyKostenpost } from "./nodes/classifyKostenpost.js";
import { matchTransactions } from "./nodes/matchTransactions.js";
import { confidenceGate } from "./nodes/confidenceGate.js";
import { autoBook } from "./nodes/autoBook.js";
import { alert } from "./nodes/alert.js";

/**
 * Router function: Check if invoice is complete
 */
function routeAfterCompleteness(state: typeof AgentStateAnnotation.State): string {
  console.log(JSON.stringify({
    level: "debug",
    event: "route_after_completeness",
    has_invoice: !!state.invoice,
    has_error: !!state.error,
    error: state.error,
    timestamp: new Date().toISOString(),
  }));
  
  if (state.error) {
    return "alert";
  }

  const invoice = state.invoice;
  // If no invoice, end workflow gracefully
  if (!invoice) {
    return "alert";
  }

  // Check if required fields are missing
  const missing = [];
  if (!invoice.contact_id && !invoice.contact) missing.push("contact");
  if (!invoice.total_price_excl_tax || invoice.total_price_excl_tax === 0) missing.push("amount_excl_tax");
  if (!invoice.total_price_incl_tax || invoice.total_price_incl_tax === 0) missing.push("amount_incl_tax");
  if (invoice.tax === undefined && invoice.tax !== 0) missing.push("tax");
  if (!invoice.invoice_date) missing.push("invoice_date");

  console.log(JSON.stringify({
    level: "debug",
    event: "completeness_routing",
    missing_fields: missing,
    will_route_to: missing.length > 0 ? "scanInvoicePdf" : "resolveContact",
    timestamp: new Date().toISOString(),
  }));

  if (missing.length > 0) {
    return "scanInvoicePdf";
  }

  return "resolveContact";
}

/**
 * Router function: Route after confidence gate
 */
function routeAfterConfidenceGate(state: typeof AgentStateAnnotation.State): string {
  if (state.error) {
    return "alert";
  }

  switch (state.action) {
    case "auto_book":
      return "autoBook";
    case "flag_review":
    case "alert_user":
      return "alert";
    default:
      return "alert";
  }
}

/**
 * Build the agent graph
 * 
 * Note: LangGraph StateGraph uses a reducer pattern for state management.
 * Each node returns a partial state that gets merged with the existing state.
 */
// Define state annotation for LangGraph 0.2.x
const AgentStateAnnotation = Annotation.Root({
  invoice: Annotation<MoneybirdInvoice | undefined>(),
  invoicePdfPath: Annotation<string | undefined>(),
  invoicePdfText: Annotation<string | undefined>(),
  extraction: Annotation<InvoiceExtraction | undefined>(),
  contact: Annotation<MoneybirdContact | undefined>(),
  contactMatchDecision: Annotation<AIDecision | undefined>(),
  isNewContact: Annotation<boolean>({ reducer: (x, y) => y ?? x, default: () => false }),
  validationDecision: Annotation<AIDecision | undefined>(),
  amountValidation: Annotation<{ isValid: boolean; discrepancy?: number } | undefined>(),
  kostenpostId: Annotation<string | undefined>(),
  kostenpostDecision: Annotation<AIDecision | undefined>(),
  matchedTransaction: Annotation<MoneybirdTransaction | undefined>(),
  matchDecision: Annotation<AIDecision | undefined>(),
  overallConfidence: Annotation<number | undefined>(),
  action: Annotation<"auto_book" | "flag_review" | "alert_user" | undefined>(),
  error: Annotation<string | undefined>(),
  currentNode: Annotation<string | undefined>(),
  processingStartedAt: Annotation<string | undefined>(),
  processingCompletedAt: Annotation<string | undefined>(),
});

export function createAgentGraph() {
  // Use Annotation API for proper state management
  const workflow = new StateGraph(AgentStateAnnotation)
    .addNode("detectNewInvoices", detectNewInvoices)
    .addNode("checkCompleteness", checkCompleteness)
    .addNode("scanInvoicePdf", scanInvoicePdf)
    .addNode("resolveContact", resolveContact)
    .addNode("validateInvoice", validateInvoice)
    .addNode("classifyKostenpost", classifyKostenpost)
    .addNode("matchTransactions", matchTransactions)
    .addNode("confidenceGate", confidenceGate)
    .addNode("autoBook", autoBook)
    .addNode("alert", alert);

  /**
   * Router function: Route after detecting invoices
   */
  function routeAfterDetectInvoices(state: typeof AgentStateAnnotation.State): string {
    console.log(JSON.stringify({
      level: "debug",
      event: "route_after_detect_invoices",
      has_invoice: !!state.invoice,
      invoice_id: state.invoice?.id,
      has_error: !!state.error,
      error: state.error,
      timestamp: new Date().toISOString(),
    }));
    
    if (state.error) {
      return "alert";
    }
    
    // If no invoice found, end workflow gracefully
    if (!state.invoice) {
      return "alert";
    }
    
    return "checkCompleteness";
  }

  // Define edges
  workflow.addEdge(START, "detectNewInvoices");
  
  // Route based on whether invoice was found
  workflow.addConditionalEdges(
    "detectNewInvoices",
    routeAfterDetectInvoices,
    {
      checkCompleteness: "checkCompleteness",
      alert: "alert",
    }
  );
  
  // Route based on completeness
  workflow.addConditionalEdges(
    "checkCompleteness",
    routeAfterCompleteness,
    {
      scanInvoicePdf: "scanInvoicePdf",
      resolveContact: "resolveContact",
      alert: "alert",
    }
  );

  // After scanning PDF, update invoice and resolve contact
  workflow.addEdge("scanInvoicePdf", "resolveContact");

  // Sequential processing after contact resolution
  workflow.addEdge("resolveContact", "validateInvoice");
  workflow.addEdge("validateInvoice", "classifyKostenpost");
  workflow.addEdge("classifyKostenpost", "matchTransactions");
  workflow.addEdge("matchTransactions", "confidenceGate");

  // Route based on confidence
  workflow.addConditionalEdges(
    "confidenceGate",
    routeAfterConfidenceGate,
    {
      autoBook: "autoBook",
      alert: "alert",
    }
  );

  // End nodes
  workflow.addEdge("autoBook", END);
  workflow.addEdge("alert", END);

  return workflow.compile();
}
