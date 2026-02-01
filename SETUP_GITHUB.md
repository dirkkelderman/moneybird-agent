# GitHub Repository Setup

Quick guide to set up the GitHub repository and push your code.

## Prerequisites

- GitHub account
- Git installed locally
- SSH key set up (optional, for SSH URLs)

## Steps

### 1. Create Repository on GitHub

1. Go to https://github.com/new
2. Repository name: `moneybird-agent`
3. Description: "Autonomous AI-powered bookkeeping agent for Moneybird"
4. Choose Private or Public
5. **Do NOT** initialize with README, .gitignore, or license
6. Click "Create repository"

### 2. Initialize and Push Code

Run these commands in your project directory:

```bash
# Initialize git repository
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Moneybird Agent v0.1.0

Features:
- Full invoice processing workflow
- Email and WhatsApp notifications
- Daily summary system
- Deployment documentation
- GitHub Actions CI/CD"

# Rename branch to main
git branch -M main

# Add GitHub remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/moneybird-agent.git

# Push to GitHub
git push -u origin main
```

### 3. Configure GitHub Secrets

After pushing, configure secrets for automated deployment:

1. Go to: `https://github.com/YOUR_USERNAME/moneybird-agent/settings/secrets/actions`
2. Click "New repository secret"
3. Add these secrets (see `.github/README.md` for details):
   - `DEPLOY_HOST`
   - `DEPLOY_USER`
   - `DEPLOY_SSH_KEY`
   - `DEPLOY_PATH`
   - `DEPLOY_PORT` (optional)

### 4. Verify Setup

1. Check the "Actions" tab - workflows should be visible
2. Push a test commit to trigger CI
3. Verify workflows run successfully

## Next Steps

- See `.github/README.md` for detailed GitHub Actions setup
- See `docs/DEPLOYMENT.md` for deployment instructions
- See `docs/NOTIFICATIONS.md` for notification configuration
