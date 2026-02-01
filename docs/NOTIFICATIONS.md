# Notifications System

The Moneybird Agent includes a comprehensive notification system for errors, daily summaries, and alerts.

## Features

- **Email Notifications**: SMTP-based email alerts
- **WhatsApp Notifications**: Via Twilio API
- **Daily Summaries**: Automated daily reports
- **Error Alerts**: Real-time error notifications
- **Configurable**: Enable/disable per channel

## Configuration

### Email Setup

```env
EMAIL_ENABLED=true
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_USER=your-email@gmail.com
EMAIL_SMTP_PASS=your-app-password
EMAIL_FROM=your-email@gmail.com
EMAIL_TO=recipient1@example.com,recipient2@example.com
```

**Gmail Setup:**
1. Enable 2-factor authentication
2. Generate App Password: https://myaccount.google.com/apppasswords
3. Use App Password as `EMAIL_SMTP_PASS`

**Other SMTP Providers:**
- Outlook: `smtp-mail.outlook.com:587`
- SendGrid: `smtp.sendgrid.net:587`
- AWS SES: Use your SES SMTP endpoint

### WhatsApp Setup (Twilio)

```env
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=twilio
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

Sent at end of day (configurable via scheduler).

**Content:**
- Invoices processed count
- Auto-booked count
- Requiring review count
- Errors and warnings
- Actions taken
- Human intervention required flag

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
import { generateDailySummary, sendDailySummary } from "./notifications/index.js";

const summary = await generateDailySummary("2024-01-01");
await sendDailySummary(summary);
```

## Notification Settings

```env
# Enable/disable all notifications
NOTIFICATIONS_ENABLED=true

# Only send error notifications (skip daily summaries)
NOTIFICATION_ERRORS_ONLY=false
```

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
node -e "
import { sendWhatsApp } from './dist/notifications/whatsapp.js';
await sendWhatsApp('Test message from Moneybird Agent');
"
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

### Notifications disabled
- Check `NOTIFICATIONS_ENABLED=true`
- Verify channel-specific enable flags
- Review logs for notification errors
