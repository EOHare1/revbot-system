#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';

// RevBot data structures for enterprise scale
interface BusinessState {
  id: string;
  timestamp: number;
  total_revenue: number;
  active_services: number;
  pending_decisions: any[];
  current_priorities: string[];
  session_summary: string;
  optimization_strategies: any[];
  risk_metrics: {
    daily_spend: number;
    service_failures: number;
    customer_complaints: number;
  };
}

// NEW: Autonomous conversation tracking
interface ConversationTurn {
  id: string;
  session_id: string;
  timestamp: number;
  user_input: string;
  ai_response: string;
  context_type: 'planning' | 'implementation' | 'debugging' | 'analysis' | 'decision';
  extracted_entities: {
    tasks_mentioned: string[];
    technologies_discussed: string[];
    decisions_made: string[];
    blockers_identified: string[];
  };
  importance_score: number;
}

// NEW: Technical discovery tracking
interface TechnicalDiscovery {
  id: string;
  timestamp: number;
  discovery_type: 'code_exists' | 'configuration_needed' | 'dependency_ready' | 'service_built' | 'blocker_found';
  title: string;
  description: string;
  file_path?: string;
  impact_level: 'low' | 'medium' | 'high' | 'critical';
  actionable_insights: string[];
  related_conversation_turn_id?: string;
}

// NEW: Blocker tracking
interface Blocker {
  id: string;
  timestamp: number;
  title: string;
  description: string;
  blocker_type: 'technical' | 'dependency' | 'configuration' | 'access' | 'knowledge_gap';
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'identified' | 'investigating' | 'resolved' | 'escalated';
  resolution_steps: string[];
  resolution_summary?: string;
}

// NEW: Progress milestone tracking
interface ProgressMilestone {
  id: string;
  timestamp: number;
  milestone_type: 'task_started' | 'task_completed' | 'checkpoint_reached' | 'goal_achieved';
  title: string;
  description: string;
  completion_percentage: number;
  next_steps: string[];
}

interface Service {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'paused' | 'killed' | 'scaling';
  created_at: number;
  daily_revenue: number;
  daily_costs: number;
  customer_count: number;
  performance_metrics: {
    uptime_percentage: number;
    response_time_ms: number;
    error_rate: number;
    customer_satisfaction: number;
  };
  scaling_config: {
    auto_scale: boolean;
    max_daily_spend: number;
    kill_threshold: number;
  };
  updated_at: number;
}

interface Transaction {
  id: string;
  service_id: string;
  amount: number;
  currency: string;
  customer_id?: string;
  timestamp: number;
  stripe_transaction_id?: string;
  metadata: Record<string, any>;
}

interface Decision {
  id: string;
  timestamp: number;
  decision_type: string;
  context: string;
  reasoning: string;
  outcome: 'approved' | 'denied' | 'pending' | 'auto_approved';
  revenue_impact?: number;
  risk_level?: 'low' | 'medium' | 'high';
  confidence_score?: number;
  impact_metrics: {
    revenue_impact: number;
    risk_level: 'low' | 'medium' | 'high';
    confidence_score: number;
  };
}

interface MarketOpportunity {
  id: string;
  opportunity_type: string;
  market_size?: number;
  competition_level?: 'low' | 'medium' | 'high';
  profit_potential?: number;
  implementation_effort?: 'low' | 'medium' | 'high';
  discovery_source?: string;
  analysis_data: Record<string, any>;
  status: 'discovered' | 'analyzing' | 'implementing' | 'deployed' | 'failed';
  created_at: number;
}

interface Customer {
  id: string;
  email?: string;
  first_transaction: number;
  total_spent: number;
  service_usage: Record<string, any>;
  satisfaction_score: number;
  churn_risk: number;
  created_at: number;
  updated_at: number;
}

interface RevBotData {
  business_states: BusinessState[];
  services: Service[];
  transactions: Transaction[];
  decisions: Decision[];
  market_opportunities: MarketOpportunity[];
  customers: Customer[];
  // NEW: Autonomous tracking collections
  conversation_turns: ConversationTurn[];
  technical_discoveries: TechnicalDiscovery[];
  blockers: Blocker[];
  progress_milestones: ProgressMilestone[];
  session_metadata: {
    current_session_id: string;
    session_start: number;
    last_activity: number;
    auto_save_enabled: boolean;
  };
}

class RevBotMemoryServer {
  private dataPath: string;
  private data: RevBotData = {
    business_states: [],
    services: [],
    transactions: [],
    decisions: [],
    market_opportunities: [],
    customers: [],
    // NEW: Initialize autonomous tracking
    conversation_turns: [],
    technical_discoveries: [],
    blockers: [],
    progress_milestones: [],
    session_metadata: {
      current_session_id: uuidv4(),
      session_start: Date.now(),
      last_activity: Date.now(),
      auto_save_enabled: true,
    },
  };

  // NEW: Auto-save timer
  private autoSaveTimer?: NodeJS.Timeout;
  private lastAutoSave = Date.now();
  private server: Server;

