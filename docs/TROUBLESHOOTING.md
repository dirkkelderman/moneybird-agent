# Troubleshooting Guide

## Docker Compose Errors

### Error: `KeyError: 'ContainerConfig'`

This error occurs when Docker Compose encounters a corrupted container state. Fix it with:

```bash
# Step 1: Stop and remove the container
docker-compose down

# Step 2: Remove the problematic container manually (if it still exists)
docker ps -a | grep moneybird-agent
# If you see a container, remove it:
docker rm -f $(docker ps -a | grep moneybird-agent | awk '{print $1}')

# Step 3: Clean up any orphaned containers and images
docker container prune -f

# Step 4: Start fresh (this will recreate with new env vars)
docker-compose up -d

# If that doesn't work, rebuild:
docker-compose build --no-cache
docker-compose up -d
```

**Quick one-liner:**

```bash
docker-compose down && docker rm -f $(docker ps -a | grep moneybird-agent | awk '{print $1}') 2>/dev/null; docker-compose up -d
```

### Alternative: Use Docker Compose V2

If you're using an old version of docker-compose (1.x), consider upgrading:

```bash
# Step 1: Add Docker's official GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Step 2: Add Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Step 3: Update package index
sudo apt update

# Step 4: Install Docker Compose V2 plugin
sudo apt install docker-compose-plugin

# Step 5: Verify installation
docker compose version

# Step 6: Use it (note: no hyphen, it's "docker compose" not "docker-compose")
docker compose up -d --force-recreate
```

**Note:** After installing, use `docker compose` (no hyphen) instead of `docker-compose`.

## Environment Variable Issues

### Missing Required Variables

If you get errors about missing environment variables:

```bash
# Check your .env file
cat .env | grep -E "MCP_SERVER|OPENAI"

# Verify required variables are set
# Required:
# - MCP_SERVER_URL
# - MCP_SERVER_AUTH_TOKEN
# - OPENAI_API_KEY
```

### Migration from Old Variables

See `ENV_MIGRATION.md` for details on updating your `.env` file after the cleanup.

## Database Permission Errors

### `SqliteError: unable to open database file`

Fix permissions:

```bash
# Set correct ownership
sudo chown -R 1000:1000 data logs
chmod 755 data logs

# Or make world-writable (less secure)
chmod 777 data
chmod 755 logs
```

## Environment Variables Not Updating

### Problem: Changes to `.env` file not taking effect

**Solution:** Recreate the container (not just restart):

```bash
# Recreate container with new environment variables
docker-compose up -d --force-recreate

# Or stop and start fresh
docker-compose down
docker-compose up -d
```

**Note:** `docker-compose restart` does NOT reload the `.env` file. You must recreate the container.

## Container Won't Start

### Check logs

```bash
docker-compose logs -f
```

### Rebuild from scratch

```bash
# Stop everything
docker-compose down

# Remove volumes (WARNING: deletes database)
docker-compose down -v

# Rebuild
docker-compose build --no-cache

# Start
docker-compose up -d
```

## MCP Connection Issues

### Connection fails

1. Verify your `.env` has:

   ```bash
   MCP_SERVER_URL=https://moneybird.com/mcp/v1/read_write
   MCP_SERVER_AUTH_TOKEN=your_token
   ```

2. Test connection:
   ```bash
   docker-compose exec moneybird-agent npm run test:mcp-http
   ```

## Testing Notifications

### Test Telegram Notifications

```bash
# Run test inside Docker container
docker-compose exec moneybird-agent npm run test:telegram
```

**Common issues:**
- "chat not found": Make sure you've sent `/start` to your bot first
- "Unauthorized": Check that `TELEGRAM_BOT_TOKEN` is correct
- "Bad Request": Verify `TELEGRAM_CHAT_IDS` is correct (can be user ID or group ID)

### Test Email Notifications

```bash
docker-compose exec moneybird-agent npm run test:email
```

**Note:** After updating `.env` with notification credentials, recreate the container:
```bash
docker-compose up -d --force-recreate
```

## GitHub Actions Deployment Issues

### Error: `ssh: no key found`

The `DEPLOY_SSH_KEY` secret is missing or incorrectly formatted.

**Fix:**

1. Go to GitHub: **Settings** → **Secrets and variables** → **Actions**
2. Check if `DEPLOY_SSH_KEY` exists
3. If missing, add it with the **complete** private key including:
   - `-----BEGIN OPENSSH PRIVATE KEY-----` header
   - All content lines
   - `-----END OPENSSH PRIVATE KEY-----` footer
   - All newlines preserved

See [GITHUB_ACTIONS_SETUP.md](./GITHUB_ACTIONS_SETUP.md) for detailed setup instructions.

### Error: `ssh: unable to authenticate`

The public key is not on the server or permissions are wrong.

**Fix:**

```bash
# On your Hetzner server
cat ~/.ssh/authorized_keys  # Should contain your public key
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

## Common Issues

### Port already in use

```bash
# Find what's using the port
sudo lsof -i :3000

# Or change the port in docker-compose.yml
```

### Out of disk space

```bash
# Clean up Docker
docker system prune -a

# Check disk usage
df -h
```
