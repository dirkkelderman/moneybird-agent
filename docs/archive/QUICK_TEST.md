# Quick Testing Guide

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Create .env File

Create a `.env` file in the project root:

```env
# Minimum required for testing
MONEYBIRD_TOKEN=your_token_here
OPENAI_API_KEY=your_openai_key_here

# Optional - defaults are fine for testing
OPENAI_MODEL=gpt-4o
DATABASE_PATH=./data/moneybird-agent.db
CONFIDENCE_AUTO_THRESHOLD=95
CONFIDENCE_REVIEW_THRESHOLD=80
AMOUNT_REVIEW_THRESHOLD=100000
CRON_SCHEDULE=0 * * * *
LOG_LEVEL=info
```

## Step 3: Fix LangGraph API (Critical)

The LangGraph API needs to be fixed. Run this first:

```bash
npm install
```

Then check if the build works:

```bash
npm run build
```

If you get errors about StateGraph, we'll need to fix the graph.ts file.

## Step 4: Test Database Setup

```bash
npm run build
npm start
```

This should:

- Create the database
- Initialize tables
- Start the scheduler
- Log startup messages

Press Ctrl+C to stop.

## Step 5: Test Individual Nodes (Manual)

Create a test script to test nodes individually without full workflow.

## Step 6: Test with Mock Data

Before connecting to real Moneybird, test with mock data to verify the workflow logic.

---

## Current Blockers for Full Testing

1. **LangGraph API**: May need adjustment after `npm install`
2. **Moneybird MCP**: All methods throw "Not implemented" - need MCP integration
3. **Node Logic**: Most nodes have placeholder logic

## Minimal Viable Test

To test the structure without full integration:

1. Install dependencies
2. Build the project
3. Verify it starts without errors
4. Check database is created
5. Test individual node functions with mock data
