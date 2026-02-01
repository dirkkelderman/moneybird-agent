# Environment Variables Migration Guide

After the cleanup, some environment variables were removed or renamed. Here's what you need to update:

## Variables to Remove

Remove these from your `.env` file (they're no longer needed):

```bash
# Remove these:
MCP_TRANSPORT=http                    # Always HTTP now
MCP_SERVER_COMMAND=...                # Removed stdio support
MCP_SERVER_ARGS=...                   # Removed stdio support
MONEYBIRD_TOKEN=...                   # Use MCP_SERVER_AUTH_TOKEN instead
EMAIL_ENABLED=false                   # Auto-detected from config
EMAIL_SMTP_SECURE=false               # Auto-detected from port (465 = secure)
EMAIL_FROM=...                        # Uses EMAIL_SMTP_USER instead
WHATSAPP_ENABLED=false                # Auto-detected from config
WHATSAPP_PROVIDER=twilio              # Only Twilio supported
NOTIFICATIONS_ENABLED=true            # Auto-detected from config
NOTIFICATION_ERRORS_ONLY=false        # Removed
ANTHROPIC_API_KEY=...                 # Not used
```

## Variables to Rename

If you have `MONEYBIRD_TOKEN`, rename it:

```bash
# Old:
MONEYBIRD_TOKEN=your_token

# New:
MCP_SERVER_AUTH_TOKEN=your_token
```

## Required Variables (Minimum)

Your `.env` file must have at least:

```bash
# Required
MCP_SERVER_URL=https://moneybird.com/mcp/v1/read_write
MCP_SERVER_AUTH_TOKEN=your_bearer_token
OPENAI_API_KEY=your_openai_api_key

# Recommended
MONEYBIRD_ADMINISTRATION_ID=your_administration_id
```

## Notification Variables (Optional)

Only include these if you want notifications:

**Email** (all must be set together):

```bash
EMAIL_SMTP_HOST=smtp.example.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=your_email@example.com
EMAIL_SMTP_PASS=your_password
EMAIL_TO=recipient@example.com
```

**WhatsApp** (all must be set together):

```bash
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
WHATSAPP_TO=+1234567890
```

## Quick Migration Script

Run this on your server to clean up your `.env`:

**For Linux (Hetzner server):**
```bash
# Backup first!
cp .env .env.backup

# Remove old variables
sed -i '/^MCP_TRANSPORT=/d' .env
sed -i '/^MCP_SERVER_COMMAND=/d' .env
sed -i '/^MCP_SERVER_ARGS=/d' .env
sed -i '/^EMAIL_ENABLED=/d' .env
sed -i '/^EMAIL_SMTP_SECURE=/d' .env
sed -i '/^EMAIL_FROM=/d' .env
sed -i '/^WHATSAPP_ENABLED=/d' .env
sed -i '/^WHATSAPP_PROVIDER=/d' .env
sed -i '/^NOTIFICATIONS_ENABLED=/d' .env
sed -i '/^NOTIFICATION_ERRORS_ONLY=/d' .env
sed -i '/^ANTHROPIC_API_KEY=/d' .env

# Rename MONEYBIRD_TOKEN if it exists
if grep -q "^MONEYBIRD_TOKEN=" .env; then
  sed -i 's/^MONEYBIRD_TOKEN=/MCP_SERVER_AUTH_TOKEN=/' .env
fi
```

**For macOS (local development):**
```bash
# Backup first!
cp .env .env.backup

# Remove old variables (note: -i '' for macOS)
sed -i '' '/^MCP_TRANSPORT=/d' .env
sed -i '' '/^MCP_SERVER_COMMAND=/d' .env
sed -i '' '/^MCP_SERVER_ARGS=/d' .env
sed -i '' '/^EMAIL_ENABLED=/d' .env
sed -i '' '/^EMAIL_SMTP_SECURE=/d' .env
sed -i '' '/^EMAIL_FROM=/d' .env
sed -i '' '/^WHATSAPP_ENABLED=/d' .env
sed -i '' '/^WHATSAPP_PROVIDER=/d' .env
sed -i '' '/^NOTIFICATIONS_ENABLED=/d' .env
sed -i '' '/^NOTIFICATION_ERRORS_ONLY=/d' .env
sed -i '' '/^ANTHROPIC_API_KEY=/d' .env

# Rename MONEYBIRD_TOKEN if it exists
if grep -q "^MONEYBIRD_TOKEN=" .env; then
  sed -i '' 's/^MONEYBIRD_TOKEN=/MCP_SERVER_AUTH_TOKEN=/' .env
fi
```

**Cross-platform alternative (works on both):**
```bash
# Backup first!
cp .env .env.backup

# Remove old variables (creates .bak backup)
sed -i.bak '/^MCP_TRANSPORT=/d' .env
sed -i.bak '/^MCP_SERVER_COMMAND=/d' .env
sed -i.bak '/^MCP_SERVER_ARGS=/d' .env
sed -i.bak '/^EMAIL_ENABLED=/d' .env
sed -i.bak '/^EMAIL_SMTP_SECURE=/d' .env
sed -i.bak '/^EMAIL_FROM=/d' .env
sed -i.bak '/^WHATSAPP_ENABLED=/d' .env
sed -i.bak '/^WHATSAPP_PROVIDER=/d' .env
sed -i.bak '/^NOTIFICATIONS_ENABLED=/d' .env
sed -i.bak '/^NOTIFICATION_ERRORS_ONLY=/d' .env
sed -i.bak '/^ANTHROPIC_API_KEY=/d' .env

# Rename MONEYBIRD_TOKEN if it exists
if grep -q "^MONEYBIRD_TOKEN=" .env; then
  sed -i.bak 's/^MONEYBIRD_TOKEN=/MCP_SERVER_AUTH_TOKEN=/' .env
fi

# Remove the .bak file if you don't need it
rm .env.bak
```

## Verification

After updating, verify your config:

```bash
npm run test:manual
```

This will show if any required variables are missing.
