#!/bin/bash

# Script to commit and push Moneybird Agent to GitHub
# Usage: ./COMMIT_AND_PUSH.sh [commit-message]

set -e

COMMIT_MSG="${1:-Initial commit: Moneybird Agent v0.1.0

Features:
- Full invoice processing workflow with LangGraph
- Email and WhatsApp notifications
- Daily summary system
- Deployment documentation
- GitHub Actions CI/CD workflows
- Error logging and alerting system}"

echo "🚀 Preparing to commit and push to GitHub..."
echo ""

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📦 Initializing git repository..."
    git init
    git branch -M main
fi

# Check if remote is set
if ! git remote get-url origin &>/dev/null; then
    echo "⚠️  No remote repository configured!"
    echo "Please run: git remote add origin https://github.com/YOUR_USERNAME/moneybird-agent.git"
    echo "Or edit this script to add your repository URL"
    exit 1
fi

# Add all files
echo "📝 Staging files..."
git add .

# Show what will be committed
echo ""
echo "📋 Files to be committed:"
git status --short

# Commit
echo ""
echo "💾 Creating commit..."
git commit -m "$COMMIT_MSG"

# Push
echo ""
echo "🚀 Pushing to GitHub..."
git push -u origin main

echo ""
echo "✅ Successfully pushed to GitHub!"
echo ""
echo "Next steps:"
echo "1. Configure GitHub Secrets for deployment (see .github/README.md)"
echo "2. Set up SSH key for automated deployments"
echo "3. Verify GitHub Actions workflows are running"
echo ""
echo "Repository URL: $(git remote get-url origin)"
