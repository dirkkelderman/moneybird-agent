# Moneybird Agent

Autonomous AI-powered bookkeeping agent for Moneybird. Automates invoice processing, contact resolution, kostenpost classification, and bank transaction matching.

## Overview

This is a production-grade Node.js + TypeScript application that runs as a long-running backend service on a VPS. It uses LangGraph for workflow orchestration and OpenAI GPT-4.1 for AI decision-making.

## Features

- **Invoice Detection**: Automatically detects new incoming invoices in Moneybird
- **OCR/PDF Processing**: Extracts data from invoice PDFs using OCR and vision models
- **Contact Resolution**: Matches suppliers to existing contacts or creates new ones
- **Kostenpost Classification**: AI-powered classification to correct ledger accounts
- **Bank Transaction Matching**: Matches invoices to bank transactions
- **Confidence-Based Automation**: Only auto-books when confidence is high (≥95%)
- **Learning System**: Learns from user corrections to improve future accuracy
- **Draft-Safe**: All operations create drafts only, never finalize automatically

## Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **Orchestration**: LangGraph (JavaScript/TypeScript)
- **AI**: OpenAI GPT-4.1 (primary)
- **Storage**: SQLite (local)
- **Integration**: Moneybird MCP (Model Context Protocol)

## Prerequisites

- Node.js 20 or higher
- SQLite 3
- Moneybird account with API access
- OpenAI API key

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/YOUR_USERNAME/moneybird-agent.git
   cd moneybird-agent
   ```

   Or if you have SSH access:

   ```bash
   git clone git@github.com:YOUR_USERNAME/moneybird-agent.git
   cd moneybird-agent
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create `.env` file:

   ```bash
   cp .env.example .env
   ```

4. Configure environment variables (see Configuration section)

5. Build the project:
   ```bash
   npm run build
   ```

## Configuration

Create a `.env` file with the following variables:

**Option 1: OAuth (for REST API fallback)**

```env
# Moneybird - OAuth
MONEYBIRD_CLIENT_ID=your_client_id
MONEYBIRD_CLIENT_SECRET=your_client_secret
MONEYBIRD_ACCESS_TOKEN=your_access_token
MONEYBIRD_ADMINISTRATION_ID=your_administration_id  # Optional but recommended
```

**Option 2: Token (for MCP or direct API)**

```env
# Moneybird - Token
MONEYBIRD_TOKEN=your_moneybird_api_token
MONEYBIRD_ADMINISTRATION_ID=your_administration_id  # Optional but recommended
```

**Option 3: MCP Server (for standalone Node.js)**

```env
# MCP Server Configuration
MCP_TRANSPORT=stdio
MCP_SERVER_COMMAND=npx
MCP_SERVER_ARGS=["-y", "@modelcontextprotocol/server-moneybird"]

# Moneybird credentials (passed to MCP server)
MONEYBIRD_TOKEN=your_bearer_token
MONEYBIRD_ADMINISTRATION_ID=your_administration_id
```

**Note**: You need either OAuth credentials OR a token (not both required). For standalone Node.js usage, configure the MCP server to connect to Moneybird.

# OpenAI

OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4.1 # Default: gpt-4.1

# Optional: Anthropic Claude

ANTHROPIC_API_KEY=your_anthropic_api_key # Optional

# Database

DATABASE_PATH=./data/moneybird-agent.db # Default

# Confidence Thresholds (0-100)

CONFIDENCE_AUTO_THRESHOLD=95 # Auto-book if confidence >= 95%
CONFIDENCE_REVIEW_THRESHOLD=80 # Flag for review if confidence >= 80%

# Amount Threshold (in cents)

AMOUNT_REVIEW_THRESHOLD=100000 # €1000 - manual review if amount exceeds

# Scheduler

CRON_SCHEDULE=0 \* \* \* \* # Every hour (default)

# Logging

LOG_LEVEL=info # debug, info, warn, error

````

## Running

### Development

