# RevBot System Configuration

## System Status
✅ **MCP Memory Server**: Running and operational
🔄 **Stripe Server**: Pending implementation
🎯 **Revenue Services**: Ready for deployment

## Quick Commands for Claude Code

### Memory Management
```bash
# Check RevBot business state
get_current_business_state()

# Save current session state
save_business_state({
  "session_summary": "Description of what was accomplished",
  "current_priorities": ["Priority 1", "Priority 2"],
  "pending_decisions": [],
  "optimization_strategies": []
})
```

### Service Management
```bash
# Register new service
register_service({
  "name": "QR Code Generator API",
  "type": "utility_api",
  "max_daily_spend": 50,
  "auto_scale": true
})

# Update service performance
update_service_performance({
  "service_id": "service-uuid",
  "daily_revenue": 25.50,
  "daily_costs": 5.00,
  "customer_count": 12
})

# View all services
get_all_services()
```

### Revenue Tracking
```bash
# Record transaction
record_transaction({
  "service_id": "service-uuid",
  "amount": 0.50,
  "customer_id": "customer-uuid",
  "stripe_transaction_id": "pi_xxx"
})

# Get revenue analytics
get_revenue_analytics({"timeframe_days": 30})
```

### Decision Management
```bash
# Log important decisions
log_decision({
  "decision_type": "service_scaling",
  "context": "QR API generating $50/day",
  "reasoning": "High demand, low competition",
  "outcome": "pending",
  "revenue_impact": 100,
  "risk_level": "low",
  "confidence_score": 0.8
})

# Check pending decisions
get_pending_decisions()
```

### Market Intelligence
```bash
# Record market opportunity
record_market_opportunity({
  "opportunity_type": "PDF to Text Converter",
  "profit_potential": 200,
  "competition_level": "medium",
  "implementation_effort": "low",
  "discovery_source": "Reddit discussion"
})

# Get business insights
get_business_insights()
```

## RevBot Operational Guidelines

### Daily Limits (Safety Controls)
- **Max Daily Spend**: $100 initially
- **Service Kill Threshold**: -$10/day profit
- **Auto-scale Trigger**: +$50/day profit
- **Human Approval Required**: >$500 decisions

### Success Metrics
- **Break-even Target**: $20-100/month
- **Success Target**: $200-1000/month
- **Scale Target**: $1000+/month

### Approval Workflow
1. **Auto-approved**: Daily spending <$50, service scaling <$100 investment
2. **Human approval**: New market entry >$100, legal decisions, customer complaints
3. **Kill decisions**: Automatic after 7 days of losses >$10/day

## Testing Commands
```bash
# Test memory persistence
get_current_business_state()

# Initialize first service
register_service({"name": "Test Service", "type": "test"})

# Record test transaction
record_transaction({"service_id": "uuid", "amount": 1.00})

# Check insights
get_business_insights()
```

## Next Steps
1. ✅ MCP Memory Server operational
2. 🔄 Create Stripe MCP Server
3. 🎯 Deploy first revenue service
4. 📊 Begin autonomous operations

---

*This file contains Claude Code specific commands and configurations for RevBot autonomous operations. Update as system evolves.*