# Troubleshooting Guide

## Docker Compose Errors

### Error: `KeyError: 'ContainerConfig'`

This error occurs when Docker Compose encounters a corrupted container state. Fix it with:

```bash
# Stop and remove the container
docker-compose down

# Remove the problematic container manually if needed
docker ps -a | grep moneybird-agent
docker rm -f <container_id>

# Clean up any orphaned containers
docker container prune -f

# Rebuild and start fresh
docker-compose build --no-cache
docker-compose up -d
```

### Alternative: Use Docker Compose V2

If you're using an old version of docker-compose (1.x), consider upgrading:

```bash
# Install Docker Compose V2 (plugin)
sudo apt update
sudo apt install docker-compose-plugin

# Use it as: docker compose (no hyphen)
docker compose up -d
```

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