  constructor() {
    // Ensure data directory exists
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.dataPath = path.join(dataDir, 'revbot-data.json');
    this.loadData();

    this.server = new Server(
      {
        name: 'revbot-memory-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.startAutoSaveTimer();
  }

  private loadData() {
    try {
      if (fs.existsSync(this.dataPath)) {
        const rawData = fs.readFileSync(this.dataPath, 'utf8');
        this.data = JSON.parse(rawData);
      } else {
        // Initialize empty data structure with autonomous tracking
        this.data = {
          business_states: [],
          services: [],
          transactions: [],
          decisions: [],
          market_opportunities: [],
          customers: [],
          conversation_turns: [],
          technical_discoveries: [],
          blockers: [],
          progress_milestones: [],
          session_metadata: {
            current_session_id: uuidv4(),
            session_start: Date.now(),
            last_activity: Date.now(),
            auto_save_enabled: true,
          },
        };
        this.saveData();
      }
    } catch (error) {
      console.error('Error loading data:', error);
      // Initialize with empty data on error
      this.data = {
        business_states: [],
        services: [],
        transactions: [],
        decisions: [],
        market_opportunities: [],
        customers: [],
        conversation_turns: [],
        technical_discoveries: [],
        blockers: [],
        progress_milestones: [],
        session_metadata: {
          current_session_id: uuidv4(),
          session_start: Date.now(),
          last_activity: Date.now(),
          auto_save_enabled: true,
        },
      };
    }
  }

  private saveData() {
    try {
      // Update session metadata
      this.data.session_metadata.last_activity = Date.now();
      fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
      this.lastAutoSave = Date.now();
    } catch (error) {
      console.error('Error saving data:', error);
    }
  }

  // NEW: Auto-save functionality
  private startAutoSaveTimer() {
    this.autoSaveTimer = setInterval(() => {
      const timeSinceLastSave = Date.now() - this.lastAutoSave;
      if (timeSinceLastSave > 30000 && this.data.session_metadata?.auto_save_enabled) {
        this.saveData();
        console.log('Auto-saved RevBot state');
      }
    }, 10000); // Check every 10 seconds
  }

  private stopAutoSaveTimer() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Core business state management
        {
          name: 'save_business_state',
          description: 'Save complete RevBot business state for session persistence',
          inputSchema: {
            type: 'object',
            properties: {
              session_summary: { type: 'string', description: 'Summary of current session activities' },
              current_priorities: { type: 'array', items: { type: 'string' }, description: 'Current business priorities' },
              pending_decisions: { type: 'array', description: 'Decisions awaiting approval' },
              optimization_strategies: { type: 'array', description: 'Active optimization strategies' },
            },
            required: ['session_summary'],
          },
        },
        {
          name: 'get_current_business_state',
          description: 'Retrieve latest business state for session restoration',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },

        // Service management at scale
        {
          name: 'register_service',
          description: 'Register new RevBot service for tracking',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string' },
              max_daily_spend: { type: 'number', default: 100 },
              auto_scale: { type: 'boolean', default: true },
            },
            required: ['name', 'type'],
          },
        },
        {
          name: 'update_service_performance',
          description: 'Update service performance metrics',
          inputSchema: {
            type: 'object',
            properties: {
              service_id: { type: 'string' },
              daily_revenue: { type: 'number' },
              daily_costs: { type: 'number' },
              customer_count: { type: 'number' },
              performance_metrics: {
                type: 'object',
                properties: {
                  uptime_percentage: { type: 'number' },
                  response_time_ms: { type: 'number' },
                  error_rate: { type: 'number' },
                  customer_satisfaction: { type: 'number' },
                },
              },
            },
            required: ['service_id'],
          },
        },
        {
          name: 'get_all_services',
          description: 'Get all registered services with current status',
          inputSchema: {
            type: 'object',
            properties: {
              status_filter: { type: 'string', enum: ['active', 'paused', 'killed', 'scaling'] },
            },
          },
        },

        // Revenue intelligence
        {
          name: 'record_transaction',
          description: 'Record revenue transaction',
          inputSchema: {
            type: 'object',
            properties: {
              service_id: { type: 'string' },
              amount: { type: 'number' },
              currency: { type: 'string', default: 'USD' },
              customer_id: { type: 'string' },
              stripe_transaction_id: { type: 'string' },
              metadata: { type: 'object' },
            },
            required: ['service_id', 'amount'],
          },
        },
        {
          name: 'get_revenue_analytics',
          description: 'Get comprehensive revenue analytics',
          inputSchema: {
            type: 'object',
            properties: {
              timeframe_days: { type: 'number', default: 30 },
              service_id: { type: 'string' },
            },
          },
        },

        // Decision intelligence
        {
          name: 'log_decision',
          description: 'Log AI decision with reasoning and impact',
          inputSchema: {
            type: 'object',
            properties: {
              decision_type: { type: 'string' },
              context: { type: 'string' },
              reasoning: { type: 'string' },
              outcome: { type: 'string', enum: ['approved', 'denied', 'pending', 'auto_approved'] },
              revenue_impact: { type: 'number' },
              risk_level: { type: 'string', enum: ['low', 'medium', 'high'] },
              confidence_score: { type: 'number' },
            },
            required: ['decision_type', 'context', 'reasoning'],
          },
        },
        {
          name: 'get_pending_decisions',
          description: 'Get all decisions awaiting human approval',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },

