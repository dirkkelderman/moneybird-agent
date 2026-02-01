/**
 * ResolveOrCreateContact Node
 * 
 * Matches invoice supplier to existing Moneybird contact or creates a new one.
 * Uses AI to determine match confidence.
 */

import type { AgentState, AIDecision } from "../state.js";
import type { MoneybirdContact, MoneybirdInvoice, CreateInvoiceInput } from "../../moneybird/types.js";
import { MoneybirdMCPClient } from "../../moneybird/mcpClient.js";
import { ChatOpenAI } from "@langchain/openai";
import { getEnv } from "../../config/env.js";
import { markInvoiceProcessed } from "../../storage/db.js";

export async function resolveContact(
  state: AgentState
): Promise<Partial<AgentState>> {
  if (!state.invoice && !state.extraction) {
    return {
      error: "No invoice or extraction data available",
      currentNode: "resolveContact",
    };
  }

  const client = new MoneybirdMCPClient();
  const env = getEnv();
  const llm = new ChatOpenAI({
    modelName: env.OPENAI_MODEL,
    temperature: 0,
  });

  try {
    // Get supplier info from extraction, invoice reference, or invoice notes
    let supplierName = state.extraction?.supplier_name || 
                       state.invoice?.contact?.company_name;
    const supplierIban = state.extraction?.supplier_iban;
    const supplierVat = state.extraction?.supplier_vat;

    // If no supplier name from extraction, try to extract from invoice reference/notes/filename
    if (!supplierName && state.invoice) {
      const reference = state.invoice.reference || "";
      const filename = state.invoice.attachments?.[0]?.filename || "";
      
      // Simple pattern matching - look for common invoice patterns
      // Try filename first (often contains supplier name)
      if (filename) {
        // Remove common invoice prefixes/suffixes
        const cleaned = filename
          .replace(/\.pdf$/i, "")
          .replace(/factuur.*voor.*je/i, "")
          .replace(/invoice/i, "")
          .replace(/^\d+_/, "")
          .trim();
        
        if (cleaned.length > 3 && cleaned.length < 100) {
          supplierName = cleaned;
          console.log(JSON.stringify({
            level: "info",
            event: "supplier_name_from_filename",
            supplier_name: supplierName,
            timestamp: new Date().toISOString(),
          }));
        }
      }
      
      // If still no name, try reference
      if (!supplierName && reference) {
        // Remove common patterns
        const cleaned = reference
          .replace(/factuur.*voor.*je/i, "")
          .replace(/invoice/i, "")
          .trim();
        
        if (cleaned.length > 3 && cleaned.length < 100) {
          supplierName = cleaned;
          console.log(JSON.stringify({
            level: "info",
            event: "supplier_name_from_reference",
            supplier_name: supplierName,
            timestamp: new Date().toISOString(),
          }));
        }
      }
    }

    if (!supplierName) {
      console.log(JSON.stringify({
        level: "warn",
        event: "no_supplier_name_available",
        message: "Cannot resolve contact without supplier name",
        timestamp: new Date().toISOString(),
      }));
      return {
        error: "No supplier name available",
        currentNode: "resolveContact",
      };
    }

    // Search for existing contacts
    const contacts = await client.listContacts({
      query: supplierName,
    });

    // First, try simple exact/fuzzy matching without LLM
    let matchedContact: MoneybirdContact | undefined = undefined;
    let matchConfidence = 0;
    
    // Exact name match
    const exactMatch = contacts.find(c => 
      c.company_name?.toLowerCase() === supplierName.toLowerCase() ||
      `${c.firstname} ${c.lastname}`.toLowerCase().trim() === supplierName.toLowerCase()
    );
    
    if (exactMatch) {
      matchedContact = exactMatch;
      matchConfidence = 95;
      console.log(JSON.stringify({
        level: "info",
        event: "contact_exact_match",
        contact_id: exactMatch.id,
        confidence: matchConfidence,
        timestamp: new Date().toISOString(),
      }));
    } else if (contacts.length > 0) {
      // Try fuzzy match (contains supplier name or vice versa)
      const fuzzyMatch = contacts.find(c => {
        const contactName = (c.company_name || `${c.firstname} ${c.lastname}`).toLowerCase();
        return contactName.includes(supplierName.toLowerCase()) || 
               supplierName.toLowerCase().includes(contactName);
      });
      
      if (fuzzyMatch) {
        matchedContact = fuzzyMatch;
        matchConfidence = 75;
        console.log(JSON.stringify({
          level: "info",
          event: "contact_fuzzy_match",
          contact_id: fuzzyMatch.id,
          confidence: matchConfidence,
          timestamp: new Date().toISOString(),
        }));
      }
    }

    let decision: AIDecision & { matched_contact_id?: string };
    
    if (matchedContact && matchConfidence >= 75) {
      // Use simple match result
      decision = {
        matched_contact_id: matchedContact.id,
        confidence: matchConfidence,
        reasoning: matchConfidence >= 95 ? "Exact name match" : "Fuzzy name match",
        requiresReview: matchConfidence < 80,
      };
    } else {
      // Use AI for better matching if available (or create new contact)
      try {
        const matchPrompt = `
Given an invoice supplier and a list of Moneybird contacts, determine the best match.

Invoice Supplier:
- Name: ${supplierName}
- IBAN: ${supplierIban || "unknown"}
- VAT: ${supplierVat || "unknown"}

Contacts:
${contacts.map((c, i) => `
${i + 1}. ${c.company_name || `${c.firstname} ${c.lastname}`}
   - IBAN: ${c.bank_account || "unknown"}
   - VAT: ${c.tax_number || "unknown"}
   - ID: ${c.id}
`).join("\n")}

Return JSON:
{
  "matched_contact_id": string | null,
  "confidence": number (0-100),
  "reasoning": string,
  "requiresReview": boolean
}

If no good match (confidence < 80), set matched_contact_id to null or omit it.
`;

        const response = await llm.invoke(matchPrompt);
        const responseText = response.content as string;
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        
        if (!jsonMatch) {
          throw new Error("No JSON found in LLM response");
        }

        decision = JSON.parse(jsonMatch[0]) as AIDecision & { matched_contact_id?: string };
      } catch (llmError) {
        // If LLM fails (quota, etc.), default to creating new contact if no matches found
        console.log(JSON.stringify({
          level: "warn",
          event: "llm_match_failed",
          error: llmError instanceof Error ? llmError.message : String(llmError),
          will_create_new_contact: contacts.length === 0,
          timestamp: new Date().toISOString(),
        }));
        
        decision = {
          matched_contact_id: undefined,
          confidence: contacts.length === 0 ? 30 : 50, // Low confidence if contacts exist but no match
          reasoning: contacts.length === 0 
            ? "No existing contacts found, will create new contact"
            : "LLM matching failed, no clear match found",
          requiresReview: true,
        };
      }
    }

    let contact: MoneybirdContact | undefined = undefined;
    let isNewContact = false;

    if (decision.matched_contact_id && decision.confidence >= 80) {
      // Use existing contact
      console.log(JSON.stringify({
        level: "info",
        event: "contact_matched",
        contact_id: decision.matched_contact_id,
        confidence: decision.confidence,
        timestamp: new Date().toISOString(),
      }));
      contact = await client.getContact(decision.matched_contact_id);
    } else if (supplierName) {
      // Create new contact if no good match (confidence < 80) or no matches found
      const shouldCreate = decision.confidence < 80 || !decision.matched_contact_id;
      
      if (shouldCreate) {
        console.log(JSON.stringify({
          level: "info",
          event: "creating_new_contact",
          supplier_name: supplierName,
          confidence: decision.confidence,
          reason: decision.reasoning,
          timestamp: new Date().toISOString(),
        }));
        try {
          contact = await client.createContact({
            company_name: supplierName,
            bank_account: supplierIban,
            tax_number: supplierVat,
          });
          isNewContact = true;
          console.log(JSON.stringify({
            level: "info",
            event: "contact_created_successfully",
            contact_id: contact.id,
            contact_name: contact.company_name || `${contact.firstname} ${contact.lastname}`,
            timestamp: new Date().toISOString(),
          }));
        } catch (createError) {
          console.log(JSON.stringify({
            level: "error",
            event: "contact_creation_failed",
            error: createError instanceof Error ? createError.message : String(createError),
            timestamp: new Date().toISOString(),
          }));
          // Continue without contact - will require manual review
        }
      }
    }

    // If we have a contact and extraction data with good confidence, update the invoice in Moneybird
    // This ensures the invoice is saved with contact and extracted data, even if overall confidence is lower
    // Note: Invoices in "new" state might not be directly updatable - they may need to be converted to "draft" first
    if (contact && state.invoice && state.extraction && state.extraction.confidence >= 70) {
      // Try to update the invoice - if it fails due to "new" state, the error will be caught and logged
      try {
        const updates: {
          contact_id?: string;
          invoice_date?: string;
          total_price_excl_tax?: number;
          total_price_incl_tax?: number;
          tax?: number;
          reference?: string;
          notes?: string;
          state?: "new" | "draft" | "open" | "paid" | "late" | "reminded";
        } = {
          contact_id: contact.id,
        };
        
        // Note: Moneybird API does not allow converting invoices from "new" to "draft" state via API
        // Invoices in "new" state must be manually converted to "draft" in Moneybird UI before they can be updated
        // We'll attempt the update anyway - if it fails, the error will be caught and logged
        if (state.invoice.state === "new") {
          console.log(
            JSON.stringify({
              level: "warn",
              event: "invoice_in_new_state",
              invoice_id: state.invoice.id,
              message: "Invoice is in 'new' state. Moneybird API may not allow updates. Invoice needs to be converted to 'draft' manually in Moneybird UI first.",
              timestamp: new Date().toISOString(),
            })
          );
        }

        // Normalize amounts: ensure positive values (credit notes should be stored as positive)
        const normalizeAmount = (amount: number | null | undefined): number | undefined => {
          if (amount === null || amount === undefined) return undefined;
          return Math.abs(amount);
        };

        // Add extracted data if available
        if (state.extraction.invoice_date) {
          updates.invoice_date = state.extraction.invoice_date;
        }

        const amountExclTax = normalizeAmount(state.extraction.amount_excl_tax);
        if (amountExclTax !== undefined) {
          updates.total_price_excl_tax = Math.round(amountExclTax * 100);
        }

        const amountInclTax = normalizeAmount(state.extraction.amount_incl_tax);
        if (amountInclTax !== undefined) {
          updates.total_price_incl_tax = Math.round(amountInclTax * 100);
        }

        const taxAmount = normalizeAmount(state.extraction.tax_amount);
        if (taxAmount !== undefined) {
          updates.tax = Math.round(taxAmount * 100);
        }

        if (state.extraction.invoice_number) {
          updates.reference = state.extraction.invoice_number;
        }

        if (state.extraction.description) {
          updates.notes = state.extraction.description;
        }

        console.log(
          JSON.stringify({
            level: "info",
            event: "updating_invoice_after_contact_resolution",
            invoice_id: state.invoice.id,
            contact_id: contact.id,
            extraction_confidence: state.extraction.confidence,
            invoice_state: state.invoice.state,
            updates: {
              contact_id: updates.contact_id,
              invoice_date: updates.invoice_date,
              total_price_incl_tax: updates.total_price_incl_tax,
            },
            timestamp: new Date().toISOString(),
          })
        );

        // For invoices in "new" state, try a two-step approach:
        // 1. First update with just contact_id (this might trigger automatic state conversion to "draft")
        // 2. Then update with all other fields
        let updatedInvoice: MoneybirdInvoice;
        if (state.invoice.state === "new") {
          console.log(
            JSON.stringify({
              level: "info",
              event: "two_step_update_for_new_invoice",
              invoice_id: state.invoice.id,
              step: "step_1_contact_only",
              message: "Updating invoice with contact_id first to trigger state conversion",
              timestamp: new Date().toISOString(),
            })
          );
          
          // Step 1: Update with just contact_id
          try {
            updatedInvoice = await client.updatePurchaseInvoice(state.invoice.id, {
              contact_id: contact.id,
            });
            
            console.log(
              JSON.stringify({
                level: "info",
                event: "contact_update_successful",
                invoice_id: state.invoice.id,
                new_state: updatedInvoice.state,
                message: updatedInvoice.state === "draft" 
                  ? "Invoice converted to draft state, proceeding with full update"
                  : "Invoice state unchanged, attempting full update anyway",
                timestamp: new Date().toISOString(),
              })
            );
            
            // Step 2: Update with all other fields (now that it might be in draft state)
            if (updatedInvoice.state === "draft" || updatedInvoice.state === "new") {
              console.log(
                JSON.stringify({
                  level: "info",
                  event: "two_step_update_for_new_invoice",
                  invoice_id: state.invoice.id,
                  step: "step_2_all_fields",
                  message: "Updating invoice with all extracted fields",
                  timestamp: new Date().toISOString(),
                })
              );
              
              // Remove contact_id from updates since we already set it
              const { contact_id, ...remainingUpdates } = updates;
              updatedInvoice = await client.updatePurchaseInvoice(state.invoice.id, remainingUpdates);
            }
          } catch (step1Error) {
            // If step 1 fails, try the full update anyway
            console.log(
              JSON.stringify({
                level: "warn",
                event: "contact_only_update_failed",
                invoice_id: state.invoice.id,
                error: step1Error instanceof Error ? step1Error.message : String(step1Error),
                message: "Contact-only update failed, trying full update",
                timestamp: new Date().toISOString(),
              })
            );
            // Fall through to full update attempt
            updatedInvoice = await client.updatePurchaseInvoice(state.invoice.id, updates);
          }
        } else {
          // For invoices already in draft or other states, do a single update
          updatedInvoice = await client.updatePurchaseInvoice(state.invoice.id, updates);
        }
        
        return {
          currentNode: "resolveContact",
          contact,
          invoice: updatedInvoice, // Return updated invoice
          contactMatchDecision: {
            confidence: decision.confidence,
            reasoning: decision.reasoning,
            requiresReview: decision.requiresReview || isNewContact,
          },
          isNewContact,
        };
      } catch (updateError) {
        const errorMessage = updateError instanceof Error ? updateError.message : String(updateError);
        const is422Error = errorMessage.includes("422") || errorMessage.includes("Unprocessable");
        const isNewState = state.invoice.state === "new";

        console.log(
          JSON.stringify({
            level: "warn",
            event: "invoice_update_failed_after_contact_resolution",
            invoice_id: state.invoice.id,
            invoice_state: state.invoice.state,
            error: errorMessage,
            is_422_error: is422Error,
            is_new_state: isNewState,
            timestamp: new Date().toISOString(),
          })
        );

        // If update fails with 422 and invoice is in "new" state, try creating a new invoice instead
        // This is the "external invoice import" approach - create a properly configured invoice
        // and mark the old one as processed
        if (is422Error && isNewState && contact && state.extraction) {
          console.log(
            JSON.stringify({
              level: "info",
              event: "attempting_create_new_invoice_for_new_state",
              old_invoice_id: state.invoice.id,
              message: "Creating new purchase invoice with correct data since update failed for 'new' state invoice",
              timestamp: new Date().toISOString(),
            })
          );

          try {
            const newInvoiceData: CreateInvoiceInput = {
              contact_id: contact.id,
              invoice_date: state.extraction.invoice_date,
              total_price_excl_tax: state.extraction.amount_excl_tax 
                ? Math.round(Math.abs(state.extraction.amount_excl_tax) * 100)
                : undefined,
              total_price_incl_tax: state.extraction.amount_incl_tax
                ? Math.round(Math.abs(state.extraction.amount_incl_tax) * 100)
                : undefined,
              tax: state.extraction.tax_amount
                ? Math.round(Math.abs(state.extraction.tax_amount) * 100)
                : undefined,
              reference: state.extraction.invoice_number,
              notes: state.extraction.description,
              currency: state.extraction.currency,
              state: "draft", // Create in draft state so it can be updated later
            };

            const newInvoice = await client.createPurchaseInvoice(newInvoiceData);

            console.log(
              JSON.stringify({
                level: "info",
                event: "new_invoice_created_successfully",
                old_invoice_id: state.invoice.id,
                new_invoice_id: newInvoice.id,
                new_invoice_state: newInvoice.state,
                message: "Successfully created new purchase invoice. Attempting to delete old invoice.",
                timestamp: new Date().toISOString(),
              })
            );

            // Delete the old invoice since we've created a new one with correct data
            try {
              await client.deletePurchaseInvoice(state.invoice.id);
              console.log(
                JSON.stringify({
                  level: "info",
                  event: "old_invoice_deleted_successfully",
                  old_invoice_id: state.invoice.id,
                  new_invoice_id: newInvoice.id,
                  message: "Successfully deleted old invoice after creating replacement.",
                  timestamp: new Date().toISOString(),
                })
              );
            } catch (deleteError) {
              // If delete fails, mark as processed so we don't try again
              console.log(
                JSON.stringify({
                  level: "warn",
                  event: "old_invoice_delete_failed",
                  old_invoice_id: state.invoice.id,
                  error: deleteError instanceof Error ? deleteError.message : String(deleteError),
                  message: "Failed to delete old invoice. Marking as processed to avoid reprocessing.",
                  timestamp: new Date().toISOString(),
                })
              );
              markInvoiceProcessed(state.invoice.id, "completed");
            }

            // Return the new invoice in state
            return {
              currentNode: "resolveContact",
              contact,
              invoice: newInvoice, // Return the new invoice
              contactMatchDecision: {
                confidence: decision.confidence,
                reasoning: decision.reasoning,
                requiresReview: decision.requiresReview || isNewContact,
              },
              isNewContact,
            };
          } catch (createError) {
            console.log(
              JSON.stringify({
                level: "error",
                event: "create_new_invoice_failed",
                old_invoice_id: state.invoice.id,
                error: createError instanceof Error ? createError.message : String(createError),
                message: "Failed to create new invoice. Will continue with old invoice.",
                timestamp: new Date().toISOString(),
              })
            );
            // Fall through to continue with old invoice
          }
        }

        // Continue without updating - will be updated later in autoBook if confidence is high enough
        // Note: If invoice is in "new" state, Moneybird API returns 422 error
        // According to Moneybird API documentation, there's no API method to convert "new" to "draft"
        // The invoice must be manually converted to "draft" in Moneybird UI before it can be updated via API
        // Once converted to "draft", the agent will be able to update it on the next run
      }
    }

    return {
      currentNode: "resolveContact",
      contact,
      invoice: state.invoice, // Preserve invoice in state
      contactMatchDecision: {
        confidence: decision.confidence,
        reasoning: decision.reasoning,
        requiresReview: decision.requiresReview || isNewContact,
      },
      isNewContact,
    };
  } catch (error) {
    console.log(JSON.stringify({
      level: "error",
      event: "resolve_contact_error",
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    }));
    return {
      error: error instanceof Error ? error.message : "Unknown error in resolveContact",
      currentNode: "resolveContact",
    };
  }
}
