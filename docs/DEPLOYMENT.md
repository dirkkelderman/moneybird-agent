# Deployment Guide

This guide covers deploying the Moneybird Agent to production.

## Quick Links

- **[Hetzner Server Deployment](./DEPLOYMENT_HETZNER.md)** - Docker deployment on Hetzner (recommended)
- **[VPS Deployment](#option-1-vps-virtual-private-server)** - Traditional VPS setup
- **[Docker](#option-2-docker)** - Docker containerization
- **[Cloud Platforms](#option-3-cloud-platforms)** - Railway, Render, Fly.io

## Deployment Options

### Option 1: VPS (Virtual Private Server)

**Recommended for:**
- Full control over environment
- Cost-effective for single instance
- Direct access to logs and debugging

**Requirements:**
- Ubuntu 22.04+ or similar Linux distribution
- Node.js 20+ installed
- SQLite 3
- Systemd for service management
- PM2 (optional, for process management)

**Steps:**

1. **Server Setup:**
   ```bash
   # Install Node.js 20
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs

   # Install SQLite
   sudo apt-get install -y sqlite3

   # Install PM2 (optional)
   sudo npm install -g pm2
   ```

2. **Deploy Application:**
   ```bash
   # Clone repository
   git clone <repository-url>
   cd moneybird-agent

   # Install dependencies
   npm install

   # Build
   npm run build

   # Create .env file
   cp .env.example .env
   # Edit .env with production values
   nano .env
   ```

3. **Configure Systemd Service:**
   ```bash
   sudo nano /etc/systemd/system/moneybird-agent.service
   ```
   
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

4. **Start Service:**
   ```bash
   sudo systemctl enable moneybird-agent
   sudo systemctl start moneybird-agent
   sudo systemctl status moneybird-agent
   ```

### Option 2: Docker

**Recommended for:**
- Consistent environments
- Easy scaling
- Container orchestration

**Dockerfile:**
```dockerfile
FROM node:20-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    sqlite3 \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build
RUN npm run build

# Create data directory
RUN mkdir -p /app/data

# Expose port (if needed for health checks)
EXPOSE 3000

# Run application
CMD ["node", "dist/index.js"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  moneybird-agent:
    build: .
    container_name: moneybird-agent
    restart: unless-stopped
    env_file:
      - .env
    volumes:
      - ./data:/app/data
    healthcheck:
      test: ["CMD", "node", "-e", "require('fs').existsSync('/app/data/moneybird-agent.db')"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**Deploy:**
```bash
docker-compose up -d
docker-compose logs -f
```

### Option 3: Cloud Platforms

#### Railway
1. Connect GitHub repository
2. Set environment variables
3. Deploy automatically on push

#### Render
1. Create new Web Service
2. Connect repository
3. Set build command: `npm install && npm run build`
4. Set start command: `node dist/index.js`
5. Add environment variables

#### Fly.io
```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch app
fly launch

# Set secrets
fly secrets set OPENAI_API_KEY=xxx
fly secrets set MONEYBIRD_TOKEN=xxx
# ... etc
```

## Environment Configuration

### Required Variables

```env
# Moneybird
MONEYBIRD_TOKEN=your_token
MONEYBIRD_ADMINISTRATION_ID=your_admin_id

# MCP (if using HTTP transport)
MCP_TRANSPORT=http
MCP_SERVER_URL=https://moneybird.com/mcp/v1/read_write
MCP_SERVER_AUTH_TOKEN=your_bearer_token

# OpenAI
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4o

# Database
DATABASE_PATH=./data/moneybird-agent.db
```

### Optional: Email Notifications

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

### Optional: WhatsApp Notifications

```env
WHATSAPP_ENABLED=true
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=+14155238886
WHATSAPP_TO=+1234567890,+0987654321
```

## Monitoring

### Health Checks

The application logs structured JSON to stdout. Monitor for:
- `application_started` - App started successfully
- `workflow_completed` - Workflow finished
- `workflow_failed` - Workflow error
- `daily_summary_sent` - Daily summary sent

### Log Management

**Using PM2:**
```bash
pm2 logs moneybird-agent
pm2 monit
```

**Using systemd:**
```bash
journalctl -u moneybird-agent -f
```

**Using Docker:**
```bash
docker-compose logs -f moneybird-agent
```

### Database Backup

```bash
# Backup SQLite database
sqlite3 data/moneybird-agent.db ".backup backup-$(date +%Y%m%d).db"

# Restore
sqlite3 data/moneybird-agent.db < backup-20240101.db
```

## Security Considerations

1. **Environment Variables**: Never commit `.env` files
2. **API Keys**: Rotate keys regularly
3. **Database**: Backup regularly, consider encryption
4. **Network**: Use HTTPS for MCP HTTP transport
5. **Access**: Limit server access, use SSH keys

## Scaling

For high-volume scenarios:
- Run multiple instances (different invoice ranges)
- Use load balancer
- Consider PostgreSQL instead of SQLite for multi-instance
- Implement queue system (Redis, RabbitMQ)

## Troubleshooting

### Application won't start
- Check environment variables
- Verify Node.js version (20+)
- Check database permissions
- Review logs

### Workflow not running
- Check cron schedule
- Verify MCP connection
- Check Moneybird API access
- Review error logs

### Notifications not sending
- Verify email/WhatsApp configuration
- Check SMTP/Twilio credentials
- Review notification logs
- Test with `NOTIFICATIONS_ENABLED=true`

## CI/CD

### GitHub Actions

The repository includes GitHub Actions workflows for CI/CD:

1. **`.github/workflows/ci.yml`** - Continuous Integration
   - Runs on all pushes and pull requests
   - Type checks, builds, and lints code
   - No deployment

2. **`.github/workflows/deploy.yml`** - Continuous Deployment
   - Runs on pushes to `main`/`master` branch
   - Runs tests first, then deploys to production
   - Deploys via SSH to VPS

### Setup GitHub Actions

1. **Create GitHub Repository:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/moneybird-agent.git
   git push -u origin main
   ```

2. **Configure GitHub Secrets:**
   
   Go to: `Settings > Secrets and variables > Actions > New repository secret`
   
   Add these secrets:
   - `DEPLOY_HOST` - Your VPS hostname or IP
   - `DEPLOY_USER` - SSH username
   - `DEPLOY_SSH_KEY` - Private SSH key for deployment
   - `DEPLOY_PORT` - SSH port (optional, defaults to 22)
   - `DEPLOY_PATH` - Path to application on server (e.g., `/home/user/moneybird-agent`)

3. **Generate SSH Key for Deployment:**
   ```bash
   ssh-keygen -t ed25519 -C "github-actions" -f ~/.ssh/github_actions_deploy
   # Copy public key to server
   ssh-copy-id -i ~/.ssh/github_actions_deploy.pub user@your-server
   # Add private key to GitHub Secrets as DEPLOY_SSH_KEY
   cat ~/.ssh/github_actions_deploy
   ```

4. **Workflow Behavior:**
   - **On Push to Main**: Runs tests, then deploys
   - **On Pull Request**: Runs tests only (no deployment)
   - **Manual Trigger**: Can be triggered manually via GitHub UI

### Alternative: Deploy to Cloud Platforms

For cloud platforms (Railway, Render, Fly.io), they typically auto-deploy on git push. No GitHub Actions needed, but you can still use CI workflow for testing.

### Custom Deployment Script

If you need custom deployment logic, modify `.github/workflows/deploy.yml`:

```yaml
- name: Custom deployment steps
  uses: appleboy/ssh-action@v1.0.3
  with:
    host: ${{ secrets.DEPLOY_HOST }}
    username: ${{ secrets.DEPLOY_USER }}
    key: ${{ secrets.DEPLOY_SSH_KEY }}
    script: |
      # Your custom deployment commands
      cd ${{ secrets.DEPLOY_PATH }}
      git pull
      npm ci --only=production
      npm run build
      # Run database migrations if needed
      # Restart services
      sudo systemctl restart moneybird-agent
```