```bash
npm run dev
````

### Production

```bash
npm start
```

### Using PM2

```bash
pm2 start dist/index.js --name moneybird-agent
pm2 save
pm2 startup
```

### Using systemd

Create `/etc/systemd/system/moneybird-agent.service`:

```ini
[Unit]
Description=Moneybird Agent
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/moneybird-agent
ExecStart=/usr/bin/node /path/to/moneybird-agent/dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl enable moneybird-agent
sudo systemctl start moneybird-agent
```

## Project Structure

```
src/
├── index.ts                 # Main entry point
├── agent/
│   ├── graph.ts            # LangGraph workflow definition
│   ├── state.ts            # State type definitions
│   ├── nodes/              # Workflow nodes
│   │   ├── detectNewInvoices.ts
│   │   ├── checkCompleteness.ts
│   │   ├── scanInvoicePdf.ts
│   │   ├── resolveContact.ts
│   │   ├── validateInvoice.ts
│   │   ├── classifyKostenpost.ts
│   │   ├── matchTransactions.ts
│   │   ├── confidenceGate.ts
│   │   ├── autoBook.ts
│   │   └── alert.ts
│   └── prompts/            # AI prompts
├── moneybird/
│   ├── mcpClient.ts        # Moneybird MCP client abstraction
│   ├── tools.ts            # MCP tool wrappers
│   └── types.ts            # Moneybird type definitions
├── storage/
│   ├── db.ts               # SQLite database setup
│   └── learning.ts         # Learning system
├── scheduler/
│   └── cron.ts             # Scheduler/cron logic
└── config/
    └── env.ts              # Environment configuration
```

## Workflow

The agent follows this workflow:

1. **DetectNewInvoices**: Finds new invoices in Moneybird
2. **CheckCompleteness**: Checks if invoice has all required fields
3. **ScanInvoicePdf**: If incomplete, extracts data from PDF using OCR/vision
4. **ResolveContact**: Matches or creates supplier contact
5. **ValidateInvoice**: Validates amounts and BTW calculations
6. **ClassifyKostenpost**: Classifies invoice to correct ledger account
7. **MatchTransactions**: Matches invoice to bank transactions
8. **ConfidenceGate**: Determines action based on overall confidence
9. **AutoBook** or **Alert**: Either auto-books (draft) or alerts user

## Confidence System

| Confidence | Action            |
| ---------- | ----------------- |
| ≥ 95%      | Auto-book (draft) |
| 80-95%     | Flag for review   |
| < 80%      | Alert user        |

Special cases that always require manual review:

- New supplier
- Amount exceeds threshold
- Any decision requires review

## Safety Features

- **Draft-only**: All bookings are created as drafts
- **Confidence thresholds**: Only auto-acts when confidence is high
- **Audit trail**: All actions are logged to SQLite
- **Reversible**: All operations can be undone in Moneybird
- **Learning**: System learns from corrections to improve accuracy

## Development

### Type Checking

```bash
npm run typecheck
```

### Building

```bash
npm run build
```

## Documentation

- [Product Requirements](./docs/PRODUCT_REQUIREMENTS.md) - Feature specifications
- [Project Overview](./docs/PROJECT_OVERVIEW.md) - Project vision and principles
- [Tech Stack](./docs/TECH_STACK.md) - Technical architecture
- [Deployment Guide](./docs/DEPLOYMENT.md) - Production deployment instructions
- [Notifications](./docs/NOTIFICATIONS.md) - Email and WhatsApp notification setup
- [Setup Guide](./SETUP.md) - Initial setup and configuration

## Notifications

The agent can send notifications via:

- **Email**: SMTP-based email alerts for errors and daily summaries
- **WhatsApp**: Via Twilio for real-time alerts

See [Notifications Documentation](./docs/NOTIFICATIONS.md) for setup instructions.

## Deployment

The agent is designed to run as a long-running service. See [Deployment Guide](./docs/DEPLOYMENT.md) for:

- VPS deployment
- Docker containerization
- Cloud platform options (Railway, Render, Fly.io)
- Monitoring and health checks
- CI/CD setup

## GitHub Setup

To set up the repository on GitHub:

1. **Create repository** on GitHub (see `SETUP_GITHUB.md`)
2. **Run setup script:**
   ```bash
   ./COMMIT_AND_PUSH.sh
   ```
   Or manually:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/moneybird-agent.git
   git push -u origin main
   ```
3. **Configure GitHub Secrets** (see `.github/README.md`)
4. **Set up SSH key** for automated deployments

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See `.github/PULL_REQUEST_TEMPLATE.md` for PR guidelines.

## License

MIT

## Support

For issues and questions, please open an issue in the repository using the templates in `.github/ISSUE_TEMPLATE/`.
