# 🔧 Claude Code MCP Setup - Make RevBot Immortal

## Step 1: Open Claude Code Settings

1. **Open Claude Code** (the desktop app)
2. **Go to Settings** (gear icon)
3. **Find "MCP Servers" section**

## Step 2: Add RevBot Memory Server

**Add this exact configuration:**

```json
{
  "mcpServers": {
    "revbot-memory": {
      "command": "node",
      "args": ["C:\\Users\\eoino\\revbot-system\\mcp-servers\\memory-server\\dist\\index.js"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

**Or if there's already MCP config, add this to the existing servers:**

```json
"revbot-memory": {
  "command": "node",
  "args": ["C:\\Users\\eoino\\revbot-system\\mcp-servers\\memory-server\\dist\\index.js"],
  "env": {
    "NODE_ENV": "production"
  }
}
```

## Step 3: Test the Connection

**In Claude Code, run these commands:**

```
get_current_business_state
```

**Expected result:**
```
🆕 **REVBOT INITIALIZATION**

No previous business state found. Starting fresh RevBot session.

**NEXT STEPS:**
1. Deploy first revenue services
2. Set up Stripe integration
3. Begin autonomous operations

RevBot Memory Server is ready for business!
```

## Step 4: Register Your QR Service

**Run this command in Claude Code:**

```
register_service({
  "name": "QR Code Generator API",
  "type": "utility_api",
  "max_daily_spend": 100,
  "auto_scale": true
})
```

## Step 5: Record Your Revenue

**Tell RevBot about the money it's already made:**

```
record_transaction({
  "service_id": "the-service-id-from-step-4",
  "amount": 20,
  "currency": "USD",
  "customer_id": "test-customer",
  "metadata": {"source": "QR API earnings"}
})
```

## Step 6: Test Persistence

1. **Save current state:**
```
save_business_state({
  "session_summary": "RevBot fully operational, QR service earning money",
  "current_priorities": ["Scale QR service", "Deploy URL shortener"],
  "optimization_strategies": ["Monitor performance", "Add more services"]
})
```

2. **Close Claude Code**
3. **Reopen Claude Code**
4. **Run:** `get_current_business_state`

**If it shows your saved summary → SUCCESS! RevBot is now immortal.**

---

**This is the final piece that makes RevBot truly autonomous across sessions.**