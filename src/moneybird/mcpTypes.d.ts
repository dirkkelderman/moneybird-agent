/**
 * Moneybird MCP Tool Type Declarations
 * 
 * These are the type definitions for Moneybird MCP tools.
 * In the Cursor environment, these functions are available globally.
 * In production, these would be called through an MCP client.
 */

declare function mcp_Moneybird_list_administrations(): Promise<Array<{ id: string; name?: string }>>;

declare function mcp_Moneybird_list_contacts(params?: {
  query?: string;
  page?: string;
  per_page?: string;
}): Promise<Array<any>>;

declare function mcp_Moneybird_get_contact(params: {
  id: string;
}): Promise<any>;

declare function mcp_Moneybird_create_contact(params: {
  contact: {
    company_name?: string;
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    tax_number?: string;
    bank_account?: string;
  };
}): Promise<any>;

declare function mcp_Moneybird_update_contact(params: {
  id: string;
  contact: {
    company_name?: string;
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    tax_number?: string;
    bank_account?: string;
  };
}): Promise<any>;
