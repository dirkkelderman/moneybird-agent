# Technology & Architecture

## Tech Stack

### Runtime

- Node.js 20+
- TypeScript

### AI & Orchestration

- LangGraph (JavaScript)
- OpenAI GPT-4.1 (primary)
- Optional: Anthropic Claude 3.5 (secondary)

### Moneybird Integration

- Moneybird MCP (Model Context Protocol)
- Moneybird REST API (fallback where needed)
- Moneybird Webhooks (optional, later)

### Storage

- SQLite (local, encrypted if needed)
- Used for:
  - Learning patterns
  - Correction history
  - Processing state

### OCR / Document Processing

- PDF text extraction (pdf-parse)
- Vision model for scanned PDFs
- Structured JSON-only outputs

### Infrastructure

- VPS (Hetzner recommended)
- Ubuntu LTS
- systemd or PM2
- Optional Docker

---

## High-Level Architecture

┌─────────────────────────────┐
│ VPS │
│ │
│ ┌───────────────────────┐ │
│ │ Node.js Agent Service │ │
│ │ │ │
│ │ ┌─────────────────┐ │ │
│ │ │ LangGraph │ │ │
│ │ │ Agent Workflow │ │ │
│ │ └───────┬─────────┘ │ │
│ │ │ │ │
│ │ ┌───────▼─────────┐ │ │
│ │ │ MCP Client │─┼──┼──▶ Moneybird MCP
│ │ └─────────────────┘ │ │
│ │ │ │
│ │ ┌─────────────────┐ │ │
│ │ │ SQLite Learning │ │ │
│ │ └─────────────────┘ │ │
│ └───────────────────────┘ │
└─────────────────────────────┘

---

## Agent Design (LangGraph)

### Agents / Nodes

- DetectNewInvoices
- CheckInvoiceCompleteness
- ScanInvoicePdf
- ResolveOrCreateContact
- ValidateAmountsAndBTW
- ClassifyKostenpost
- MatchBankTransactions
- ConfidenceGate
- AutoBookDraft
- AlertUser
- LearnFromCorrections

Each node:

- Receives structured state
- Produces structured output
- Has no hidden side effects

---

## Project Structure

src/
├── index.ts
├── agent/
│ ├── graph.ts
│ ├── state.ts
│ ├── nodes/
│ │ ├── detectNewInvoices.ts
│ │ ├── checkCompleteness.ts
│ │ ├── scanInvoicePdf.ts
│ │ ├── resolveContact.ts
│ │ ├── validateInvoice.ts
│ │ ├── classifyKostenpost.ts
│ │ ├── matchTransactions.ts
│ │ ├── confidenceGate.ts
│ │ ├── autoBook.ts
│ │ └── alert.ts
│ └── prompts/
│ └── kostenpost.ts
├── moneybird/
│ ├── mcpClient.ts
│ ├── tools.ts
│ └── types.ts
├── storage/
│ ├── db.ts
│ └── learning.ts
├── scheduler/
│ └── cron.ts
└── config/
└── env.ts

---

## Deployment Plan

### VPS Setup

1. Provision Ubuntu VPS
2. Install:
   - Node.js 20
   - SQLite
3. Clone repository
4. Set environment variables:
   - MONEYBIRD_TOKEN
   - OPENAI_API_KEY
5. Build:
   ```bash
   npm install
   npm run build
   ```
   6. Run via:
      • systemd service or
      • PM2

Runtime Mode
• Long-running service
• Hourly cron trigger inside app
• Optional webhook listener

Logging
• Structured JSON logs
• Action + confidence + reason
• Stored locally + optional export