        // Market intelligence
        {
          name: 'record_market_opportunity',
          description: 'Record discovered market opportunity',
          inputSchema: {
            type: 'object',
            properties: {
              opportunity_type: { type: 'string' },
              market_size: { type: 'number' },
              competition_level: { type: 'string', enum: ['low', 'medium', 'high'] },
              profit_potential: { type: 'number' },
              implementation_effort: { type: 'string', enum: ['low', 'medium', 'high'] },
              discovery_source: { type: 'string' },
              analysis_data: { type: 'object' },
            },
            required: ['opportunity_type'],
          },
        },
        {
          name: 'get_market_opportunities',
          description: 'Get ranked market opportunities',
          inputSchema: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['discovered', 'analyzing', 'implementing', 'deployed', 'failed'] },
              limit: { type: 'number', default: 10 },
            },
          },
        },

        // Analytics and insights
        {
          name: 'get_business_insights',
          description: 'Get AI-generated business insights and recommendations',
          inputSchema: {
            type: 'object',
            properties: {
              focus_area: { type: 'string', enum: ['revenue', 'services', 'customers', 'opportunities', 'risks'] },
            },
          },
        },

        // NEW: Autonomous conversation tracking
        {
          name: 'log_conversation_turn',
          description: 'Automatically log conversation turn with extracted insights',
          inputSchema: {
            type: 'object',
            properties: {
              user_input: { type: 'string' },
              ai_response: { type: 'string' },
              context_type: { type: 'string', enum: ['planning', 'implementation', 'debugging', 'analysis', 'decision'] },
              extracted_entities: {
                type: 'object',
                properties: {
                  tasks_mentioned: { type: 'array', items: { type: 'string' } },
                  technologies_discussed: { type: 'array', items: { type: 'string' } },
                  decisions_made: { type: 'array', items: { type: 'string' } },
                  blockers_identified: { type: 'array', items: { type: 'string' } },
                },
              },
              importance_score: { type: 'number', minimum: 0, maximum: 1 },
            },
            required: ['user_input', 'ai_response'],
          },
        },
        {
          name: 'auto_capture_context',
          description: 'Automatically capture and analyze current conversation context',
          inputSchema: {
            type: 'object',
            properties: {
              trigger_type: { type: 'string', enum: ['decision_made', 'blocker_found', 'milestone_reached', 'technical_discovery'] },
              context_data: { type: 'object' },
            },
            required: ['trigger_type'],
          },
        },

        // NEW: Technical discovery tracking
        {
          name: 'log_technical_discovery',
          description: 'Log technical discoveries automatically',
          inputSchema: {
            type: 'object',
            properties: {
              discovery_type: { type: 'string', enum: ['code_exists', 'configuration_needed', 'dependency_ready', 'service_built', 'blocker_found'] },
              title: { type: 'string' },
              description: { type: 'string' },
              file_path: { type: 'string' },
              impact_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
              actionable_insights: { type: 'array', items: { type: 'string' } },
            },
            required: ['discovery_type', 'title', 'description'],
          },
        },

        // NEW: Blocker tracking
        {
          name: 'log_blocker',
          description: 'Log blockers and problems encountered',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              blocker_type: { type: 'string', enum: ['technical', 'dependency', 'configuration', 'access', 'knowledge_gap'] },
              severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
              resolution_steps: { type: 'array', items: { type: 'string' } },
            },
            required: ['title', 'description', 'blocker_type'],
          },
        },
        {
          name: 'resolve_blocker',
          description: 'Mark a blocker as resolved with solution',
          inputSchema: {
            type: 'object',
            properties: {
              blocker_id: { type: 'string' },
              resolution_summary: { type: 'string' },
            },
            required: ['blocker_id', 'resolution_summary'],
          },
        },

        // NEW: Progress milestone tracking
        {
          name: 'log_progress_milestone',
          description: 'Log progress milestones automatically',
          inputSchema: {
            type: 'object',
            properties: {
              milestone_type: { type: 'string', enum: ['task_started', 'task_completed', 'checkpoint_reached', 'goal_achieved'] },
              title: { type: 'string' },
              description: { type: 'string' },
              completion_percentage: { type: 'number', minimum: 0, maximum: 100 },
              next_steps: { type: 'array', items: { type: 'string' } },
            },
            required: ['milestone_type', 'title', 'description'],
          },
        },

        // NEW: Enhanced session restoration
        {
          name: 'get_full_session_context',
          description: 'Get complete context for perfect session restoration',
          inputSchema: {
            type: 'object',
            properties: {
              include_conversation_history: { type: 'boolean', default: true },
              include_technical_discoveries: { type: 'boolean', default: true },
              include_active_blockers: { type: 'boolean', default: true },
              max_conversation_turns: { type: 'number', default: 50 },
            },
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'save_business_state':
            return await this.saveBusinessState(args);
          case 'get_current_business_state':
            return await this.getCurrentBusinessState();
          case 'register_service':
            return await this.registerService(args);
          case 'update_service_performance':
            return await this.updateServicePerformance(args);
          case 'get_all_services':
            return await this.getAllServices(args);
          case 'record_transaction':
            return await this.recordTransaction(args);
          case 'get_revenue_analytics':
            return await this.getRevenueAnalytics(args);
          case 'log_decision':
            return await this.logDecision(args);
          case 'get_pending_decisions':
            return await this.getPendingDecisions();
          case 'record_market_opportunity':
            return await this.recordMarketOpportunity(args);
          case 'get_market_opportunities':
            return await this.getMarketOpportunities(args);
          case 'get_business_insights':
            return await this.getBusinessInsights(args);
          // NEW: Autonomous tracking handlers
          case 'log_conversation_turn':
            return await this.logConversationTurn(args);
          case 'auto_capture_context':
            return await this.autoCaptureContext(args);
          case 'log_technical_discovery':
            return await this.logTechnicalDiscovery(args);
          case 'log_blocker':
            return await this.logBlocker(args);
          case 'resolve_blocker':
            return await this.resolveBlocker(args);
          case 'log_progress_milestone':
            return await this.logProgressMilestone(args);
          case 'get_full_session_context':
            return await this.getFullSessionContext(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${error}`);
      }
    });
  }

  // Business state management
  private async saveBusinessState(args: any) {
    const id = uuidv4();
    const timestamp = Date.now();

    // Calculate current totals
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayRevenue = this.data.transactions
      .filter(t => t.timestamp >= todayStart)
      .reduce((sum, t) => sum + t.amount, 0);

    const activeServices = this.data.services.filter(s => s.status === 'active').length;

    const businessState: BusinessState = {
      id,
      timestamp,
      total_revenue: todayRevenue,
      active_services: activeServices,
      pending_decisions: args.pending_decisions || [],
      current_priorities: args.current_priorities || [],
      session_summary: args.session_summary,
      optimization_strategies: args.optimization_strategies || [],
      risk_metrics: {
        daily_spend: 0, // TODO: Calculate from services
        service_failures: 0, // TODO: Calculate from service status
        customer_complaints: 0, // TODO: Calculate from customer feedback
      },
    };

    this.data.business_states.push(businessState);
    this.saveData();

    return {
      content: [{
        type: 'text' as const,
        text: `✅ Business state saved successfully!\n\nID: ${id}\nRevenue Today: $${todayRevenue.toFixed(2)}\nActive Services: ${activeServices}\nSession: ${args.session_summary}`,
      }],
    };
  }

  private async getCurrentBusinessState() {
    const latestState = this.data.business_states
      .sort((a, b) => b.timestamp - a.timestamp)[0];

    if (!latestState) {
      return {
        content: [{
          type: 'text' as const,
          text: `🆕 **REVBOT INITIALIZATION**

No previous business state found. Starting fresh RevBot session.

**NEXT STEPS:**
1. Deploy first revenue services
2. Set up Stripe integration
3. Begin autonomous operations

RevBot Memory Server is ready for business!`,
        }],
      };
    }

    // Get recent activity
    const recentServices = this.data.services
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, 5);

    const last24Hours = Date.now() - (24 * 60 * 60 * 1000);
    const recentDecisions = this.data.decisions
      .filter(d => d.timestamp >= last24Hours)
      .slice(0, 3);

    const recentTransactions = this.data.transactions
      .filter(t => t.timestamp >= last24Hours);

    return {
      content: [{
        type: 'text' as const,
        text: `🤖 **REVBOT BUSINESS STATE RESTORED**

**CURRENT STATUS:**
💰 Total Revenue Today: $${latestState.total_revenue.toFixed(2)}
🏭 Active Services: ${latestState.active_services}
📝 Last Session: ${latestState.session_summary}
🎯 Current Priorities: ${latestState.current_priorities.length} items
⚠️ Pending Decisions: ${latestState.pending_decisions.length} awaiting approval

**RECENT ACTIVITY (24hrs):**
📊 Transactions: ${recentTransactions.length} totaling $${recentTransactions.reduce((sum, t) => sum + t.amount, 0).toFixed(2)}
🔧 Recent Decisions: ${recentDecisions.length}

**TOP SERVICES:**
${recentServices.map(s => `• ${s.name}: $${s.daily_revenue}/day (${s.status})`).join('\n')}

**CURRENT PRIORITIES:**
${latestState.current_priorities.map((p, i) => `${i + 1}. ${p}`).join('\n')}

🚀 **RevBot ready to continue autonomous operations!**`,
      }],
    };
  }

  // Service management methods
  private async registerService(args: any) {
    const id = uuidv4();
    const timestamp = Date.now();

    const service: Service = {
      id,
      name: args.name,
      type: args.type,
      status: 'active',
      created_at: timestamp,
      daily_revenue: 0,
      daily_costs: 0,
      customer_count: 0,
      performance_metrics: {
        uptime_percentage: 100,
        response_time_ms: 0,
        error_rate: 0,
        customer_satisfaction: 5.0,
      },
      scaling_config: {
        auto_scale: args.auto_scale !== false,
        max_daily_spend: args.max_daily_spend || 100,
        kill_threshold: -10,
      },
      updated_at: timestamp,
    };

    this.data.services.push(service);
    this.saveData();

    return {
      content: [{
        type: 'text' as const,
        text: `🚀 **SERVICE REGISTERED**

**${args.name}** (${args.type})
Service ID: ${id}
Max Daily Spend: $${args.max_daily_spend || 100}
Auto-scaling: ${args.auto_scale !== false ? 'Enabled' : 'Disabled'}

Service is now active and ready for deployment!`,
      }],
    };
  }

  private async updateServicePerformance(args: any) {
    const serviceIndex = this.data.services.findIndex(s => s.id === args.service_id);

    if (serviceIndex === -1) {
      throw new Error(`Service not found: ${args.service_id}`);
    }

    const service = this.data.services[serviceIndex];

    // Update performance metrics
    if (args.daily_revenue !== undefined) service.daily_revenue = args.daily_revenue;
    if (args.daily_costs !== undefined) service.daily_costs = args.daily_costs;
    if (args.customer_count !== undefined) service.customer_count = args.customer_count;

    if (args.performance_metrics) {
      const metrics = args.performance_metrics;
      if (metrics.uptime_percentage !== undefined) service.performance_metrics.uptime_percentage = metrics.uptime_percentage;
      if (metrics.response_time_ms !== undefined) service.performance_metrics.response_time_ms = metrics.response_time_ms;
      if (metrics.error_rate !== undefined) service.performance_metrics.error_rate = metrics.error_rate;
      if (metrics.customer_satisfaction !== undefined) service.performance_metrics.customer_satisfaction = metrics.customer_satisfaction;
    }

    service.updated_at = Date.now();

    // Auto-scaling logic
    if (service.scaling_config.auto_scale) {
      const dailyProfit = service.daily_revenue - service.daily_costs;

      if (dailyProfit < service.scaling_config.kill_threshold) {
        service.status = 'killed';
        this.logDecisionInternal({
          decision_type: 'auto_kill_service',
          context: `Service ${service.name} killed due to low profitability: $${dailyProfit}/day`,
          reasoning: `Daily profit ($${dailyProfit}) below kill threshold ($${service.scaling_config.kill_threshold})`,
          outcome: 'auto_approved',
          revenue_impact: dailyProfit,
          risk_level: 'low',
          confidence_score: 0.9,
        });
      } else if (dailyProfit > 50 && service.status === 'active') {
        service.status = 'scaling';
        this.logDecisionInternal({
          decision_type: 'auto_scale_service',
          context: `Service ${service.name} marked for scaling due to high profitability: $${dailyProfit}/day`,
          reasoning: `Daily profit ($${dailyProfit}) indicates strong demand and scalability potential`,
          outcome: 'auto_approved',
          revenue_impact: dailyProfit * 2, // Estimated 2x scaling potential
          risk_level: 'medium',
          confidence_score: 0.7,
        });
      }
    }

    this.saveData();

    return {
      content: [{
        type: 'text' as const,
        text: `📊 **SERVICE PERFORMANCE UPDATED**

**${service.name}**
💰 Revenue: $${service.daily_revenue}/day
💸 Costs: $${service.daily_costs}/day
💵 Profit: $${(service.daily_revenue - service.daily_costs).toFixed(2)}/day
👥 Customers: ${service.customer_count}
📈 Status: ${service.status}

**Performance Metrics:**
⏱️ Uptime: ${service.performance_metrics.uptime_percentage}%
🚀 Response: ${service.performance_metrics.response_time_ms}ms
❌ Errors: ${service.performance_metrics.error_rate}%
⭐ Satisfaction: ${service.performance_metrics.customer_satisfaction}/5.0`,
      }],
    };
  }

  private async getAllServices(args: any = {}) {
    let services = this.data.services;

    if (args.status_filter) {
      services = services.filter(s => s.status === args.status_filter);
    }

    // Sort by daily revenue descending
    services = services.sort((a, b) => b.daily_revenue - a.daily_revenue);

    const totalRevenue = services.reduce((sum, s) => sum + s.daily_revenue, 0);
    const totalCosts = services.reduce((sum, s) => sum + s.daily_costs, 0);
    const totalProfit = totalRevenue - totalCosts;

    return {
      content: [{
        type: 'text' as const,
        text: `🏭 **REVBOT SERVICE PORTFOLIO** (${services.length} services)

**PORTFOLIO SUMMARY:**
💰 Total Daily Revenue: $${totalRevenue.toFixed(2)}
💸 Total Daily Costs: $${totalCosts.toFixed(2)}
💵 Total Daily Profit: $${totalProfit.toFixed(2)}

**SERVICES:**
${services.map((s, i) => {
  const profit = s.daily_revenue - s.daily_costs;
  const statusEmoji = {
    active: '🟢',
    scaling: '📈',
    paused: '⏸️',
    killed: '❌'
  }[s.status] || '⚪';

  return `${statusEmoji} **${s.name}** (${s.type})
   💵 $${profit.toFixed(2)}/day profit (${s.daily_revenue} rev - ${s.daily_costs} costs)
   👥 ${s.customer_count} customers | ⭐ ${s.performance_metrics.customer_satisfaction}/5.0
   ⏱️ ${s.performance_metrics.uptime_percentage}% uptime`;
}).join('\n\n')}`,
      }],
    };
  }

  // Revenue tracking methods
  private async recordTransaction(args: any) {
    const id = uuidv4();
    const timestamp = Date.now();

    const transaction: Transaction = {
      id,
      service_id: args.service_id,
      amount: args.amount,
      currency: args.currency || 'USD',
      customer_id: args.customer_id,
      timestamp,
      stripe_transaction_id: args.stripe_transaction_id,
      metadata: args.metadata || {},
    };

    this.data.transactions.push(transaction);
    this.saveData();

    // Update service revenue
    const service = this.data.services.find(s => s.id === args.service_id);
    if (service) {
      // Update daily revenue (rough calculation)
      const todayStart = new Date().setHours(0, 0, 0, 0);
      const todayTransactions = this.data.transactions
        .filter(t => t.service_id === args.service_id && t.timestamp >= todayStart);
      const todayRevenue = todayTransactions.reduce((sum, t) => sum + t.amount, 0);

      service.daily_revenue = todayRevenue;
      service.updated_at = Date.now();
      this.saveData();
    }

    return {
      content: [{
        type: 'text' as const,
        text: `💰 **TRANSACTION RECORDED**

Amount: $${args.amount} ${args.currency || 'USD'}
Service: ${args.service_id}
Customer: ${args.customer_id || 'Anonymous'}
${args.stripe_transaction_id ? `Stripe ID: ${args.stripe_transaction_id}` : ''}

Transaction ID: ${id}`,
      }],
    };
  }

  private async getRevenueAnalytics(args: any = {}) {
    const timeframeDays = args.timeframe_days || 30;
    const cutoffTime = Date.now() - (timeframeDays * 24 * 60 * 60 * 1000);

    let transactions = this.data.transactions.filter(t => t.timestamp >= cutoffTime);

    if (args.service_id) {
      transactions = transactions.filter(t => t.service_id === args.service_id);
    }

    // Group by service
    const serviceAnalytics = new Map();

    transactions.forEach(t => {
      const serviceId = t.service_id;
      if (!serviceAnalytics.has(serviceId)) {
        serviceAnalytics.set(serviceId, {
          service_id: serviceId,
          transaction_count: 0,
          total_revenue: 0,
          transactions: [],
        });
      }

      const stats = serviceAnalytics.get(serviceId);
      stats.transaction_count++;
      stats.total_revenue += t.amount;
      stats.transactions.push(t);
    });

    const analytics = Array.from(serviceAnalytics.values())
      .sort((a, b) => b.total_revenue - a.total_revenue);

    const totalRevenue = transactions.reduce((sum, t) => sum + t.amount, 0);
    const totalTransactions = transactions.length;

    // Get service names
    const enrichedAnalytics = analytics.map(a => ({
      ...a,
      service_name: this.data.services.find(s => s.id === a.service_id)?.name || 'Unknown Service',
      avg_transaction: a.total_revenue / a.transaction_count,
      daily_average: a.total_revenue / timeframeDays,
    }));

    return {
      content: [{
        type: 'text' as const,
        text: `📊 **REVENUE ANALYTICS** (Last ${timeframeDays} days)

**OVERVIEW:**
💰 Total Revenue: $${totalRevenue.toFixed(2)}
📝 Total Transactions: ${totalTransactions}
📈 Average Transaction: $${totalTransactions > 0 ? (totalRevenue / totalTransactions).toFixed(2) : '0'}
📅 Daily Average: $${(totalRevenue / timeframeDays).toFixed(2)}

**BY SERVICE:**
${enrichedAnalytics.map((a, i) => `
${i + 1}. **${a.service_name}**
   💰 Revenue: $${a.total_revenue.toFixed(2)} (${((a.total_revenue / totalRevenue) * 100).toFixed(1)}%)
   📝 Transactions: ${a.transaction_count}
   📊 Avg Transaction: $${a.avg_transaction.toFixed(2)}
   📅 Daily Avg: $${a.daily_average.toFixed(2)}
`).join('\n')}`,
      }],
    };
  }

  // Decision tracking methods
  private logDecisionInternal(decisionInput: {
    decision_type: string;
    context: string;
    reasoning: string;
    outcome: 'approved' | 'denied' | 'pending' | 'auto_approved';
    revenue_impact?: number;
    risk_level?: 'low' | 'medium' | 'high';
    confidence_score?: number;
  }) {
    const decisionRecord: Decision = {
      id: uuidv4(),
      timestamp: Date.now(),
      decision_type: decisionInput.decision_type,
      context: decisionInput.context,
      reasoning: decisionInput.reasoning,
      outcome: decisionInput.outcome,
      revenue_impact: decisionInput.revenue_impact,
      risk_level: decisionInput.risk_level,
      confidence_score: decisionInput.confidence_score,
      impact_metrics: {
        revenue_impact: decisionInput.revenue_impact || 0,
        risk_level: decisionInput.risk_level || 'medium',
        confidence_score: decisionInput.confidence_score || 0.5,
      },
    };

    this.data.decisions.push(decisionRecord);
    this.saveData();

    return decisionRecord;
  }

  private async logDecision(args: any) {
    const decision = this.logDecisionInternal({
      decision_type: args.decision_type,
      context: args.context,
      reasoning: args.reasoning,
      outcome: args.outcome || 'pending',
      revenue_impact: args.revenue_impact,
      risk_level: args.risk_level,
      confidence_score: args.confidence_score,
    });

    return {
      content: [{
        type: 'text' as const,
        text: `📝 **DECISION LOGGED**

Type: ${decision.decision_type}
Outcome: ${decision.outcome}
Revenue Impact: $${decision.impact_metrics.revenue_impact || 0}
Risk Level: ${decision.impact_metrics.risk_level}
Confidence: ${((decision.impact_metrics.confidence_score || 0) * 100).toFixed(1)}%

Context: ${decision.context}
Reasoning: ${decision.reasoning}

Decision ID: ${decision.id}`,
      }],
    };
  }

  private async getPendingDecisions() {
    const pendingDecisions = this.data.decisions
      .filter(d => d.outcome === 'pending')
      .sort((a, b) => b.timestamp - a.timestamp);

    if (pendingDecisions.length === 0) {
      return {
        content: [{
          type: 'text' as const,
          text: `✅ **NO PENDING DECISIONS**

All decisions have been resolved. RevBot is operating autonomously within approved parameters.`,
        }],
      };
    }

    return {
      content: [{
        type: 'text' as const,
        text: `⚠️ **PENDING DECISIONS** (${pendingDecisions.length} awaiting approval)

${pendingDecisions.map((d, i) => {
  const riskEmoji = { low: '🟢', medium: '🟡', high: '🔴' }[d.impact_metrics.risk_level] || '⚪';

  return `${i + 1}. ${riskEmoji} **${d.decision_type}**
   💰 Revenue Impact: $${d.impact_metrics.revenue_impact}
   📊 Confidence: ${(d.impact_metrics.confidence_score * 100).toFixed(1)}%
   🕐 ${new Date(d.timestamp).toLocaleString()}

   **Context:** ${d.context}
   **Reasoning:** ${d.reasoning}

   Decision ID: ${d.id}`;
}).join('\n\n')}

**To approve/deny:** Update decision outcome through log_decision tool.`,
      }],
    };
  }

  // Market intelligence methods
  private async recordMarketOpportunity(args: any) {
    const id = uuidv4();

    const opportunity: MarketOpportunity = {
      id,
      opportunity_type: args.opportunity_type,
      market_size: args.market_size,
      competition_level: args.competition_level,
      profit_potential: args.profit_potential,
      implementation_effort: args.implementation_effort,
      discovery_source: args.discovery_source,
      analysis_data: args.analysis_data || {},
      status: 'discovered',
      created_at: Date.now(),
    };

    this.data.market_opportunities.push(opportunity);
    this.saveData();

    return {
      content: [{
        type: 'text' as const,
        text: `🔍 **MARKET OPPORTUNITY RECORDED**

**${args.opportunity_type}**
Market Size: ${args.market_size ? `$${args.market_size}` : 'Unknown'}
Competition: ${args.competition_level || 'Unknown'}
Profit Potential: ${args.profit_potential ? `$${args.profit_potential}` : 'Unknown'}
Implementation: ${args.implementation_effort || 'Unknown'}
Source: ${args.discovery_source || 'Unknown'}

Opportunity ID: ${id}
Status: Ready for analysis`,
      }],
    };
  }

  private async getMarketOpportunities(args: any = {}) {
    let opportunities = this.data.market_opportunities;

    if (args.status) {
      opportunities = opportunities.filter(o => o.status === args.status);
    }

    // Sort by profit potential descending, then by created_at descending
    opportunities = opportunities.sort((a, b) => {
      if (a.profit_potential && b.profit_potential) {
        return b.profit_potential - a.profit_potential;
      }
      return b.created_at - a.created_at;
    });

    if (args.limit) {
      opportunities = opportunities.slice(0, args.limit);
    }

    return {
      content: [{
        type: 'text' as const,
        text: `🎯 **MARKET OPPORTUNITIES** (${opportunities.length} found)

${opportunities.map((o, i) => {
  const statusEmoji = {
    discovered: '🔍',
    analyzing: '🔬',
    implementing: '🛠️',
    deployed: '🚀',
    failed: '❌'
  }[o.status] || '⚪';

  const competitionEmoji = {
    low: '🟢',
    medium: '🟡',
    high: '🔴'
  }[o.competition_level || 'medium'] || '⚪';

  const effortEmoji = {
    low: '🟢',
    medium: '🟡',
    high: '🔴'
  }[o.implementation_effort || 'medium'] || '⚪';

  return `${statusEmoji} **${o.opportunity_type}**
   💰 Profit: ${o.profit_potential ? `$${o.profit_potential}` : 'Unknown'}
   ${competitionEmoji} Competition: ${o.competition_level || 'Unknown'}
   ${effortEmoji} Effort: ${o.implementation_effort || 'Unknown'}
   📍 Source: ${o.discovery_source || 'Unknown'}
   📅 ${new Date(o.created_at).toLocaleDateString()}`;
}).join('\n\n')}`,
      }],
    };
  }

  private async getBusinessInsights(args: any = {}) {
    const focusArea = args.focus_area || 'revenue';

    // Calculate key metrics
    const last30Days = Date.now() - (30 * 24 * 60 * 60 * 1000);
    const recentTransactions = this.data.transactions.filter(t => t.timestamp >= last30Days);
    const totalRevenue = recentTransactions.reduce((sum, t) => sum + t.amount, 0);

    const activeServices = this.data.services.filter(s => s.status === 'active');
    const killedServices = this.data.services.filter(s => s.status === 'killed');
    const scalingServices = this.data.services.filter(s => s.status === 'scaling');

    const totalDailyCosts = activeServices.reduce((sum, s) => sum + s.daily_costs, 0);
    const totalDailyRevenue = activeServices.reduce((sum, s) => sum + s.daily_revenue, 0);
    const dailyProfit = totalDailyRevenue - totalDailyCosts;

    const pendingDecisions = this.data.decisions.filter(d => d.outcome === 'pending');
    const highRiskDecisions = pendingDecisions.filter(d => d.impact_metrics.risk_level === 'high');

    let insights = `🧠 **REVBOT BUSINESS INSIGHTS**\n\n`;

    // Revenue insights
    if (focusArea === 'revenue' || !focusArea) {
      insights += `**REVENUE ANALYSIS:**
💰 Monthly Revenue: $${totalRevenue.toFixed(2)}
📊 Daily Revenue: $${totalDailyRevenue.toFixed(2)}
💸 Daily Costs: $${totalDailyCosts.toFixed(2)}
💵 Daily Profit: $${dailyProfit.toFixed(2)}

`;
    }

    // Service insights
    if (focusArea === 'services' || !focusArea) {
      insights += `**SERVICE PORTFOLIO:**
🟢 Active: ${activeServices.length}
📈 Scaling: ${scalingServices.length}
❌ Killed: ${killedServices.length}
📊 Success Rate: ${activeServices.length > 0 ? ((activeServices.length / this.data.services.length) * 100).toFixed(1) : 0}%

`;
    }

    // Generate recommendations
    insights += `**AI RECOMMENDATIONS:**\n`;

    if (dailyProfit < 0) {
      insights += `🔴 URGENT: Daily losses of $${Math.abs(dailyProfit).toFixed(2)} - Kill underperforming services\n`;
    } else if (dailyProfit < 10) {
      insights += `🟡 Focus on customer acquisition - Daily profit below $10\n`;
    } else if (dailyProfit > 100) {
      insights += `🟢 Strong performance - Consider scaling successful services\n`;
    }

    if (activeServices.length < 3) {
      insights += `📈 Deploy more services to diversify revenue streams (current: ${activeServices.length})\n`;
    }

    if (scalingServices.length > 0) {
      insights += `🚀 ${scalingServices.length} service(s) ready for scaling - Allocate resources\n`;
    }

    if (highRiskDecisions.length > 0) {
      insights += `⚠️ ${highRiskDecisions.length} high-risk decision(s) pending approval\n`;
    }

    const recentOpportunities = this.data.market_opportunities
      .filter(o => o.created_at >= last30Days && o.status === 'discovered');

    if (recentOpportunities.length > 0) {
      insights += `🎯 ${recentOpportunities.length} new market opportunity(ies) discovered this month\n`;
    }

    // Performance insights
    const avgSatisfaction = activeServices.length > 0
      ? activeServices.reduce((sum, s) => sum + s.performance_metrics.customer_satisfaction, 0) / activeServices.length
      : 0;

    if (avgSatisfaction < 3.5) {
      insights += `🔴 Customer satisfaction low (${avgSatisfaction.toFixed(1)}/5.0) - Review service quality\n`;
    } else if (avgSatisfaction > 4.5) {
      insights += `🟢 Excellent customer satisfaction (${avgSatisfaction.toFixed(1)}/5.0) - Leverage for growth\n`;
    }

    return {
      content: [{
        type: 'text' as const,
        text: insights,
      }],
    };
  }

  // NEW: Autonomous conversation tracking methods
  private async logConversationTurn(args: any) {
    const id = uuidv4();
    const timestamp = Date.now();

    // Auto-extract entities from conversation
    const extractedEntities = this.extractEntitiesFromConversation(args.user_input, args.ai_response);

    const conversationTurn: ConversationTurn = {
      id,
      session_id: this.data.session_metadata.current_session_id,
      timestamp,
      user_input: args.user_input,
      ai_response: args.ai_response,
      context_type: args.context_type || this.inferContextType(args.user_input, args.ai_response),
      extracted_entities: args.extracted_entities || extractedEntities,
      importance_score: args.importance_score || this.calculateImportanceScore(args.user_input, args.ai_response),
    };

    this.data.conversation_turns.push(conversationTurn);
    this.saveData();

    // Auto-trigger context analysis
    await this.autoCaptureContext({ trigger_type: 'decision_made', context_data: conversationTurn });

    return {
      content: [{
        type: 'text' as const,
        text: `🤖 **CONVERSATION LOGGED**\n\nTurn ID: ${id}\nContext: ${conversationTurn.context_type}\nImportance: ${(conversationTurn.importance_score * 100).toFixed(1)}%\n\n**Extracted:**\n- Tasks: ${extractedEntities.tasks_mentioned.join(', ') || 'None'}\n- Technologies: ${extractedEntities.technologies_discussed.join(', ') || 'None'}\n- Decisions: ${extractedEntities.decisions_made.join(', ') || 'None'}\n- Blockers: ${extractedEntities.blockers_identified.join(', ') || 'None'}`,
      }],
    };
  }

  private async autoCaptureContext(args: any) {
    const { trigger_type, context_data } = args;

    // Auto-analyze and save important context based on trigger
    switch (trigger_type) {
      case 'decision_made':
        // Check if conversation contains important decisions
        if (context_data?.extracted_entities?.decisions_made?.length > 0) {
          for (const decision of context_data.extracted_entities.decisions_made) {
            await this.logDecisionInternal({
              decision_type: 'conversation_decision',
              context: `Decision made in conversation: ${decision}`,
              reasoning: 'Auto-detected from conversation analysis',
              outcome: 'auto_approved',
              confidence_score: 0.8,
            });
          }
        }
        break;

      case 'blocker_found':
        // Auto-log blockers found in conversation
        if (context_data?.extracted_entities?.blockers_identified?.length > 0) {
          for (const blocker of context_data.extracted_entities.blockers_identified) {
            await this.logBlocker({
              title: blocker,
              description: `Auto-detected blocker from conversation`,
              blocker_type: 'technical',
              severity: 'medium',
              resolution_steps: ['Investigate blocker', 'Find solution', 'Implement fix'],
            });
          }
        }
        break;

      case 'technical_discovery':
        // Auto-log technical discoveries
        if (context_data?.extracted_entities?.technologies_discussed?.length > 0) {
          for (const tech of context_data.extracted_entities.technologies_discussed) {
            await this.logTechnicalDiscovery({
              discovery_type: 'dependency_ready',
              title: `${tech} technology discussed`,
              description: `Technical discussion about ${tech} in conversation`,
              impact_level: 'medium',
              actionable_insights: [`Review ${tech} implementation`, `Consider ${tech} integration`],
            });
          }
        }
        break;
    }

    return {
      content: [{
        type: 'text' as const,
        text: `✅ **AUTO-CAPTURED CONTEXT**\n\nTrigger: ${trigger_type}\nAnalyzed and logged relevant context automatically.`,
      }],
    };
  }

  private async logTechnicalDiscovery(args: any) {
    const id = uuidv4();
    const timestamp = Date.now();

    const discovery: TechnicalDiscovery = {
      id,
      timestamp,
      discovery_type: args.discovery_type,
      title: args.title,
      description: args.description,
      file_path: args.file_path,
      impact_level: args.impact_level || 'medium',
      actionable_insights: args.actionable_insights || [],
      related_conversation_turn_id: args.related_conversation_turn_id,
    };

    this.data.technical_discoveries.push(discovery);
    this.saveData();

    return {
      content: [{
        type: 'text' as const,
        text: `🔍 **TECHNICAL DISCOVERY LOGGED**\n\n**${args.title}**\nType: ${args.discovery_type}\nImpact: ${args.impact_level}\n\n${args.description}\n\n**Insights:**\n${(args.actionable_insights || []).map((insight: string) => `• ${insight}`).join('\n')}\n\nDiscovery ID: ${id}`,
      }],
    };
  }

  private async logBlocker(args: any) {
    const id = uuidv4();
    const timestamp = Date.now();

    const blocker: Blocker = {
      id,
      timestamp,
      title: args.title,
      description: args.description,
      blocker_type: args.blocker_type,
      severity: args.severity || 'medium',
      status: 'identified',
      resolution_steps: args.resolution_steps || [],
    };

    this.data.blockers.push(blocker);
    this.saveData();

    return {
      content: [{
        type: 'text' as const,
        text: `🚫 **BLOCKER LOGGED**\n\n**${args.title}**\nType: ${args.blocker_type}\nSeverity: ${args.severity}\nStatus: Identified\n\n${args.description}\n\n**Resolution Steps:**\n${(args.resolution_steps || []).map((step: string) => `• ${step}`).join('\n')}\n\nBlocker ID: ${id}`,
      }],
    };
  }

  private async resolveBlocker(args: any) {
    const blocker = this.data.blockers.find(b => b.id === args.blocker_id);
    if (!blocker) {
      throw new Error(`Blocker not found: ${args.blocker_id}`);
    }

    blocker.status = 'resolved';
    blocker.resolution_summary = args.resolution_summary;
    this.saveData();

    return {
      content: [{
        type: 'text' as const,
        text: `✅ **BLOCKER RESOLVED**\n\n**${blocker.title}**\nResolution: ${args.resolution_summary}\n\nBlocker successfully resolved!`,
      }],
    };
  }

  private async logProgressMilestone(args: any) {
    const id = uuidv4();
    const timestamp = Date.now();

    const milestone: ProgressMilestone = {
      id,
      timestamp,
      milestone_type: args.milestone_type,
      title: args.title,
      description: args.description,
      completion_percentage: args.completion_percentage || 0,
      next_steps: args.next_steps || [],
    };

    this.data.progress_milestones.push(milestone);
    this.saveData();

    return {
      content: [{
        type: 'text' as const,
        text: `🎯 **MILESTONE LOGGED**\n\n**${args.title}**\nType: ${args.milestone_type}\nProgress: ${args.completion_percentage || 0}%\n\n${args.description}\n\n**Next Steps:**\n${(args.next_steps || []).map((step: string) => `• ${step}`).join('\n')}\n\nMilestone ID: ${id}`,
      }],
    };
  }

  private async getFullSessionContext(args: any = {}) {
    const includeConversation = args.include_conversation_history !== false;
    const includeTechnical = args.include_technical_discoveries !== false;
    const includeBlockers = args.include_active_blockers !== false;
    const maxTurns = args.max_conversation_turns || 50;

    let context = `🤖 **COMPLETE SESSION CONTEXT RESTORATION**\n\n`;

    // Current session metadata
    context += `**SESSION INFO:**\n`;
    context += `Session ID: ${this.data.session_metadata.current_session_id}\n`;
    context += `Started: ${new Date(this.data.session_metadata.session_start).toLocaleString()}\n`;
    context += `Last Activity: ${new Date(this.data.session_metadata.last_activity).toLocaleString()}\n\n`;

    // Recent conversation history
    if (includeConversation) {
      const recentTurns = this.data.conversation_turns
        .filter(turn => turn.session_id === this.data.session_metadata.current_session_id)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, maxTurns);

      context += `**RECENT CONVERSATION (${recentTurns.length} turns):**\n`;
      recentTurns.reverse().forEach((turn, i) => {
        context += `${i + 1}. [${turn.context_type}] User: ${turn.user_input.substring(0, 100)}...\n`;
        context += `   AI: ${turn.ai_response.substring(0, 100)}...\n`;
        if (turn.extracted_entities.decisions_made.length > 0) {
          context += `   Decisions: ${turn.extracted_entities.decisions_made.join(', ')}\n`;
        }
      });
      context += `\n`;
    }

    // Technical discoveries
    if (includeTechnical) {
      const recentDiscoveries = this.data.technical_discoveries
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 10);

      context += `**TECHNICAL DISCOVERIES (${recentDiscoveries.length}):**\n`;
      recentDiscoveries.forEach((discovery, i) => {
        context += `${i + 1}. [${discovery.impact_level}] ${discovery.title}\n`;
        context += `   ${discovery.description}\n`;
      });
      context += `\n`;
    }

    // Active blockers
    if (includeBlockers) {
      const activeBlockers = this.data.blockers
        .filter(b => b.status !== 'resolved')
        .sort((a, b) => b.timestamp - a.timestamp);

      context += `**ACTIVE BLOCKERS (${activeBlockers.length}):**\n`;
      activeBlockers.forEach((blocker, i) => {
        context += `${i + 1}. [${blocker.severity}] ${blocker.title}\n`;
        context += `   Status: ${blocker.status}\n`;
        context += `   ${blocker.description}\n`;
      });
      context += `\n`;
    }

    // Recent milestones
    const recentMilestones = this.data.progress_milestones
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);

    context += `**RECENT MILESTONES (${recentMilestones.length}):**\n`;
    recentMilestones.forEach((milestone, i) => {
      context += `${i + 1}. [${milestone.milestone_type}] ${milestone.title} (${milestone.completion_percentage}%)\n`;
    });

    return {
      content: [{
        type: 'text' as const,
        text: context,
      }],
    };
  }

  // Helper methods for auto-analysis
  private extractEntitiesFromConversation(userInput: string, aiResponse: string): {
    tasks_mentioned: string[];
    technologies_discussed: string[];
    decisions_made: string[];
    blockers_identified: string[];
  } {
    const combined = `${userInput} ${aiResponse}`.toLowerCase();

    // Simple keyword-based extraction (can be enhanced with NLP)
    const taskKeywords = ['implement', 'build', 'create', 'deploy', 'setup', 'configure', 'test', 'fix'];
    const techKeywords = ['stripe', 'mcp', 'server', 'api', 'webhook', 'payment', 'revbot', 'nodejs', 'typescript'];
    const decisionKeywords = ['decided', 'choose', 'selected', 'approved', 'skip', 'use', 'go with'];
    const blockerKeywords = ['error', 'failed', 'blocked', 'issue', 'problem', 'cannot', 'unable', 'stuck'];

    return {
      tasks_mentioned: this.extractKeywords(combined, taskKeywords),
      technologies_discussed: this.extractKeywords(combined, techKeywords),
      decisions_made: this.extractKeywords(combined, decisionKeywords),
      blockers_identified: this.extractKeywords(combined, blockerKeywords),
    };
  }

  private extractKeywords(text: string, keywords: string[]): string[] {
    return keywords.filter(keyword => text.includes(keyword));
  }

  private inferContextType(userInput: string, aiResponse: string): 'planning' | 'implementation' | 'debugging' | 'analysis' | 'decision' {
    const combined = `${userInput} ${aiResponse}`.toLowerCase();

    if (combined.includes('plan') || combined.includes('strategy') || combined.includes('roadmap')) {
      return 'planning';
    }
    if (combined.includes('build') || combined.includes('implement') || combined.includes('deploy')) {
      return 'implementation';
    }
    if (combined.includes('error') || combined.includes('debug') || combined.includes('fix')) {
      return 'debugging';
    }
    if (combined.includes('decide') || combined.includes('choose') || combined.includes('approve')) {
      return 'decision';
    }
    return 'analysis';
  }

  private calculateImportanceScore(userInput: string, aiResponse: string): number {
    const combined = `${userInput} ${aiResponse}`.toLowerCase();
    let score = 0.3; // Base score

    // Increase score for important keywords
    if (combined.includes('critical') || combined.includes('urgent')) score += 0.3;
    if (combined.includes('revenue') || combined.includes('payment') || combined.includes('money')) score += 0.2;
    if (combined.includes('decision') || combined.includes('approve')) score += 0.2;
    if (combined.includes('blocker') || combined.includes('error') || combined.includes('problem')) score += 0.2;
    if (combined.includes('complete') || combined.includes('finished') || combined.includes('done')) score += 0.1;

    return Math.min(score, 1.0); // Cap at 1.0
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('RevBot Memory Server started - 100% Autonomous persistent memory active');
    console.log('Auto-save enabled - Capturing all conversation context automatically');
  }

  async stop() {
    this.stopAutoSaveTimer();
    this.saveData(); // Final save
  }
}

const server = new RevBotMemoryServer();
server.start().catch(console.error);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down RevBot Memory Server...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down RevBot Memory Server...');
  await server.stop();
  process.exit(0);
});