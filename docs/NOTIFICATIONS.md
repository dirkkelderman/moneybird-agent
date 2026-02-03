# Notifications System

The Moneybird Agent includes a comprehensive notification system for errors, daily summaries, and alerts.

## Features

- **Email Notifications**: SMTP-based email alerts
- **WhatsApp Notifications**: Via Twilio API
- **Telegram Notifications**: Via Telegram Bot API (easy setup, no external dependencies)
- **Daily Summaries**: Automated daily reports
- **Error Alerts**: Real-time error notifications
- **Configurable**: Enable/disable per channel (auto-detected from env vars)

## Configuration

### Email Setup

Email notifications are **auto-detected** - just set the required variables:

```env
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=your-email@gmail.com
EMAIL_SMTP_PASS=your-app-password
EMAIL_TO=recipient1@example.com,recipient2@example.com
```

**Note:** `EMAIL_SMTP_USER` is used as the `from` address automatically.

**Gmail Setup:**

1. Enable 2-factor authentication
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Use App Password as `EMAIL_SMTP_PASS`

**Other SMTP Providers:**

- Outlook: `smtp-mail.outlook.com:587`
- SendGrid: `smtp.sendgrid.net:587`
- AWS SES: Use your SES SMTP endpoint

### WhatsApp Setup (Twilio)

WhatsApp notifications are **auto-detected** - just set the required variables:

```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=+14155238886  # Twilio WhatsApp number
WHATSAPP_TO=+1234567890,+0987654321  # Comma-separated recipients
```

**Twilio Setup:**

1. Sign up at https://www.twilio.com
2. Get WhatsApp-enabled number
3. Add recipients to approved list (for trial accounts)
4. Use Account SID and Auth Token

### Telegram Setup

```env
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_IDS=your_chat_id,another_chat_id  # Comma-separated chat IDs
```

**Telegram Setup (Easiest!):**

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` and follow instructions to create a bot
3. Copy the bot token (looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
4. Get your chat ID:
   - For personal messages: Message `@userinfobot` to get your user ID
   - For groups: Add your bot to the group, then check `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates` to see the group chat ID
5. Add bot token and chat ID(s) to `.env`

**Why Telegram is Easy:**

- ✅ No external dependencies (uses native `fetch`)
- ✅ Free (no API costs)
- ✅ Simple HTTP API
- ✅ Works with personal chats and groups
- ✅ HTML formatting support

## Notification Types

### 1. Error Alerts

Sent when:

- Invoice processing fails
- Human intervention required
- Critical errors occur

**Content:**

- Invoice ID
- Error details
- Status and confidence
- Action required flag

### 2. Daily Summaries

Sent automatically every day at the configured time (default: 09:00 Amsterdam time / 08:00 UTC).

**Configuration:**

Set `DAILY_SUMMARY_TIME` in your `.env` file:

```env
# Format: "HH:MM" in UTC timezone
# 09:00 Amsterdam (winter) = 08:00 UTC
# 09:00 Amsterdam (summer) = 07:00 UTC
DAILY_SUMMARY_TIME=08:00
```

**Note:** Amsterdam timezone is UTC+1 (winter/CET) or UTC+2 (summer/CEST). Adjust the UTC time accordingly:

- **Winter (CET)**: 09:00 Amsterdam = 08:00 UTC → Use `DAILY_SUMMARY_TIME=08:00`
- **Summer (CEST)**: 09:00 Amsterdam = 07:00 UTC → Use `DAILY_SUMMARY_TIME=07:00`

**Content:**

- Invoices processed count
- Auto-booked count
- Requiring review count
- **Unmatched bank transactions** (transactions without invoices)
- Errors and warnings
- Actions taken
- Human intervention required flag

**Unmatched Transactions:**
The daily summary automatically checks for bank transactions that don't have a matching invoice. This helps you identify:
- Payments that need invoices to be created
- Transactions that should be matched to existing invoices
- Missing documentation for expenses

Transactions are checked from the last 90 days by default (configurable via `UNMATCHED_TRANSACTIONS_DAYS`). Only transactions ≥€1.00 are included (small amounts like fees are excluded).

### 3. Custom Notifications

Can be triggered programmatically for specific events.

## Usage

### Automatic Notifications

Notifications are sent automatically when:

- Workflow errors occur (via `alert` node)
- Daily summary time is reached (via scheduler)

### Manual Notifications

```typescript
import { sendNotification } from "./notifications/index.js";

await sendNotification(
  "Subject",
  "Plain text message",
  "<html>HTML message</html>"
);
```

### Daily Summary

```typescript
import {
  generateDailySummary,
  sendDailySummary,
} from "./notifications/index.js";

const summary = await generateDailySummary("2024-01-01");
await sendDailySummary(summary);
```

## Notification Settings

Notifications are **auto-detected** from environment variables. No explicit enable flags needed:

- **Email**: Enabled if `EMAIL_SMTP_HOST`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASS`, and `EMAIL_TO` are set
- **WhatsApp**: Enabled if `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, and `WHATSAPP_TO` are set
- **Telegram**: Enabled if `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_IDS` are set

## Testing

### Test Email

```bash
node -e "
import { sendEmail } from './dist/notifications/email.js';
await sendEmail('Test', 'This is a test email', '<p>This is a test email</p>');
"
```

### Test WhatsApp

```bash
npm run test:whatsapp
# or
tsx src/test/test-whatsapp.ts
```

### Test Telegram

```bash
npm run test:telegram
# or
tsx src/test/test-telegram.ts
```

## Troubleshooting

### Emails not sending

- Check SMTP credentials
- Verify firewall allows SMTP port
- Check spam folder
- Review application logs

### WhatsApp not sending

- Verify Twilio credentials
- Check recipient numbers are approved (trial accounts)
- Ensure numbers include country code (+)
- Review Twilio console for errors

### Telegram not sending

- Verify bot token is correct
- Check chat ID is correct (can be user ID or group ID)
- Ensure bot is added to group (if using group chat)
- Test bot token: `curl https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getMe`
- Check bot permissions in group (if using group chat)

### Notifications disabled

- Notifications are auto-detected from environment variables
- No explicit enable flags needed - just set the required env vars for each channel
- Review logs for notification errors
- Verify all required variables for the channel are set (see Configuration section above)
