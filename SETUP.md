# Setup Guide

This document outlines the current state of the project and next steps for implementation.

## ✅ Completed

### Repository Structure

- ✅ Complete project structure as defined in `TECH_STACK.md`
- ✅ TypeScript configuration
- ✅ Package.json with all dependencies
- ✅ ESLint configuration
- ✅ Git ignore file

### Core Infrastructure

- ✅ Environment configuration (`src/config/env.ts`)
- ✅ SQLite database setup with schema (`src/storage/db.ts`)
- ✅ Learning system for pattern storage (`src/storage/learning.ts`)
- ✅ Scheduler/cron system (`src/scheduler/cron.ts`)
- ✅ Main entry point with graceful shutdown (`src/index.ts`)

### LangGraph Workflow

- ✅ State type definitions (`src/agent/state.ts`)
- ✅ Workflow graph structure (`src/agent/graph.ts`)
- ✅ All 10 workflow nodes implemented as placeholders:
  - `detectNewInvoices.ts`
  - `checkCompleteness.ts`
  - `scanInvoicePdf.ts`
  - `resolveContact.ts`
  - `validateInvoice.ts`
  - `classifyKostenpost.ts`
  - `matchTransactions.ts`
  - `confidenceGate.ts`
  - `autoBook.ts`
  - `alert.ts`

### Moneybird Integration

- ✅ Type definitions (`src/moneybird/types.ts`)
- ✅ MCP client abstraction (`src/moneybird/mcpClient.ts`)
- ✅ Tools placeholder (`src/moneybird/tools.ts`)

### Documentation

- ✅ README.md with setup instructions
- ✅ This setup guide

## 🔧 Next Steps

### 1. Install Dependencies

```bash
npm install
```

### 2. Verify LangGraph API

The LangGraph implementation in `src/agent/graph.ts` uses a placeholder API structure. After installing dependencies, verify the actual LangGraph API matches. You may need to adjust:

- `StateGraph` constructor parameters
- State channel definitions
- Node function signatures
- Edge and conditional edge definitions

### 3. Implement Moneybird MCP Integration

The `MoneybirdMCPClient` in `src/moneybird/mcpClient.ts` currently has placeholder methods. You need to:

1. Connect to the Moneybird MCP server
2. Implement actual MCP tool calls using the available MCP tools:

   - `mcp_Moneybird_list_administrations`
   - `mcp_Moneybird_list_contacts`
   - `mcp_Moneybird_get_contact`
   - `mcp_Moneybird_create_contact`
   - `mcp_Moneybird_update_contact`
   - And others as needed

3. For operations not available via MCP, implement REST API fallback

### 4. Implement Node Logic

Each node in `src/agent/nodes/` has placeholder logic. Implement:

- **detectNewInvoices**: Query Moneybird for new invoices
- **checkCompleteness**: Validate invoice fields
- **scanInvoicePdf**: Implement PDF text extraction and vision model calls
- **resolveContact**: Implement contact matching and creation logic
- **validateInvoice**: Implement amount and VAT validation
- **classifyKostenpost**: Implement AI classification with learning integration
- **matchTransactions**: Implement transaction matching logic
- **confidenceGate**: Already implemented, verify thresholds
- **autoBook**: Implement Moneybird invoice update
- **alert**: Implement alert mechanism (email, webhook, etc.)

### 5. Testing

1. Create unit tests for each node
2. Create integration tests for the workflow
3. Test with real Moneybird data (use test environment)

### 6. Environment Setup

1. Create `.env` file from `.env.example`
2. Configure Moneybird token
3. Configure OpenAI API key
4. Set confidence thresholds
5. Configure database path

### 7. Build and Run

```bash
npm run build
npm start
```

## 📝 Implementation Notes

### LangGraph State Management

The workflow uses a shared `AgentState` that flows through all nodes. Each node:

- Receives the full state
- Returns a partial state with updates
- LangGraph merges the updates automatically

### Confidence System

Confidence thresholds are configurable via environment variables:

- `CONFIDENCE_AUTO_THRESHOLD` (default: 95%)
- `CONFIDENCE_REVIEW_THRESHOLD` (default: 80%)

Special cases that always require review:

- New suppliers
- High amounts (exceeds `AMOUNT_REVIEW_THRESHOLD`)
- Any decision with `requiresReview: true`

### Safety Features

- All Moneybird writes are draft-only
- All actions are logged to SQLite
- Errors are caught and logged
- Graceful shutdown on SIGINT/SIGTERM

### Learning System

The learning system stores:

- Supplier → kostenpost mappings
- User corrections
- Processing history

This data improves future confidence scores.

## 🚨 Important Reminders

1. **Never finalize bookings automatically** - Always create drafts
2. **Always use structured JSON** for AI outputs - Never parse free-form text
3. **Moneybird is source of truth** - Don't invent fields or behavior
4. **MCP first, REST fallback** - Use MCP when available, REST only if needed
5. **Test thoroughly** - Especially confidence thresholds and edge cases

## 🔍 Architecture Decisions

- **SQLite for local storage**: Simple, no external dependencies, suitable for single-user
- **LangGraph for orchestration**: Provides clear workflow visualization and state management
- **OpenAI GPT-4.1 primary**: As specified in requirements
- **Structured logging**: JSON logs for easy parsing and analysis
- **Draft-first approach**: All operations are reversible

## 📚 References

- Project documentation: `/docs/`
- LangGraph documentation: https://js.langchain.com/docs/langgraph
- Moneybird API: https://developer.moneybird.com/
- Moneybird MCP: Use available MCP tools
