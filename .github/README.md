# GitHub Setup Guide

This guide will help you set up the Moneybird Agent repository on GitHub and configure automated deployments.

## Initial Setup

### 1. Create GitHub Repository

1. Go to https://github.com/new
2. Repository name: `moneybird-agent`
3. Description: "Autonomous AI-powered bookkeeping agent for Moneybird"
4. Visibility: Choose Private or Public
5. **Do NOT** initialize with README, .gitignore, or license (we already have these)
6. Click "Create repository"

### 2. Push Code to GitHub

```bash
# Initialize git (if not already done)
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Moneybird Agent v0.1.0

- Full workflow implementation
- Email and WhatsApp notifications
- Daily summary system
- Deployment documentation
- GitHub Actions CI/CD"

# Rename branch to main (if needed)
git branch -M main

# Add remote repository
git remote add origin https://github.com/YOUR_USERNAME/moneybird-agent.git

# Push to GitHub
git push -u origin main
```

### 3. Configure GitHub Secrets

Go to: `Settings > Secrets and variables > Actions > New repository secret`

#### Required for Deployment:
- `DEPLOY_HOST` - Your VPS hostname or IP address
- `DEPLOY_USER` - SSH username for deployment
- `DEPLOY_SSH_KEY` - Private SSH key (see below)
   - `DEPLOY_PATH` - Path to application on server (e.g., `/opt/moneybird-agent` for /opt setup, or `~/projects/moneybird-agent` for home directory)
- `DEPLOY_PORT` - SSH port (optional, defaults to 22)

#### Optional for Daily Summary Workflow:
- `EMAIL_ENABLED` - `true` or `false`
- `EMAIL_SMTP_HOST` - SMTP server hostname
- `EMAIL_SMTP_PORT` - SMTP port (usually 587)
- `EMAIL_SMTP_USER` - SMTP username
- `EMAIL_SMTP_PASS` - SMTP password
- `EMAIL_FROM` - Sender email address
- `EMAIL_TO` - Comma-separated recipient emails
- `WHATSAPP_ENABLED` - `true` or `false`
- `TWILIO_ACCOUNT_SID` - Twilio account SID
- `TWILIO_AUTH_TOKEN` - Twilio auth token
- `TWILIO_WHATSAPP_FROM` - Twilio WhatsApp number
- `WHATSAPP_TO` - Comma-separated WhatsApp numbers

### 4. Generate SSH Key for Deployment

```bash
# Generate SSH key pair
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_actions_deploy

# Copy public key to server
ssh-copy-id -i ~/.ssh/github_actions_deploy.pub user@your-server

# Display private key (copy this to GitHub Secrets as DEPLOY_SSH_KEY)
cat ~/.ssh/github_actions_deploy
```

**Important:** The private key should be added to GitHub Secrets. Never commit it to the repository.

### 5. Verify GitHub Actions

1. Go to the "Actions" tab in your GitHub repository
2. You should see workflows: "CI", "Deploy Moneybird Agent", and "Daily Summary"
3. Push a commit to trigger the CI workflow
4. Check that it runs successfully

## Workflow Overview

### CI Workflow (`.github/workflows/ci.yml`)
- **Triggers:** All pushes and pull requests
- **Actions:** Type check, build, lint
- **Purpose:** Ensure code quality before merging

### Deploy Workflow (`.github/workflows/deploy.yml`)
- **Triggers:** Pushes to `main` or `master` branch
- **Actions:** Run tests, then deploy to production server
- **Purpose:** Automated deployment on merge to main

### Daily Summary Workflow (`.github/workflows/daily-summary.yml`)
- **Triggers:** Daily at 23:00 UTC (configurable) or manual
- **Actions:** Generate and send daily summary
- **Purpose:** Automated daily reports

## Branch Protection (Recommended)

1. Go to: `Settings > Branches`
2. Add rule for `main` branch:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
   - ✅ Require branches to be up to date before merging
   - Select "CI" workflow as required check

## Troubleshooting

### GitHub Actions Not Running
- Check repository settings > Actions > Allow all actions
- Verify workflow files are in `.github/workflows/`
- Check workflow syntax in Actions tab

### Deployment Fails
- Verify SSH key is correct in Secrets
- Check server accessibility from GitHub Actions
- Verify DEPLOY_PATH exists on server
- Check server logs: `journalctl -u moneybird-agent -f`

### SSH Connection Issues
- Test SSH connection manually: `ssh -i ~/.ssh/github_actions_deploy user@host`
- Verify firewall allows SSH port
- Check server SSH configuration

## Next Steps

1. ✅ Repository created and code pushed
2. ✅ GitHub Secrets configured
3. ✅ SSH key set up
4. ⏭️ Set up branch protection
5. ⏭️ Configure deployment server
6. ⏭️ Test deployment workflow
