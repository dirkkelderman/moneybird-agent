# GitHub Actions Deployment Setup

This guide helps you configure GitHub Actions to automatically deploy to your Hetzner server.

## Step 1: Generate SSH Key for Deployment

On your **local machine**, generate a dedicated SSH key for GitHub Actions:

```bash
# Generate a new SSH key (use a descriptive name)
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy

# When prompted, you can leave the passphrase empty (or set one if preferred)
# Press Enter to accept default location
# Press Enter twice for no passphrase (or enter a passphrase)
```

## Step 2: Copy Public Key to Hetzner Server

```bash
# Copy the public key to your Hetzner server
ssh-copy-id -i ~/.ssh/github_actions_deploy.pub dirk@your-hetzner-ip

# Or manually:
cat ~/.ssh/github_actions_deploy.pub
# Then on your server, add it to ~/.ssh/authorized_keys:
# ssh dirk@your-hetzner-ip
# echo "your-public-key-here" >> ~/.ssh/authorized_keys
```

## Step 3: Test SSH Connection

Verify the key works:

```bash
# Test SSH connection
ssh -i ~/.ssh/github_actions_deploy dirk@46.225.10.165

# If it works, you should be logged in without a password prompt
```

## Step 4: Get Private Key for GitHub Secrets

**IMPORTANT:** Copy the **entire** private key, including:

- `-----BEGIN OPENSSH PRIVATE KEY-----` header
- All the key content
- `-----END OPENSSH PRIVATE KEY-----` footer
- All newlines

```bash
# Display the private key (copy everything, including headers)
cat ~/.ssh/github_actions_deploy
```

**Example output:**

```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACD... (many lines) ...
-----END OPENSSH PRIVATE KEY-----
```

## Step 5: Add GitHub Secrets

1. Go to your GitHub repository
2. Navigate to: **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret** for each:

### Required Secrets:

**`DEPLOY_HOST`**

- Value: Your Hetzner server IP or hostname
- Example: `123.45.67.89` or `your-server.example.com`

**`DEPLOY_USER`**

- Value: SSH username
- Example: `dirk` or `root`

**`DEPLOY_SSH_KEY`**

- Value: The **entire** private key from Step 4
- **CRITICAL:** Must include:
  - `-----BEGIN OPENSSH PRIVATE KEY-----` header
  - All content lines
  - `-----END OPENSSH PRIVATE KEY-----` footer
  - All newlines (press Enter after each line when pasting)

**`DEPLOY_PATH`**

- Value: Path to your application on the server
- Example: `/opt/moneybird-agent` or `/home/dirk/projects/moneybird-agent`

### Optional Secrets:

**`DEPLOY_PORT`**

- Value: SSH port (default: 22)
- Example: `22` or `2222` if using custom port

## Step 6: Verify Secrets Are Set

Check that all secrets are configured:

1. Go to: **Settings** → **Secrets and variables** → **Actions**
2. You should see:
   - ✅ `DEPLOY_HOST`
   - ✅ `DEPLOY_USER`
   - ✅ `DEPLOY_SSH_KEY`
   - ✅ `DEPLOY_PATH`
   - (Optional) `DEPLOY_PORT`

## Step 7: Test Deployment

1. Make a small change and push to `main` branch:

   ```bash
   git commit --allow-empty -m "Test deployment"
   git push origin main
   ```

2. Go to **Actions** tab in GitHub
3. Watch the workflow run
4. Check the logs if it fails

## Troubleshooting

### Error: `ssh: no key found`

**Problem:** The `DEPLOY_SSH_KEY` secret is missing or invalid.

**Solution:**

1. Verify the secret exists in GitHub
2. Re-copy the private key (make sure to include headers and all newlines)
3. The key should start with `-----BEGIN OPENSSH PRIVATE KEY-----`
4. The key should end with `-----END OPENSSH PRIVATE KEY-----`

### Error: `ssh: unable to authenticate`

**Problem:** The public key is not on the server or permissions are wrong.

**Solution:**

```bash
# On your Hetzner server, check authorized_keys
cat ~/.ssh/authorized_keys

# Verify permissions
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys

# Test manually
ssh -i ~/.ssh/github_actions_deploy dirk@your-hetzner-ip
```

### Error: `Permission denied (publickey)`

**Problem:** SSH key format or permissions issue.

**Solution:**

1. Regenerate the key pair
2. Make sure you're using `ed25519` format
3. Verify the public key is in `~/.ssh/authorized_keys` on the server

### Error: `Host key verification failed`

**Problem:** Server host key changed or not in known_hosts.

**Solution:** This is usually handled automatically by GitHub Actions, but if it persists:

- Add `fingerprint` to the workflow (optional)
- Or use `use_insecure_cipher: true` (not recommended for production)

## Security Best Practices

1. **Use a dedicated SSH key** for GitHub Actions (not your personal key)
2. **Limit key permissions** on the server (if possible, restrict to specific commands)
3. **Use a passphrase** for the key (optional but recommended)
4. **Rotate keys periodically** (every 6-12 months)
5. **Monitor access logs** on your server

## Alternative: Use SSH Config

If you prefer, you can also configure SSH using a config file, but the secret method above is simpler for GitHub Actions.
