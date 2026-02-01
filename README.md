# Moneybird Agent

Autonomous AI-powered bookkeeping agent for Moneybird. Automates invoice processing, contact resolution, kostenpost classification, and bank transaction matching.

## Quick Start

```bash
git clone https://github.com/dirkkelderman/moneybird-agent.git
cd moneybird-agent
npm install
cp .env.example .env
# Edit .env with your credentials
npm run build
npm start
```

## Configuration

Required environment variables:

```env
MCP_SERVER_URL=https://moneybird.com/mcp/v1/read_write
MCP_SERVER_AUTH_TOKEN=your_bearer_token
OPENAI_API_KEY=your_openai_api_key
```

Optional variables (see `.env.example` for full list):
- `MONEYBIRD_ADMINISTRATION_ID` - Recommended
- `CONFIDENCE_AUTO_THRESHOLD` - Default: 95
- `CRON_SCHEDULE` - Default: hourly
- Email/WhatsApp notifications (only if needed)

## Deployment

### Docker (Recommended)

```bash
docker-compose up -d
```

See [docs/DEPLOYMENT_HETZNER.md](./docs/DEPLOYMENT_HETZNER.md) for detailed Hetzner deployment.

### Production

```bash
npm run build
npm start
```

Or use PM2/systemd (see [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)).

## Features

- **Invoice Detection**: Automatically detects new incoming invoices
- **OCR/PDF Processing**: Extracts data using OpenAI Vision API
- **Contact Resolution**: Matches or creates supplier contacts
- **Kostenpost Classification**: AI-powered ledger account classification
- **Bank Transaction Matching**: Matches invoices to transactions
- **Confidence-Based Automation**: Auto-books only when confidence ≥95%
- **Draft-Safe**: All operations create drafts only

## Tech Stack

- Node.js 20+ / TypeScript
- LangGraph for workflow orchestration
- OpenAI GPT-4o for AI
- SQLite for local storage
- Moneybird MCP for integration

## Documentation

- [Product Requirements](./docs/PRODUCT_REQUIREMENTS.md)
- [Project Overview](./docs/PROJECT_OVERVIEW.md)
- [Tech Stack](./docs/TECH_STACK.md)
- [Deployment](./docs/DEPLOYMENT.md)
- [Notifications](./docs/NOTIFICATIONS.md)

## License

MIT
