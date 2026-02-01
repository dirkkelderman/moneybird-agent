# Moneybird MCP Integration

## Status: ✅ Implemented

The Moneybird MCP client has been implemented with the following features:

### Implemented MCP Tools

1. ✅ `listAdministrations()` - List all administrations
2. ✅ `listContacts()` - List contacts with query/pagination
3. ✅ `getContact(id)` - Get a specific contact by ID
4. ✅ `createContact(contact)` - Create a new contact
5. ✅ `updateContact(id, contact)` - Update an existing contact

### Architecture

The `MoneybirdMCPClient` class:
- Checks for MCP tools at runtime via `globalThis`
- Falls back to REST API (when implemented) if MCP tools are not available
- Transforms MCP responses to our internal type system
- Handles errors gracefully

### Testing MCP Tools

MCP tools have been tested and verified to work:
- ✅ `list_administrations` returns: 1 administration (Dozijn13, ID: 221094161112106510)
- ✅ `list_contacts` returns: Array of contacts with full details

### Example Response Structure

**Administration:**
```json
{
  "id": "221094161112106510",
  "name": "Dozijn13",
  "language": "nl",
  "currency": "EUR",
  "country": "NL"
}
```

**Contact:**
```json
{
  "id": "233885216737854740",
  "company_name": "010 Kawinaband",
  "customer_id": "945",
  "email": "...",
  "bank_account": "...",
  "sepa_iban": "...",
  ...
}
```

### Runtime Environment

**In Cursor/Development:**
- MCP tools are available via the tool calling interface
- Can be tested directly

**In Production Node.js:**
- MCP tools need to be provided via an MCP client library
- Or inject them using `injectMCPTools()` from `mcpInjector.ts`
- Or implement REST API fallback

### Next Steps

1. **For Production:**
   - Integrate an MCP client library (e.g., `@modelcontextprotocol/sdk`)
   - Or implement REST API fallback using OAuth credentials
   - Or use the injector pattern for testing

2. **Remaining MCP Tools to Implement:**
   - List invoices (may need REST API fallback)
   - Get invoice (may need REST API fallback)
   - Update invoice (may need REST API fallback)
   - List ledger accounts (may need REST API fallback)
   - List transactions (may need REST API fallback)

### Usage Example

```typescript
import { MoneybirdMCPClient } from "./moneybird/mcpClient.js";

const client = new MoneybirdMCPClient();

// List administrations
const administrations = await client.listAdministrations();
console.log(administrations); // [{ id: "...", name: "..." }]

// List contacts
const contacts = await client.listContacts({ per_page: "10" });
console.log(contacts); // Array of MoneybirdContact

// Get specific contact
const contact = await client.getContact("233885216737854740");
console.log(contact.company_name); // "010 Kawinaband"

// Create new contact
const newContact = await client.createContact({
  company_name: "New Company",
  email: "contact@example.com",
});
console.log(newContact.id); // New contact ID
```

### Error Handling

All methods throw descriptive errors if:
- MCP tools are not available
- REST API fallback is not implemented
- Moneybird API returns an error
- Invalid parameters are provided
