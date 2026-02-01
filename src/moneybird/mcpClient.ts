/**
 * Moneybird MCP Client Abstraction
 * 
 * This module provides a typed interface to the Moneybird MCP server.
 * It wraps MCP tool calls and provides a clean API for the agent nodes.
 * 
 * Note: The actual MCP integration will be implemented based on the
 * available MCP tools. This is a placeholder structure.
 */

import type {
  MoneybirdContact,
  MoneybirdInvoice,
  MoneybirdLedgerAccount,
  MoneybirdTransaction,
  CreateContactInput,
  UpdateInvoiceInput,
  CreateInvoiceInput,
} from "./types.js";

import { getEnv, hasOAuthCredentials } from "../config/env.js";
import { getMCPTool as getMCPToolFromConnection, isMCPInitialized } from "./mcpConnection.js";

/**
 * Get MCP tool function if available
 * Tries MCP connection first, then falls back to global (for Cursor environment)
 */
function getMCPTool(name: string): ((...args: any[]) => Promise<any>) | null {
  // Try MCP connection first (for standalone Node.js)
  if (isMCPInitialized()) {
    const tool = getMCPToolFromConnection(name);
    if (tool) {
      return tool;
    }
  }
  
  // Fallback to global (for Cursor environment)
  const tool = (globalThis as any)[name];
  return typeof tool === "function" ? tool : null;
}

export class MoneybirdMCPClient {
  private _administrationId?: string;
  private _accessToken?: string;
  private _clientId?: string;
  private _clientSecret?: string;

  constructor(administrationId?: string) {
    const env = getEnv();
    this._administrationId = administrationId || env.MONEYBIRD_ADMINISTRATION_ID;
    
    // Store OAuth credentials if available (for REST API fallback)
    if (hasOAuthCredentials()) {
      this._clientId = env.MONEYBIRD_CLIENT_ID;
      this._clientSecret = env.MONEYBIRD_CLIENT_SECRET;
      this._accessToken = env.MONEYBIRD_ACCESS_TOKEN;
    }
  }

  /**
   * Get administration ID (for future REST API calls)
   */
  getAdministrationId(): string | undefined {
    return this._administrationId;
  }

  /**
   * Get access token (for future REST API calls)
   */
  getAccessToken(): string | undefined {
    return this._accessToken;
  }

  /**
   * Get client ID (for future REST API calls)
   */
  getClientId(): string | undefined {
    return this._clientId;
  }

  /**
   * Get client secret (for future REST API calls)
   */
  getClientSecret(): string | undefined {
    return this._clientSecret;
  }

