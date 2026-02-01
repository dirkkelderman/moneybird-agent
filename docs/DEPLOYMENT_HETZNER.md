# Hetzner Server Deployment Guide

This guide covers deploying the Moneybird Agent to a Hetzner server using Docker.

## Prerequisites

- Hetzner server with Docker and Docker Compose installed
- SSH access to the server
- Domain or IP address for the server

## Server Setup

### 1. Install Docker and Docker Compose (if not already installed)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Add user to docker group (optional, to run without sudo)
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Create Project Directory

```bash
# Create directory for the project
mkdir -p ~/projects/moneybird-agent
cd ~/projects/moneybird-agent
```

### 3. Clone Repository

```bash
git clone https://github.com/dirkkelderman/moneybird-agent.git .
```

Or if you want to set up in a different location:

```bash
git clone https://github.com/dirkkelderman/moneybird-agent.git ~/projects/moneybird-agent
cd ~/projects/moneybird-agent
```

### 4. Create Environment File

```bash
# Copy example env file
cp .env.example .env

# Edit with your values
nano .env
```

Required environment variables:
- `MONEYBIRD_TOKEN` or OAuth credentials
- `MONEYBIRD_ADMINISTRATION_ID`
- `OPENAI_API_KEY`
- `MCP_TRANSPORT=http`
- `MCP_SERVER_URL=https://moneybird.com/mcp/v1/read_write`
- `MCP_SERVER_AUTH_TOKEN` (your Moneybird bearer token)

Optional (for notifications):
- Email SMTP settings
- WhatsApp/Twilio settings

### 5. Create Data Directory

```bash
mkdir -p data logs
chmod 755 data logs
```

### 6. Build and Start Container

```bash
# Build the image
docker-compose build

# Start the container
docker-compose up -d

# View logs
docker-compose logs -f
```

### 7. Verify Deployment

```bash
# Check container status
docker-compose ps

# Check logs
docker-compose logs moneybird-agent

# Check if database was created
ls -la data/
```

## Updating the Application

### Manual Update

```bash
cd ~/projects/moneybird-agent

# Pull latest changes
git pull

# Rebuild and restart
docker-compose build
docker-compose restart
```

### Automated Update via GitHub Actions

The GitHub Actions workflow can automatically deploy to your Hetzner server.

1. **Set up SSH key for GitHub Actions:**

   ```bash
   # On your local machine, generate a deployment key
   ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy
   
   # Copy public key to Hetzner server
   ssh-copy-id -i ~/.ssh/github_actions_deploy.pub user@your-hetzner-ip
   
   # Display private key (add to GitHub Secrets)
   cat ~/.ssh/github_actions_deploy
   ```

2. **Configure GitHub Secrets:**

   Go to: https://github.com/dirkkelderman/moneybird-agent/settings/secrets/actions

   Add:
   - `DEPLOY_HOST` - Your Hetzner server IP or hostname
   - `DEPLOY_USER` - SSH username (usually `root` or your user)
   - `DEPLOY_SSH_KEY` - Private SSH key from step 1
   - `DEPLOY_PATH` - `/root/projects/moneybird-agent` or `~/projects/moneybird-agent`
   - `DEPLOY_PORT` - SSH port (usually 22)

3. **Update GitHub Actions workflow** (if needed):

   The workflow will automatically:
   - Pull latest code
   - Rebuild Docker image
   - Restart container

## Monitoring

### View Logs

```bash
# Follow logs in real-time
docker-compose logs -f moneybird-agent

# View last 100 lines
docker-compose logs --tail=100 moneybird-agent

# View logs from last hour
docker-compose logs --since 1h moneybird-agent
```

### Container Status

```bash
# Check if container is running
docker-compose ps

# Check container health
docker inspect moneybird-agent | grep -A 10 Health
```

### Database Backup

```bash
# Backup SQLite database
docker-compose exec moneybird-agent sqlite3 /app/data/moneybird-agent.db ".backup /app/data/backup-$(date +%Y%m%d).db"

# Or from host
sqlite3 data/moneybird-agent.db ".backup data/backup-$(date +%Y%m%d).db"
```

### Resource Usage

```bash
# Check container resource usage
docker stats moneybird-agent

# Check disk usage
du -sh data/
```

## Troubleshooting

### Container won't start

```bash
# Check logs for errors
docker-compose logs moneybird-agent

# Check if port is in use
docker-compose ps

# Try rebuilding
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Database issues

```bash
# Check database file permissions
ls -la data/

# Fix permissions if needed
chmod 644 data/moneybird-agent.db
```

### Environment variables not loading

```bash
# Verify .env file exists
ls -la .env

# Check if variables are set in container
docker-compose exec moneybird-agent env | grep MONEYBIRD
```

### Network issues

```bash
# Check if container can reach internet
docker-compose exec moneybird-agent ping -c 3 8.8.8.8

# Check DNS resolution
docker-compose exec moneybird-agent nslookup moneybird.com
```

## Maintenance

### Update Dependencies

```bash
# Pull latest code
git pull

# Rebuild with updated dependencies
docker-compose build --no-cache

# Restart
docker-compose restart
```

### Clean Up

```bash
# Remove old images
docker image prune -a

# Remove unused volumes
docker volume prune

# Remove old logs (if not using log rotation)
docker-compose logs --tail=0 -f  # Clear logs
```

### Backup Strategy

Create a backup script:

```bash
#!/bin/bash
# backup.sh
BACKUP_DIR="/root/backups/moneybird-agent"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
sqlite3 ~/projects/moneybird-agent/data/moneybird-agent.db ".backup $BACKUP_DIR/db_$DATE.db"

# Backup .env file (if needed)
cp ~/projects/moneybird-agent/.env $BACKUP_DIR/env_$DATE

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -delete
```

Add to crontab:
```bash
crontab -e
# Add: 0 2 * * * /root/backup.sh
```

## Security Considerations

1. **Firewall:** Ensure only necessary ports are open
2. **SSH:** Use SSH keys, disable password authentication
3. **Environment Variables:** Never commit `.env` file
4. **Database:** Regular backups
5. **Updates:** Keep Docker and system packages updated

## Integration with Existing Projects

If you have other Docker projects on the same server:

1. **Use different project directories:**
   ```bash
   ~/projects/moneybird-agent/
   ~/projects/other-project/
   ```

2. **Use Docker networks** (if containers need to communicate):
   ```yaml
   # In docker-compose.yml
   networks:
     default:
       name: moneybird-network
   ```

3. **Resource limits:** Adjust CPU/memory limits in `docker-compose.yml` based on server capacity

## Next Steps

1. ✅ Server setup complete
2. ✅ Application deployed
3. ⏭️ Configure notifications (see `docs/NOTIFICATIONS.md`)
4. ⏭️ Set up automated backups
5. ⏭️ Monitor logs and performance
6. ⏭️ Configure GitHub Actions for auto-deployment
