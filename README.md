# Moneybird Agent

Autonomous AI-powered bookkeeping agent for Moneybird. Automates invoice processing, contact resolution, kostenpost classification, and bank transaction matching using OpenAI GPT-4 and LangGraph.

## About

Moneybird Agent is an intelligent automation system that runs continuously on your VPS to handle bookkeeping tasks in Moneybird. It processes incoming invoices, extracts data from PDFs using AI vision, matches contacts, classifies expenses, and matches bank transactions—all while maintaining a safety-first approach with confidence-based automation.

**Perfect for:** Dutch freelancers (ZZP'ers) and small businesses who want to minimize manual bookkeeping work while maintaining full control and auditability.

**Key Benefits:**
- ⏱️ **Saves Time**: Automatically processes invoices, reducing manual work by 80%+
- 🛡️ **Safe & Reversible**: All operations create drafts only, with confidence-based automation
- 🤖 **Intelligent**: Uses OpenAI GPT-4 Vision to extract data from scanned invoices
- 📊 **Transparent**: Daily summaries show what was processed and what needs attention
- 🔔 **Alert System**: Notifications via Email, WhatsApp, or Telegram when human intervention is needed
- 💰 **Transaction Matching**: Identifies unmatched bank transactions that may need invoices

**Features:**
- 🤖 **Fully Autonomous**: Processes invoices automatically with confidence-based automation
- 📄 **OCR & PDF Processing**: Extracts data from invoices using OpenAI Vision API
- 👥 **Smart Contact Resolution**: Automatically matches or creates supplier contacts
- 💰 **Auto-Classification**: AI-powered kostenpost (ledger account) classification
- 🔄 **Bank Transaction Matching**: Matches invoices to bank transactions
- 📧 **Multi-Channel Notifications**: Email, WhatsApp, and Telegram support
- 🛡️ **Draft-Safe**: All operations create drafts only, ensuring reversibility
- 📊 **Confidence System**: Auto-books only when confidence ≥95%, flags for review when <80%

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

### Required Environment Variables

```env
# Moneybird MCP (primary integration method)
MCP_SERVER_URL=https://moneybird.com/mcp/v1/read_write
MCP_SERVER_AUTH_TOKEN=your_bearer_token

# OpenAI
OPENAI_API_KEY=your_openai_api_key
```

### Optional Environment Variables

```env
# Moneybird (recommended)
MONEYBIRD_ADMINISTRATION_ID=your_admin_id

# Moneybird OAuth (optional, for REST API fallback only)
MONEYBIRD_CLIENT_ID=your_client_id
MONEYBIRD_CLIENT_SECRET=your_client_secret
MONEYBIRD_ACCESS_TOKEN=your_access_token

# OpenAI Model (default: gpt-4.1)
OPENAI_MODEL=gpt-4.1

# Confidence Thresholds (defaults: 95% auto, 80% review)
CONFIDENCE_AUTO_THRESHOLD=95
CONFIDENCE_REVIEW_THRESHOLD=80

# Scheduler (default: hourly)
CRON_SCHEDULE=0 * * * *

# Daily Summary Time (default: 08:00 UTC = 09:00 Amsterdam winter)
# Format: "HH:MM" in UTC. Amsterdam is UTC+1 (winter) or UTC+2 (summer)
DAILY_SUMMARY_TIME=08:00

# Unmatched Transactions Check (default: 90 days lookback)
UNMATCHED_TRANSACTIONS_DAYS=90

# Database (default: ./data/moneybird-agent.db)
DATABASE_PATH=./data/moneybird-agent.db

# Logging (default: info)
LOG_LEVEL=info

# Email Notifications (optional - auto-detected if configured)
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=your-email@gmail.com
EMAIL_SMTP_PASS=your-app-password
EMAIL_TO=recipient1@example.com,recipient2@example.com

# WhatsApp Notifications (optional - auto-detected if configured)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=+14155238886
WHATSAPP_TO=+1234567890,+0987654321

# Telegram Notifications (optional - auto-detected if configured)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_IDS=your_chat_id,another_chat_id
```

See `.env.example` for a complete template. All notification channels are **auto-detected** - just set the required variables and they'll be enabled automatically.

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

- [Product Requirements](./docs/PRODUCT_REQUIREMENTS.md) - Detailed feature specifications
- [Project Overview](./docs/PROJECT_OVERVIEW.md) - Vision, principles, and target user
- [Tech Stack](./docs/TECH_STACK.md) - Technology choices and architecture
- [Deployment Guide](./docs/DEPLOYMENT.md) - Production deployment options
- [Hetzner Deployment](./docs/DEPLOYMENT_HETZNER.md) - Step-by-step Hetzner VPS setup
- [Notifications Setup](./docs/NOTIFICATIONS.md) - Email, WhatsApp, and Telegram configuration
- [Troubleshooting](./docs/TROUBLESHOOTING.md) - Common issues and solutions
- [GitHub Actions Setup](./docs/GITHUB_ACTIONS_SETUP.md) - CI/CD configuration

## How It Works

1. **Detects** new incoming invoices in Moneybird (hourly check)
2. **Scans** PDF attachments using OpenAI Vision API to extract data
3. **Resolves** contacts by matching supplier names or creating new ones
4. **Classifies** expenses (kostenposten) using AI
5. **Matches** invoices to bank transactions
6. **Auto-books** only when confidence ≥95%, flags for review otherwise
7. **Sends** daily summaries with unmatched transactions and action items

## Safety & Confidence

- **Draft-Safe**: All operations create drafts only—nothing is finalized without review
- **Confidence Thresholds**: 
  - ≥95%: Auto-book (draft)
  - 80-95%: Flag for review
  - <80%: Alert user for manual intervention
- **Audit Trail**: All actions logged with confidence scores and reasoning
- **Reversible**: Every action can be undone in Moneybird

## Requirements

- Node.js 20+
- Moneybird account with MCP access
- OpenAI API key (GPT-4o or GPT-4.1)
- VPS or server (Hetzner recommended)
- Optional: Email/WhatsApp/Telegram for notifications

## Contributing

This is a personal project, but suggestions and improvements are welcome! Please open an issue to discuss changes.

## License

MIT License - See [LICENSE](./LICENSE) file for details.

## Support

- 📖 Check the [Documentation](./docs/) for detailed guides
- 🐛 Report issues on [GitHub Issues](https://github.com/dirkkelderman/moneybird-agent/issues)
- 💬 For questions, open a [Discussion](https://github.com/dirkkelderman/moneybird-agent/discussions)
