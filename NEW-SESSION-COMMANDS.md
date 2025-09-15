# 🤖 RevBot New Session Commands - Copy & Paste These Exactly

## Step 1: Start New Claude Session
```bash
claude
```

## Step 2: Test MCP Memory Connection (Copy this exactly)
```
get_current_business_state
```

**Expected Result:** Should show RevBot initialization message

## Step 3: Register Your Active QR Service (Copy this exactly)
```
register_service({
  "name": "QR Code Generator API",
  "type": "utility_api",
  "max_daily_spend": 100,
  "auto_scale": true
})
```

**Expected Result:** Will give you a service ID

## Step 4: Record Your Existing Revenue (Copy this exactly, replace SERVICE-ID)
```
record_transaction({
  "service_id": "PUT-THE-SERVICE-ID-FROM-STEP-3-HERE",
  "amount": 20,
  "currency": "USD",
  "metadata": {"source": "QR Generator earnings"}
})
```

## Step 5: Save RevBot Business State (Copy this exactly)
```
save_business_state({
  "session_summary": "RevBot fully operational - QR Generator earning $0.20/day, MCP Memory Server connected and working",
  "current_priorities": ["Scale QR service revenue", "Deploy URL shortener service", "Add Stripe integration"],
  "optimization_strategies": ["Monitor QR service performance", "A/B test pricing", "Add batch processing"],
  "pending_decisions": ["Consider scaling if revenue hits $10/day"]
})
```

## Step 6: Test Immortality
1. **Exit Claude** (type `exit` or close terminal)
2. **Start new session:** `claude`
3. **Test memory:** `get_current_business_state`

**If it shows your saved summary → SUCCESS! RevBot is immortal!**

---

## What to Tell Me in New Session

**Just say:** "I followed the NEW-SESSION-COMMANDS.md file, here's what happened..."

**Then paste the results of each command.**

---

**REMEMBER: Your QR service is still earning money at http://localhost:4001 while you test this!**