  /**
   * List all administrations the user has access to
   */
  async listAdministrations(): Promise<Array<{ id: string; name: string }>> {
    try {
      // Try MCP tool first (try both naming conventions)
      const mcpTool = getMCPTool("mcp_Moneybird_list_administrations") || getMCPTool("list_administrations");
      if (mcpTool) {
        const result = await mcpTool();
        // Handle array response
        const administrations = Array.isArray(result) ? result : (result.administrations || [result]);
        return administrations.map((admin: { id: string; name?: string }) => ({
          id: admin.id,
          name: admin.name || `Administration ${admin.id}`,
        }));
      }
      
      // Fallback to REST API (not implemented yet)
      throw new Error("MCP tools not available and REST API fallback not implemented");
    } catch (error) {
      throw new Error(`Failed to list administrations: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List contacts in the administration
   */
  async listContacts(params?: {
    query?: string;
    page?: string;
    per_page?: string;
  }): Promise<MoneybirdContact[]> {
    try {
      // Try MCP tool first (try both naming conventions)
      const mcpTool = getMCPTool("mcp_Moneybird_list_contacts") || getMCPTool("list_contacts");
      if (mcpTool) {
        const result = await mcpTool({
          query: params?.query,
          page: params?.page,
          per_page: params?.per_page,
        });
        
        // Handle array response
        const contacts = Array.isArray(result) ? result : (result.contacts || [result]);
        
        // Transform MCP response to our type
        return contacts.map((contact: any) => ({
          id: contact.id,
          company_name: contact.company_name,
          firstname: contact.firstname,
          lastname: contact.lastname,
          customer_id: contact.customer_id,
          tax_number: contact.tax_number,
          email: contact.email,
          phone: contact.phone,
          address1: contact.address1,
          address2: contact.address2,
          zipcode: contact.zipcode,
          city: contact.city,
          country: contact.country,
          bank_account: contact.bank_account,
          sepa_iban: contact.sepa_iban,
        }));
      }
      
      // Fallback to REST API (not implemented yet)
      throw new Error("MCP tools not available and REST API fallback not implemented");
    } catch (error) {
      throw new Error(`Failed to list contacts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a specific contact by ID
   */
  async getContact(id: string): Promise<MoneybirdContact> {
    try {
      // Try MCP tool first (try both naming conventions)
      const mcpTool = getMCPTool("mcp_Moneybird_get_contact") || getMCPTool("get_contact");
      if (mcpTool) {
        const contact = await mcpTool({ id });
        
        // Transform MCP response to our type
        return {
          id: contact.id,
          company_name: contact.company_name,
          firstname: contact.firstname,
          lastname: contact.lastname,
          customer_id: contact.customer_id,
          tax_number: contact.tax_number,
          email: contact.email,
          phone: contact.phone,
          address1: contact.address1,
          address2: contact.address2,
          zipcode: contact.zipcode,
          city: contact.city,
          country: contact.country,
          bank_account: contact.bank_account,
          sepa_iban: contact.sepa_iban,
        };
      }
      
      // Fallback to REST API (not implemented yet)
      throw new Error("MCP tools not available and REST API fallback not implemented");
    } catch (error) {
      throw new Error(`Failed to get contact ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a new contact
   */
  async createContact(contact: CreateContactInput): Promise<MoneybirdContact> {
    try {
      // Try MCP tool first (try both naming conventions)
      const mcpTool = getMCPTool("mcp_Moneybird_create_contact") || getMCPTool("create_contact");
      if (mcpTool) {
        // Build contact payload, only including defined fields
        const contactPayload: any = {};
        if (contact.company_name) contactPayload.company_name = contact.company_name;
        if (contact.firstname) contactPayload.firstname = contact.firstname;
        if (contact.lastname) contactPayload.lastname = contact.lastname;
        if (contact.email) contactPayload.email = contact.email;
        if (contact.phone) contactPayload.phone = contact.phone;
        if (contact.tax_number) contactPayload.tax_number = contact.tax_number;
        if (contact.bank_account) contactPayload.bank_account = contact.bank_account;
        
        // Validate: at least one of company_name or (firstname + lastname) must be provided
        if (!contactPayload.company_name && (!contactPayload.firstname || !contactPayload.lastname)) {
          throw new Error("Contact requires either company_name or both firstname and lastname");
        }
        
        console.log(JSON.stringify({
          level: "debug",
          event: "calling_mcp_create_contact",
          contact_data: contactPayload,
          timestamp: new Date().toISOString(),
        }));

        const result = await mcpTool({
          contact: contactPayload,
        });
        
        // Check for error responses (MCP protocol errors)
        if (result && typeof result === "object") {
          // Check for JSON-RPC error structure
          if ("error" in result) {
            const errorInfo = result.error as any;
            throw new Error(`MCP error -${errorInfo.code || "unknown"}: ${errorInfo.message || JSON.stringify(errorInfo)}`);
          }
          // Check for string error messages
          if ("message" in result && typeof result.message === "string" && result.message.toLowerCase().includes("error")) {
            throw new Error(result.message);
          }
        }
        
        // Check for string error responses
        if (typeof result === "string" && (result.includes("Error") || result.includes("error") || result.includes("422") || result.includes("400"))) {
          throw new Error(`MCP error: ${result}`);
        }
        
        // Transform MCP response to our type
        if (!result || typeof result !== "object" || !result.id) {
          throw new Error(`Invalid MCP response: ${JSON.stringify(result)}`);
        }
        
        return {
          id: result.id,
          company_name: result.company_name,
          firstname: result.firstname,
          lastname: result.lastname,
          customer_id: result.customer_id,
          tax_number: result.tax_number,
          email: result.email,
          phone: result.phone,
          address1: result.address1,
          address2: result.address2,
          zipcode: result.zipcode,
          city: result.city,
          country: result.country,
          bank_account: result.bank_account,
          sepa_iban: result.sepa_iban,
        };
      }
      
      // Fallback to REST API (not implemented yet)
      throw new Error("MCP tools not available and REST API fallback not implemented");
    } catch (error) {
      console.log(JSON.stringify({
        level: "error",
        event: "create_contact_error_details",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        contact_data: {
          company_name: contact.company_name,
          has_firstname: !!contact.firstname,
          has_lastname: !!contact.lastname,
        },
        timestamp: new Date().toISOString(),
      }));
      throw new Error(`Failed to create contact: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update an existing contact
   */
  async updateContact(
    id: string,
    contact: Partial<CreateContactInput>
  ): Promise<MoneybirdContact> {
    try {
      // Try MCP tool first (try both naming conventions)
      const mcpTool = getMCPTool("mcp_Moneybird_update_contact") || getMCPTool("update_contact");
      if (mcpTool) {
        const result = await mcpTool({
          id,
          contact: {
            company_name: contact.company_name,
            firstname: contact.firstname,
            lastname: contact.lastname,
            email: contact.email,
            phone: contact.phone,
            tax_number: contact.tax_number,
            bank_account: contact.bank_account,
          },
        });
        
        // Transform MCP response to our type
        return {
          id: result.id,
          company_name: result.company_name,
          firstname: result.firstname,
          lastname: result.lastname,
          customer_id: result.customer_id,
          tax_number: result.tax_number,
          email: result.email,
          phone: result.phone,
          address1: result.address1,
          address2: result.address2,
          zipcode: result.zipcode,
          city: result.city,
          country: result.country,
          bank_account: result.bank_account,
          sepa_iban: result.sepa_iban,
        };
      }
      
      // Fallback to REST API (not implemented yet)
      throw new Error("MCP tools not available and REST API fallback not implemented");
    } catch (error) {
      throw new Error(`Failed to update contact ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List invoices in the administration
   */
  async listInvoices(_params?: {
    state?: string;
    contact_id?: string;
  }): Promise<MoneybirdInvoice[]> {
    // TODO: Implement MCP call to list invoices
    // Note: MCP may not have a direct list_invoices tool
    // May need to use REST API fallback
    throw new Error("Not implemented: listInvoices");
  }

  /**
   * Get a specific invoice by ID
   */
  async getInvoice(_id: string): Promise<MoneybirdInvoice> {
    // TODO: Implement MCP call to get invoice
    // Note: MCP may not have a direct get_invoice tool
    // May need to use REST API fallback
    throw new Error("Not implemented: getInvoice");
  }

  /**
   * Update an invoice (draft-safe)
   */
  async updateInvoice(
    _id: string,
    _updates: UpdateInvoiceInput
  ): Promise<MoneybirdInvoice> {
    // TODO: Implement MCP call to update invoice
    // Note: MCP may not have a direct update_invoice tool
    // May need to use REST API fallback
    throw new Error("Not implemented: updateInvoice");
  }

  /**
   * List ledger accounts (kostenposten)
   */
  async listLedgerAccounts(): Promise<MoneybirdLedgerAccount[]> {
    try {
      // Try MCP tool first (try both naming conventions)
      const mcpTool = getMCPTool("mcp_Moneybird_list_ledger_accounts") || getMCPTool("list_ledger_accounts");
      if (mcpTool) {
        const result = await mcpTool({});
        
        // Handle array response
        const accounts = Array.isArray(result) ? result : (result.ledger_accounts || [result]);
        
        // Transform MCP response to our type
        return accounts.map((acc: any) => ({
          id: acc.id,
          name: acc.name || acc.title || "Unknown",
          account_type: acc.account_type || acc.type || "unknown",
          account_id: acc.account_id,
        }));
      }
      
      // Fallback to REST API (not implemented yet)
      throw new Error("MCP tools not available and REST API fallback not implemented");
    } catch (error) {
      throw new Error(`Failed to list ledger accounts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a specific ledger account by ID
   */
  async getLedgerAccount(id: string): Promise<MoneybirdLedgerAccount> {
    try {
      // Try MCP tool first (try both naming conventions)
      const mcpTool = getMCPTool("mcp_Moneybird_get_ledger_account") || getMCPTool("get_ledger_account");
      if (mcpTool) {
        const acc = await mcpTool({ id });
        
        // Transform MCP response to our type
        return {
          id: acc.id,
          name: acc.name || acc.title || "Unknown",
          account_type: acc.account_type || acc.type || "unknown",
          account_id: acc.account_id,
        };
      }
      
      // Fallback to REST API (not implemented yet)
      throw new Error("MCP tools not available and REST API fallback not implemented");
    } catch (error) {
      throw new Error(`Failed to get ledger account ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List purchase invoices (incoming invoices)
   */
  async listPurchaseInvoices(params?: {
    state?: string;
    page?: string;
    per_page?: string;
  }): Promise<MoneybirdInvoice[]> {
    try {
      // Try MCP tool first (try both naming conventions)
      const mcpTool = getMCPTool("mcp_Moneybird_list_purchase_invoices") || getMCPTool("list_purchase_invoices");
      if (mcpTool) {
        const result = await mcpTool({
          state: params?.state,
          page: params?.page,
          per_page: params?.per_page,
        });
        
        // Handle array response
        const invoices = Array.isArray(result) ? result : (result.invoices || [result]);
        
        // Transform MCP response to our type
        return invoices.map((inv: any) => ({
          id: inv.id,
          contact_id: inv.contact_id,
          invoice_id: inv.invoice_id,
          invoice_date: inv.invoice_date,
          due_date: inv.due_date,
          total_price_excl_tax: inv.total_price_excl_tax || 0,
          total_price_incl_tax: inv.total_price_incl_tax || 0,
          tax: inv.tax,
          currency: inv.currency || "EUR",
          state: inv.state || "draft",
          reference: inv.reference,
          notes: inv.notes,
          attachments: inv.attachments || [],
        }));
      }
      
      // Fallback to REST API (not implemented yet)
      throw new Error("MCP tools not available and REST API fallback not implemented");
    } catch (error) {
      throw new Error(`Failed to list purchase invoices: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a specific purchase invoice by ID
   */
  async getPurchaseInvoice(id: string): Promise<MoneybirdInvoice> {
    try {
      // Try MCP tool first (try both naming conventions)
      const mcpTool = getMCPTool("mcp_Moneybird_get_purchase_invoice") || getMCPTool("get_purchase_invoice");
      if (mcpTool) {
        const inv = await mcpTool({ id });
        
        // Transform MCP response to our type
        return {
          id: inv.id,
          contact_id: inv.contact_id,
          invoice_id: inv.invoice_id,
          invoice_date: inv.invoice_date,
          due_date: inv.due_date,
          total_price_excl_tax: inv.total_price_excl_tax || 0,
          total_price_incl_tax: inv.total_price_incl_tax || 0,
          tax: inv.tax,
          currency: inv.currency || "EUR",
          state: inv.state || "draft",
          reference: inv.reference,
          notes: inv.notes,
          attachments: inv.attachments || [],
        };
      }
      
      // Fallback to REST API (not implemented yet)
      throw new Error("MCP tools not available and REST API fallback not implemented");
    } catch (error) {
      throw new Error(`Failed to get purchase invoice ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update a purchase invoice (draft-safe)
   */
  async updatePurchaseInvoice(
    id: string,
    updates: UpdateInvoiceInput
  ): Promise<MoneybirdInvoice> {
    try {
      // Try MCP tool first (try both naming conventions)
      const mcpTool = getMCPTool("mcp_Moneybird_update_purchase_invoice") || getMCPTool("update_purchase_invoice");
      if (mcpTool) {
        const purchaseInvoiceUpdate: any = {
          contact_id: updates.contact_id,
          invoice_date: updates.invoice_date,
          total_price_excl_tax: updates.total_price_excl_tax,
          total_price_incl_tax: updates.total_price_incl_tax,
          tax: updates.tax,
          reference: updates.reference,
          notes: updates.notes,
        };
        
        // Add currency if provided (Moneybird may support currency updates)
        if (updates.currency) {
          purchaseInvoiceUpdate.currency = updates.currency;
        }
        
        // Try including state field - Moneybird might allow setting state to "draft" to convert from "new"
        // This is experimental - if the invoice is already in draft, this shouldn't change it
        // If the invoice is in "new" state, setting state to "draft" might allow the update
        // Note: According to Moneybird API docs, there's no explicit state transition endpoint,
        // but some updates might trigger automatic state conversion
        if (updates.state) {
          purchaseInvoiceUpdate.state = updates.state;
        }
        
        console.log(JSON.stringify({
          level: "debug",
          event: "calling_mcp_update_purchase_invoice",
          invoice_id: id,
          updates: purchaseInvoiceUpdate,
          timestamp: new Date().toISOString(),
        }));

        const inv = await mcpTool({
          id,
          purchase_invoice: purchaseInvoiceUpdate,
        });

        // Check if response is an error
        if (typeof inv === "string" && (inv.includes("Error") || inv.includes("error") || inv.includes("422"))) {
          throw new Error(inv);
        }
        
        console.log(JSON.stringify({
          level: "debug",
          event: "mcp_update_purchase_invoice_response",
          invoice_id: id,
          response: typeof inv === "object" ? JSON.stringify(inv).substring(0, 500) : String(inv).substring(0, 500),
          timestamp: new Date().toISOString(),
        }));
        
        // Transform MCP response to our type
        return {
          id: inv.id,
          contact_id: inv.contact_id,
          invoice_id: inv.invoice_id,
          invoice_date: inv.invoice_date,
          due_date: inv.due_date,
          total_price_excl_tax: inv.total_price_excl_tax || 0,
          total_price_incl_tax: inv.total_price_incl_tax || 0,
          tax: inv.tax,
          currency: inv.currency || "EUR",
          state: inv.state || "draft",
          reference: inv.reference,
          notes: inv.notes,
          attachments: inv.attachments || [],
        };
      }
      
      // Fallback to REST API (not implemented yet)
      throw new Error("MCP tools not available and REST API fallback not implemented");
    } catch (error) {
      console.log(JSON.stringify({
        level: "error",
        event: "update_purchase_invoice_failed",
        invoice_id: id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }));
      throw new Error(`Failed to update purchase invoice ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create a new purchase invoice (for recreating invoices that can't be updated)
   */
  async createPurchaseInvoice(
    invoice: CreateInvoiceInput
  ): Promise<MoneybirdInvoice> {
    try {
      const mcpTool = getMCPTool("mcp_Moneybird_create_purchase_invoice") || getMCPTool("create_purchase_invoice");
      if (mcpTool) {
        const purchaseInvoiceData: any = {
          contact_id: invoice.contact_id,
        };

        if (invoice.invoice_date) {
          purchaseInvoiceData.invoice_date = invoice.invoice_date;
        }

        if (invoice.total_price_excl_tax !== undefined) {
          purchaseInvoiceData.total_price_excl_tax = invoice.total_price_excl_tax;
        }

        if (invoice.total_price_incl_tax !== undefined) {
          purchaseInvoiceData.total_price_incl_tax = invoice.total_price_incl_tax;
        }

        if (invoice.tax !== undefined) {
          purchaseInvoiceData.tax = invoice.tax;
        }

        if (invoice.reference) {
          purchaseInvoiceData.reference = invoice.reference;
        }

        if (invoice.notes) {
          purchaseInvoiceData.notes = invoice.notes;
        }

        if (invoice.currency) {
          purchaseInvoiceData.currency = invoice.currency;
        }

        // Create in "draft" state so it can be updated later
        purchaseInvoiceData.state = invoice.state || "draft";

        console.log(JSON.stringify({
          level: "debug",
          event: "calling_mcp_create_purchase_invoice",
          invoice_data: purchaseInvoiceData,
          timestamp: new Date().toISOString(),
        }));

        const inv = await mcpTool({
          purchase_invoice: purchaseInvoiceData,
        });

        // Check if response is an error
        if (typeof inv === "string" && (inv.includes("Error") || inv.includes("error") || inv.includes("422"))) {
          throw new Error(inv);
        }

        console.log(JSON.stringify({
          level: "debug",
          event: "mcp_create_purchase_invoice_response",
          invoice_id: inv.id,
          response: typeof inv === "object" ? JSON.stringify(inv).substring(0, 500) : String(inv).substring(0, 500),
          timestamp: new Date().toISOString(),
        }));

        // Transform MCP response to our type
        return {
          id: inv.id,
          contact_id: inv.contact_id,
          invoice_id: inv.invoice_id,
          invoice_date: inv.invoice_date,
          due_date: inv.due_date,
          total_price_excl_tax: inv.total_price_excl_tax || 0,
          total_price_incl_tax: inv.total_price_incl_tax || 0,
          tax: inv.tax,
          currency: inv.currency || "EUR",
          state: inv.state || "draft",
          reference: inv.reference,
          notes: inv.notes,
          attachments: inv.attachments || [],
        };
      }
      throw new Error("MCP tools not available and REST API fallback not implemented");
    } catch (error) {
      console.log(JSON.stringify({
        level: "error",
        event: "create_purchase_invoice_failed",
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }));
      throw new Error(`Failed to create purchase invoice: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete a purchase invoice
   * Uses REST API directly since MCP tool is not available
   */
  async deletePurchaseInvoice(id: string): Promise<void> {
    try {
      // Try MCP tool first (in case it becomes available)
      const mcpTool = getMCPTool("mcp_Moneybird_delete_purchase_invoice") || getMCPTool("delete_purchase_invoice");
      if (mcpTool) {
        await mcpTool({ id });
        console.log(JSON.stringify({
          level: "debug",
          event: "mcp_delete_purchase_invoice_success",
          invoice_id: id,
          timestamp: new Date().toISOString(),
        }));
        return;
      }

      // Fallback to REST API
      const env = getEnv();
      const administrationId = this._administrationId || env.MONEYBIRD_ADMINISTRATION_ID;
      const accessToken = this._accessToken || env.MONEYBIRD_ACCESS_TOKEN;

      if (!administrationId || !accessToken) {
        throw new Error("Administration ID and access token required for REST API delete");
      }

      const url = `https://moneybird.com/api/v2/${administrationId}/documents/purchase_invoices/${id}.json`;

      console.log(JSON.stringify({
        level: "debug",
        event: "calling_rest_api_delete_purchase_invoice",
        invoice_id: id,
        url: url.replace(accessToken, "***"),
        timestamp: new Date().toISOString(),
      }));

      const response = await fetch(url, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Moneybird API Error: ${response.statusText}, Status: ${response.status}. ${errorText}`);
      }

      console.log(JSON.stringify({
        level: "info",
        event: "rest_api_delete_purchase_invoice_success",
        invoice_id: id,
        status: response.status,
        timestamp: new Date().toISOString(),
      }));
    } catch (error) {
      console.log(JSON.stringify({
        level: "error",
        event: "delete_purchase_invoice_failed",
        invoice_id: id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      }));
      throw new Error(`Failed to delete purchase invoice ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List financial mutations (bank transactions)
   */
  async listFinancialMutations(params?: {
    financial_account_id?: string;
    contact_id?: string;
    from_date?: string;
    to_date?: string;
    page?: string;
    per_page?: string;
  }): Promise<MoneybirdTransaction[]> {
    try {
      // Try MCP tool first (try both naming conventions)
      const mcpTool = getMCPTool("mcp_Moneybird_list_financial_mutations") || getMCPTool("list_financial_mutations");
      if (mcpTool) {
        const result = await mcpTool({
          financial_account_id: params?.financial_account_id,
          contact_id: params?.contact_id,
          from_date: params?.from_date,
          to_date: params?.to_date,
          page: params?.page,
          per_page: params?.per_page,
        });
        
        // Handle array response
        const mutations = Array.isArray(result) ? result : (result.financial_mutations || [result]);
        
        // Transform MCP response to our type
        return mutations.map((mut: any) => ({
          id: mut.id,
          date: mut.date || mut.transaction_date || mut.value_date,
          amount: mut.amount || 0,
          description: mut.message || mut.description || mut.note,
          account_id: mut.financial_account_id || mut.account_id,
          contact_id: mut.contact_id,
          invoice_id: mut.invoice_id,
        }));
      }
      
      // Fallback to REST API (not implemented yet)
      throw new Error("MCP tools not available and REST API fallback not implemented");
    } catch (error) {
      throw new Error(`Failed to list financial mutations: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get a specific financial mutation by ID
   */
  async getFinancialMutation(id: string): Promise<MoneybirdTransaction> {
    try {
      // Try MCP tool first (try both naming conventions)
      const mcpTool = getMCPTool("mcp_Moneybird_get_financial_mutation") || getMCPTool("get_financial_mutation");
      if (mcpTool) {
        const mut = await mcpTool({ id });
        
        // Transform MCP response to our type
        return {
          id: mut.id,
          date: mut.date || mut.transaction_date || mut.value_date,
          amount: mut.amount || 0,
          description: mut.message || mut.description || mut.note,
          account_id: mut.financial_account_id || mut.account_id,
          contact_id: mut.contact_id,
          invoice_id: mut.invoice_id,
        };
      }
      
      // Fallback to REST API (not implemented yet)
      throw new Error("MCP tools not available and REST API fallback not implemented");
    } catch (error) {
      throw new Error(`Failed to get financial mutation ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List transactions (alias for listFinancialMutations for backward compatibility)
   */
  async listTransactions(params?: {
    account_id?: string;
    contact_id?: string;
    date_from?: string;
    date_to?: string;
  }): Promise<MoneybirdTransaction[]> {
    return this.listFinancialMutations({
      financial_account_id: params?.account_id,
      contact_id: params?.contact_id,
      from_date: params?.date_from,
      to_date: params?.date_to,
    });
  }

  /**
   * Get receipt (for purchase invoices, receipts contain the PDF)
   */
  async getReceipt(id: string): Promise<{ id: string; url?: string; filename?: string; data?: any }> {
    try {
      const mcpTool = getMCPTool("mcp_Moneybird_get_receipt") || getMCPTool("get_receipt");
      if (mcpTool) {
        const receipt = await mcpTool({ id });
        
        // Check if receipt is already a Buffer
        if (Buffer.isBuffer(receipt)) {
          return {
            id: id,
            data: receipt,
          };
        }
        
        // Check if receipt is a string (might be base64-encoded PDF)
        if (typeof receipt === "string") {
          // Try to decode as base64
          try {
            const decoded = Buffer.from(receipt, "base64");
            // Check if it looks like a PDF (starts with %PDF)
            if (decoded.length > 4 && decoded.toString("ascii", 0, 4) === "%PDF") {
              return {
                id: id,
                data: decoded,
              };
            }
            // If not PDF, might still be valid data
            if (decoded.length > 100) {
              return {
                id: id,
                data: decoded,
              };
            }
          } catch {
            // Not base64, continue
          }
        }
        
        // Check if receipt is an array (byte array)
        if (Array.isArray(receipt)) {
          return {
            id: id,
            data: receipt, // Will be converted to Buffer in downloadReceiptPdf
          };
        }
        
        // Log receipt response structure for debugging
        const receiptKeys = receipt && typeof receipt === "object" ? Object.keys(receipt || {}) : [];
        const isByteArray = receiptKeys.length > 0 && receiptKeys.every(k => /^\d+$/.test(k));
        
        console.log(JSON.stringify({
          level: "debug",
          event: "receipt_response",
          receipt_id: id,
          receipt_type: Array.isArray(receipt) ? "array" : typeof receipt,
          receipt_length: typeof receipt === "string" ? receipt.length : (Array.isArray(receipt) ? receipt.length : receiptKeys.length),
          receipt_keys: receiptKeys.slice(0, 10), // First 10 keys
          is_byte_array: isByteArray,
          has_url: !!(receipt?.url || receipt?.download_url),
          has_data: !!(receipt?.data || receipt?.content || receipt?.base64),
          timestamp: new Date().toISOString(),
        }));
        
        // If receipt is an object with numeric keys, it's likely a byte array representation
        if (isByteArray && receipt && typeof receipt === "object") {
          return {
            id: receipt.id || id,
            data: receipt, // Will be converted to Buffer
          };
        }
        
        return {
          id: receipt?.id || id,
          url: receipt?.url || receipt?.download_url,
          filename: receipt?.filename,
          data: receipt?.data || receipt?.content || receipt?.base64,
        };
      }
      throw new Error("MCP tools not available and REST API fallback not implemented");
    } catch (error) {
      throw new Error(`Failed to get receipt ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * List receipts for a purchase invoice
   */
  async listReceipts(params?: {
    purchase_invoice_id?: string;
    page?: string;
    per_page?: string;
  }): Promise<Array<{ id: string; url?: string; filename?: string }>> {
    try {
      const mcpTool = getMCPTool("mcp_Moneybird_list_receipts") || getMCPTool("list_receipts");
      if (mcpTool) {
        const result = await mcpTool({
          purchase_invoice_id: params?.purchase_invoice_id,
          page: params?.page,
          per_page: params?.per_page,
        });
        const receipts = Array.isArray(result) ? result : (result.receipts || [result]);
        return receipts.map((r: any) => ({
          id: r.id,
          url: r.url || r.download_url,
          filename: r.filename,
        }));
      }
      throw new Error("MCP tools not available and REST API fallback not implemented");
    } catch (error) {
      throw new Error(`Failed to list receipts: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Download receipt PDF content directly via MCP
   * Returns the PDF as a Buffer
   */
  async downloadReceiptPdf(receiptId: string): Promise<Buffer> {
    try {
      // Try direct download tool if available
      const downloadTool = getMCPTool("mcp_Moneybird_download_receipt_pdf") || 
                          getMCPTool("download_receipt_pdf") ||
                          getMCPTool("mcp_Moneybird_get_receipt_pdf") ||
                          getMCPTool("get_receipt_pdf");
      
      if (downloadTool) {
        const result = await downloadTool({ id: receiptId });
        
        // Check if result is already a buffer or base64
        if (Buffer.isBuffer(result)) {
          return result;
        }
        
        // If result is base64 string
        if (typeof result === "string") {
          if (result.startsWith("data:")) {
            // Data URL format: data:application/pdf;base64,{base64}
            const base64Part = result.split(",")[1];
            return Buffer.from(base64Part, "base64");
          }
          // Assume it's base64
          return Buffer.from(result, "base64");
        }
        
        // If result is an object with data or content
        if (result && typeof result === "object") {
          if (result.data) {
            const data = result.data;
            if (typeof data === "string") {
              return Buffer.from(data, "base64");
            }
            if (Buffer.isBuffer(data)) {
              return data;
            }
          }
          if (result.content) {
            const content = result.content;
            if (typeof content === "string") {
              return Buffer.from(content, "base64");
            }
            if (Buffer.isBuffer(content)) {
              return content;
            }
          }
          if (result.base64) {
            return Buffer.from(result.base64, "base64");
          }
        }
        
        throw new Error("Unexpected receipt PDF format from MCP tool");
      }
      
      // Fallback: Get receipt and check for various download methods
      const receipt = await this.getReceipt(receiptId);
      
      // Log receipt structure for debugging
      console.log(JSON.stringify({
        level: "debug",
        event: "receipt_download_inspection",
        receipt_id: receiptId,
        receipt_keys: Object.keys(receipt || {}),
        receipt_data_type: receipt?.data ? typeof receipt.data : "none",
        receipt_data_length: receipt?.data ? (typeof receipt.data === "string" ? receipt.data.length : (Array.isArray(receipt.data) ? receipt.data.length : "unknown")) : 0,
        receipt_url: receipt?.url || "none",
        timestamp: new Date().toISOString(),
      }));
      
      // Check if receipt.data contains the PDF
      if (receipt.data) {
        // If data is a Buffer
        if (Buffer.isBuffer(receipt.data)) {
          return receipt.data;
        }
        
        // If data is a string, try base64 decode
        if (typeof receipt.data === "string") {
          try {
            const decoded = Buffer.from(receipt.data, "base64");
            // Verify it's a PDF (starts with %PDF)
            if (decoded.length > 4 && decoded.toString("ascii", 0, 4) === "%PDF") {
              return decoded;
            }
            // Even if not PDF header, if it's large enough, return it
            if (decoded.length > 100) {
              return decoded;
            }
          } catch (e) {
            // Not base64, continue
          }
        }
        
        // If data is an array (byte array)
        if (Array.isArray(receipt.data)) {
          return Buffer.from(receipt.data);
        }
      }
      
      // Check if receipt is a byte array (MCP might return PDF as array of bytes)
      if (Array.isArray(receipt)) {
        return Buffer.from(receipt);
      }
      
      // Check if receipt response is an object with numeric keys (byte array representation)
      if (receipt && typeof receipt === "object" && !Array.isArray(receipt)) {
        const keys = Object.keys(receipt);
        // If all keys are numeric strings, it's likely a byte array
        if (keys.length > 0 && keys.every(k => /^\d+$/.test(k))) {
          const byteArray = keys.map(k => receipt[k as keyof typeof receipt]).filter(v => typeof v === "number");
          if (byteArray.length > 0) {
            return Buffer.from(byteArray);
          }
        }
      }
      
      // Try URL download
      if (receipt.url) {
        const env = getEnv();
        const response = await fetch(receipt.url, {
          headers: {
            Authorization: `Bearer ${env.MCP_SERVER_AUTH_TOKEN || process.env.MCP_SERVER_AUTH_TOKEN || ""}`,
          },
        });
        
        if (!response.ok) {
          throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
        }
        
        return Buffer.from(await response.arrayBuffer());
      }
      
      // Try constructing URL from receipt ID
      // Moneybird API pattern: /{administration_id}/documents/receipts/{id}/download
      if (this._administrationId) {
        try {
          const constructedUrl = `https://moneybird.com/api/v2/${this._administrationId}/documents/receipts/${receiptId}/download`;
          const env = getEnv();
          const response = await fetch(constructedUrl, {
            headers: {
              Authorization: `Bearer ${env.MCP_SERVER_AUTH_TOKEN || process.env.MCP_SERVER_AUTH_TOKEN || ""}`,
            },
          });
          
          if (response.ok) {
            return Buffer.from(await response.arrayBuffer());
          }
        } catch (urlError) {
          // URL construction failed, continue to error
        }
      }
      
      throw new Error(`No download method available for receipt ${receiptId}. Receipt data: ${JSON.stringify(Object.keys(receipt || {}))}`);
    } catch (error) {
      throw new Error(`Failed to download receipt PDF ${receiptId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
