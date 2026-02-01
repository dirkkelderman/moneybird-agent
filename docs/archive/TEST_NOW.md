# 🚀 Test Now - Step by Step

Follow these steps in order to test the application as quickly as possible.

## Step 1: Install Dependencies (2 minutes)

```bash
npm install
```

This installs all required packages including LangGraph, OpenAI SDK, SQLite, etc.

## Step 2: Create .env File (1 minute)

Create a `.env` file in the project root:

**Option 1: OAuth (REST API)**
```env
MONEYBIRD_CLIENT_ID=your_client_id
MONEYBIRD_CLIENT_SECRET=your_client_secret
MONEYBIRD_ACCESS_TOKEN=your_access_token
MONEYBIRD_ADMINISTRATION_ID=your_administration_id
OPENAI_API_KEY=your_actual_openai_key_here
OPENAI_MODEL=gpt-4o
DATABASE_PATH=./data/moneybird-agent.db
```

**Option 2: Token (MCP or direct API)**
```env
MONEYBIRD_TOKEN=your_token
MONEYBIRD_ADMINISTRATION_ID=your_administration_id
OPENAI_API_KEY=your_actual_openai_key_here
OPENAI_MODEL=gpt-4o
DATABASE_PATH=./data/moneybird-agent.db
```

**Note**: 
- You need either OAuth credentials OR a token (not both required)
- You need a real OpenAI API key for AI features
- For initial testing, you can use placeholder values

## Step 3: Test Basic Setup (1 minute)

```bash
npm run build
```

This compiles TypeScript. If you see errors about LangGraph, that's expected - we'll fix it next.

## Step 4: Test Database & Config (30 seconds)

```bash
npm run test:manual
```

This tests:
- ✅ Environment variable loading
- ✅ Database initialization
- ✅ State creation
- ✅ Basic node functions

**Expected output**: You should see "✅ All manual tests completed!"

## Step 5: Test Application Startup (30 seconds)

```bash
npm start
```

This should:
- Create database tables
- Start the scheduler
- Log startup messages

Press `Ctrl+C` to stop.

**If you see LangGraph errors**: That's OK - the graph isn't fully implemented yet. The app will still start and initialize the database.

## Step 6: Check Database (30 seconds)

```bash
sqlite3 ./data/moneybird-agent.db ".tables"
```

You should see:
- `supplier_kostenpost_mappings`
- `corrections`
- `processing_log`

## ✅ What Works Now

- ✅ Database setup and schema
- ✅ Environment configuration
- ✅ State management
- ✅ Basic node functions (without Moneybird calls)
- ✅ Learning system storage
- ✅ Logging system

## ❌ What Needs Implementation

1. **LangGraph API**: May need adjustment after seeing actual errors
2. **Moneybird MCP**: All methods need MCP tool integration
3. **Node Logic**: Most nodes have placeholder logic
4. **PDF Processing**: OCR/vision not yet implemented

## Next Steps After Basic Test

1. **Fix LangGraph** (if needed): Check error messages and adjust `src/agent/graph.ts`
2. **Implement Moneybird MCP**: Connect to MCP server and implement tool calls
3. **Test with Real Data**: Once MCP works, test with actual Moneybird invoices

## Quick Debugging

If something fails:

1. **Build errors**: Check TypeScript version matches package.json
2. **Runtime errors**: Check `.env` file exists and has required keys
3. **Database errors**: Delete `./data/` folder and try again
4. **LangGraph errors**: Comment out graph creation in `src/index.ts` temporarily

## Test Individual Components

You can test individual files:

```bash
# Test just the config
tsx -e "import { getEnv } from './src/config/env.js'; console.log(getEnv())"

# Test database
tsx -e "import { getDatabase } from './src/storage/db.js'; getDatabase(); console.log('OK')"
```

---

**Total time to first test: ~5 minutes**
