# Quick Fix for Database Permissions Issue

If you're getting "unable to open database file" error, run these commands on your Hetzner server:

```bash
cd /opt/moneybird-agent

# Stop the container
docker-compose down

# Fix permissions on data directory
sudo chown -R 1000:1000 data
sudo chmod 755 data

# If data directory doesn't exist, create it
mkdir -p data logs
sudo chown -R 1000:1000 data logs
sudo chmod 755 data logs

# Restart container
docker-compose up -d

# Check logs
docker-compose logs -f
```

The container runs as user UID 1000, so the data directory must be writable by that user.
