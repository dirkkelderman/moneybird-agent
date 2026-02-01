# Hetzner Quick Start Guide

Quick setup guide for deploying Moneybird Agent on your Hetzner server.

## Prerequisites

- Hetzner server with SSH access
- Docker and Docker Compose installed
- Git installed

## Quick Setup (5 minutes)

### 1. SSH into your Hetzner server

```bash
ssh user@your-hetzner-ip
```

### 2. Create project directory

**Option A: `/opt` (Recommended - matches your other projects)**

```bash
cd /opt
sudo git clone https://github.com/dirkkelderman/moneybird-agent.git
sudo chown -R $USER:$USER /opt/moneybird-agent
cd /opt/moneybird-agent
```

**Option B: Home directory**

```bash
mkdir -p ~/projects/moneybird-agent
cd ~/projects/moneybird-agent
git clone https://github.com/dirkkelderman/moneybird-agent.git .
```

### 4. Create .env file

```bash
nano .env
```

Add your configuration (see `.env.example` for reference):

```env
# Moneybird
MONEYBIRD_TOKEN=your_token
MONEYBIRD_ADMINISTRATION_ID=your_admin_id

# MCP
MCP_TRANSPORT=http
MCP_SERVER_URL=https://moneybird.com/mcp/v1/read_write
MCP_SERVER_AUTH_TOKEN=your_bearer_token

# OpenAI
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4o

# Database
DATABASE_PATH=./data/moneybird-agent.db
```

### 5. Create data directory

```bash
mkdir -p data logs
chmod 755 data logs
```

### 6. Start the container

```bash
docker-compose up -d
```

### 7. Check logs

```bash
docker-compose logs -f
```

## Verify It's Working

```bash
# Check container status
docker-compose ps

# Check logs for "application_started"
docker-compose logs | grep "application_started"

# Check if database was created
ls -la data/
```

## Updating

### Manual Update

**If using `/opt`:**
```bash
cd /opt/moneybird-agent
git pull
docker-compose build
docker-compose restart
```

**If using home directory:**
```bash
cd ~/projects/moneybird-agent
git pull
docker-compose build
docker-compose restart
```

### Automated Update (via GitHub Actions)

1. Add GitHub Secrets:
   - `DEPLOY_HOST` - Your Hetzner IP
   - `DEPLOY_USER` - SSH user (usually `root`)
   - `DEPLOY_SSH_KEY` - Private SSH key
   - `DEPLOY_PATH` - `/opt/moneybird-agent` (if using /opt) or `~/projects/moneybird-agent` (if using home directory)

2. Push to `main` branch - deployment happens automatically!

## Useful Commands

```bash
# View logs
docker-compose logs -f moneybird-agent

# Restart container
docker-compose restart

# Stop container
docker-compose stop

# Start container
docker-compose start

# Rebuild after code changes
docker-compose build
docker-compose up -d

# Check resource usage
docker stats moneybird-agent

# Backup database
sqlite3 data/moneybird-agent.db ".backup data/backup-$(date +%Y%m%d).db"
```

## Troubleshooting

**Container won't start:**
```bash
docker-compose logs moneybird-agent
```

**Check environment variables:**
```bash
docker-compose exec moneybird-agent env | grep MONEYBIRD
```

**Rebuild from scratch:**
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Next Steps

- Configure notifications (see `docs/NOTIFICATIONS.md`)
- Set up automated backups
- Monitor logs regularly
- Configure GitHub Actions for auto-deployment

For detailed information, see [Hetzner Deployment Guide](./docs/DEPLOYMENT_HETZNER.md).
