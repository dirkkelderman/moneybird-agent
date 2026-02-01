# Workflow State Issue - Known Limitation

## Problem

The workflow is executing correctly (nodes run, invoice is detected), but LangGraph 0.2.x is not properly merging state updates when using `channels: {} as any`.

**Symptoms:**
- `detectNewInvoices` finds and selects invoice (logs confirm)
- Router function `routeAfterDetectInvoices` doesn't see the invoice in state
- Workflow routes to `alert` instead of continuing

**Root Cause:**
LangGraph 0.2.x requires proper state channel configuration using the Annotation API. The `channels: {} as any` workaround doesn't properly merge state updates.

## Current Status

✅ **All nodes are executing correctly**
✅ **Invoice detection works** (finds 3 unprocessed invoices)
✅ **MCP integration works** (can fetch invoice directly)
❌ **State merging doesn't work** (router doesn't see merged state)

## Workaround

For now, the workflow can be tested by:
1. Directly calling individual nodes with the invoice
2. Using the invoice ID to fetch and process manually
3. Waiting for proper Annotation API implementation

## Solution (Future)

Refactor to use LangGraph's Annotation API:

```typescript
import { Annotation } from "@langchain/langgraph";

const AgentAnnotation = Annotation.Root({
  invoice: Annotation<MoneybirdInvoice>(),
  contact: Annotation<MoneybirdContact>(),
  // ... other state fields
});

const workflow = new StateGraph(AgentAnnotation);
```

This requires updating all node signatures and the graph definition.
