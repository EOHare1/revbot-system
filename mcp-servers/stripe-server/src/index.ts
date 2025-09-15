#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import express from 'express';
import cors from 'cors';

// Revenue service configurations for scaling
interface ServiceConfig {
  id: string;
  name: string;
  type: string;
  pricing_model: 'per_use' | 'subscription' | 'tiered';
  base_price: number;
  currency: string;
  webhook_url?: string;
  max_daily_revenue: number;
  auto_billing: boolean;
}

interface PaymentIntent {
  id: string;
  service_id: string;
  amount: number;
  currency: string;
  customer_id?: string;
  status: string;
  stripe_payment_intent_id: string;
  metadata: Record<string, any>;
  created_at: number;
}

interface Customer {
  id: string;
  stripe_customer_id: string;
  email: string;
  name?: string;
  services_used: string[];
  total_spent: number;
  created_at: number;
  last_payment: number;
}

interface Subscription {
  id: string;
  service_id: string;
  customer_id: string;
  stripe_subscription_id: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  amount: number;
  currency: string;
}

class RevBotStripeServer {
  private stripe: Stripe;
  private server: Server;
  private expressApp: express.Application = express();
  private webhookPort: number = 3001;

  // In-memory storage for this demo (would be replaced with database in production)
  private services: ServiceConfig[] = [];
  private paymentIntents: PaymentIntent[] = [];
  private customers: Customer[] = [];
  private subscriptions: Subscription[] = [];

  constructor() {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }

    this.stripe = new Stripe(stripeSecretKey);

    this.server = new Server(
      {
        name: 'revbot-stripe-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupExpressApp();
    this.setupHandlers();
  }

  private setupExpressApp() {
    this.expressApp.use(cors());

    // Stripe webhook endpoint (raw body needed for signature verification)
    this.expressApp.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
      this.handleStripeWebhook(req, res);
    });

    this.expressApp.use(express.json());
  }

  private async handleStripeWebhook(req: express.Request, res: express.Response) {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return res.status(400).send('Webhook secret not configured');
    }

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.log(`⚠️  Webhook signature verification failed.`, err);
      return res.status(400).send(`Webhook Error: ${err}`);
    }

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await this.handlePaymentSuccess(paymentIntent);
        break;
      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object as Stripe.PaymentIntent;
        await this.handlePaymentFailure(failedPayment);
        break;
      case 'invoice.payment_succeeded':
        const invoice = event.data.object as Stripe.Invoice;
        await this.handleSubscriptionPayment(invoice);
        break;
      case 'customer.subscription.deleted':
        const subscription = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionCancellation(subscription);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  }

  private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
    // Update local payment record
    const localPayment = this.paymentIntents.find(p => p.stripe_payment_intent_id === paymentIntent.id);
    if (localPayment) {
      localPayment.status = 'succeeded';
    }

    // Notify RevBot Memory Server of successful transaction
    console.log(`💰 Payment succeeded: $${(paymentIntent.amount / 100).toFixed(2)} for service ${paymentIntent.metadata.service_id}`);
  }

  private async handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
    const localPayment = this.paymentIntents.find(p => p.stripe_payment_intent_id === paymentIntent.id);
    if (localPayment) {
      localPayment.status = 'failed';
    }

    console.log(`❌ Payment failed: ${paymentIntent.id} for service ${paymentIntent.metadata.service_id}`);
  }

  private async handleSubscriptionPayment(invoice: Stripe.Invoice) {
    console.log(`🔄 Subscription payment succeeded: $${(invoice.amount_paid / 100).toFixed(2)}`);
  }

  private async handleSubscriptionCancellation(subscription: Stripe.Subscription) {
    const localSub = this.subscriptions.find(s => s.stripe_subscription_id === subscription.id);
    if (localSub) {
      localSub.status = 'cancelled';
    }

    console.log(`❌ Subscription cancelled: ${subscription.id}`);
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Service configuration
        {
          name: 'register_payment_service',
          description: 'Register a new revenue service with Stripe integration',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Service name' },
              type: { type: 'string', description: 'Service type (api, subscription, etc.)' },
              pricing_model: { type: 'string', enum: ['per_use', 'subscription', 'tiered'] },
              base_price: { type: 'number', description: 'Base price in cents' },
              currency: { type: 'string', default: 'usd' },
              max_daily_revenue: { type: 'number', default: 10000 },
              auto_billing: { type: 'boolean', default: true },
            },
            required: ['name', 'type', 'pricing_model', 'base_price'],
          },
        },

        // Customer management
        {
          name: 'create_customer',
          description: 'Create a new Stripe customer for RevBot services',
          inputSchema: {
            type: 'object',
            properties: {
              email: { type: 'string', format: 'email' },
              name: { type: 'string' },
              metadata: { type: 'object' },
            },
            required: ['email'],
          },
        },
        {
          name: 'get_customer',
          description: 'Retrieve customer information and payment history',
          inputSchema: {
            type: 'object',
            properties: {
              customer_id: { type: 'string' },
              email: { type: 'string', format: 'email' },
            },
          },
        },

        // Payment processing
        {
          name: 'create_payment_intent',
          description: 'Create a payment intent for a service transaction',
          inputSchema: {
            type: 'object',
            properties: {
              service_id: { type: 'string' },
              amount: { type: 'number', description: 'Amount in cents' },
              currency: { type: 'string', default: 'usd' },
              customer_id: { type: 'string' },
              description: { type: 'string' },
              metadata: { type: 'object' },
            },
            required: ['service_id', 'amount'],
          },
        },
        {
          name: 'confirm_payment',
          description: 'Confirm a payment intent for immediate processing',
          inputSchema: {
            type: 'object',
            properties: {
              payment_intent_id: { type: 'string' },
              payment_method_id: { type: 'string' },
            },
            required: ['payment_intent_id', 'payment_method_id'],
          },
        },

        // Subscription management
        {
          name: 'create_subscription',
          description: 'Create a subscription for recurring service billing',
          inputSchema: {
            type: 'object',
            properties: {
              service_id: { type: 'string' },
              customer_id: { type: 'string' },
              price_id: { type: 'string' },
              trial_period_days: { type: 'number', default: 0 },
            },
            required: ['service_id', 'customer_id', 'price_id'],
          },
        },
        {
          name: 'cancel_subscription',
          description: 'Cancel a customer subscription',
          inputSchema: {
            type: 'object',
            properties: {
              subscription_id: { type: 'string' },
              at_period_end: { type: 'boolean', default: true },
            },
            required: ['subscription_id'],
          },
        },

        // Revenue analytics
        {
          name: 'get_revenue_metrics',
          description: 'Get comprehensive revenue metrics from Stripe',
          inputSchema: {
            type: 'object',
            properties: {
              service_id: { type: 'string' },
              timeframe_days: { type: 'number', default: 30 },
              include_refunds: { type: 'boolean', default: false },
            },
          },
        },
        {
          name: 'get_payment_analytics',
          description: 'Get detailed payment analytics and trends',
          inputSchema: {
            type: 'object',
            properties: {
              timeframe_days: { type: 'number', default: 30 },
              group_by: { type: 'string', enum: ['day', 'week', 'month'], default: 'day' },
            },
          },
        },

        // Refunds and disputes
        {
          name: 'create_refund',
          description: 'Process a refund for a payment',
          inputSchema: {
            type: 'object',
            properties: {
              payment_intent_id: { type: 'string' },
              amount: { type: 'number', description: 'Refund amount in cents (optional - full refund if not specified)' },
              reason: { type: 'string', enum: ['duplicate', 'fraudulent', 'requested_by_customer'] },
              metadata: { type: 'object' },
            },
            required: ['payment_intent_id'],
          },
        },

        // Pricing and products
        {
          name: 'create_price',
          description: 'Create a new price for a service (for subscriptions)',
          inputSchema: {
            type: 'object',
            properties: {
              service_id: { type: 'string' },
              amount: { type: 'number', description: 'Amount in cents' },
              currency: { type: 'string', default: 'usd' },
              interval: { type: 'string', enum: ['day', 'week', 'month', 'year'] },
              interval_count: { type: 'number', default: 1 },
            },
            required: ['service_id', 'amount', 'interval'],
          },
        },

        // Service management
        {
          name: 'get_service_performance',
          description: 'Get performance metrics for a specific service',
          inputSchema: {
            type: 'object',
            properties: {
              service_id: { type: 'string' },
              timeframe_days: { type: 'number', default: 7 },
            },
            required: ['service_id'],
          },
        },
        {
          name: 'update_service_limits',
          description: 'Update daily revenue limits and auto-billing settings',
          inputSchema: {
            type: 'object',
            properties: {
              service_id: { type: 'string' },
              max_daily_revenue: { type: 'number' },
              auto_billing: { type: 'boolean' },
              pricing_adjustments: { type: 'object' },
            },
            required: ['service_id'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'register_payment_service':
            return await this.registerPaymentService(args);
          case 'create_customer':
            return await this.createCustomer(args);
          case 'get_customer':
            return await this.getCustomer(args);
          case 'create_payment_intent':
            return await this.createPaymentIntent(args);
          case 'confirm_payment':
            return await this.confirmPayment(args);
          case 'create_subscription':
            return await this.createSubscription(args);
          case 'cancel_subscription':
            return await this.cancelSubscription(args);
          case 'get_revenue_metrics':
            return await this.getRevenueMetrics(args);
          case 'get_payment_analytics':
            return await this.getPaymentAnalytics(args);
          case 'create_refund':
            return await this.createRefund(args);
          case 'create_price':
            return await this.createPrice(args);
          case 'get_service_performance':
            return await this.getServicePerformance(args);
          case 'update_service_limits':
            return await this.updateServiceLimits(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        throw new McpError(ErrorCode.InternalError, `Stripe operation failed: ${errorMessage}`);
      }
    });
  }

  // Service configuration methods
  private async registerPaymentService(args: any) {
    const serviceId = uuidv4();

    // Create Stripe product
    const product = await this.stripe.products.create({
      name: args.name,
      type: 'service',
      metadata: {
        revbot_service_id: serviceId,
        service_type: args.type,
      },
    });

    // Create service configuration
    const serviceConfig: ServiceConfig = {
      id: serviceId,
      name: args.name,
      type: args.type,
      pricing_model: args.pricing_model,
      base_price: args.base_price,
      currency: args.currency || 'usd',
      max_daily_revenue: args.max_daily_revenue || 10000,
      auto_billing: args.auto_billing !== false,
    };

    this.services.push(serviceConfig);

    return {
      content: [{
        type: 'text' as const,
        text: `💳 **PAYMENT SERVICE REGISTERED**

**${args.name}** (${args.type})
Service ID: ${serviceId}
Stripe Product ID: ${product.id}
Pricing: ${args.pricing_model} - $${(args.base_price / 100).toFixed(2)}
Max Daily Revenue: $${(args.max_daily_revenue / 100 || 100).toFixed(2)}
Auto-billing: ${args.auto_billing !== false ? 'Enabled' : 'Disabled'}

Service is ready to accept payments!`,
      }],
    };
  }

  // Customer management methods
  private async createCustomer(args: any) {
    const stripeCustomer = await this.stripe.customers.create({
      email: args.email,
      name: args.name,
      metadata: {
        revbot_customer: 'true',
        ...args.metadata,
      },
    });

    const customer: Customer = {
      id: uuidv4(),
      stripe_customer_id: stripeCustomer.id,
      email: args.email,
      name: args.name,
      services_used: [],
      total_spent: 0,
      created_at: Date.now(),
      last_payment: 0,
    };

    this.customers.push(customer);

    return {
      content: [{
        type: 'text' as const,
        text: `👤 **CUSTOMER CREATED**

Email: ${args.email}
Name: ${args.name || 'Not provided'}
Customer ID: ${customer.id}
Stripe Customer ID: ${stripeCustomer.id}

Ready to process payments for this customer.`,
      }],
    };
  }

  private async getCustomer(args: any) {
    let customer: Customer | undefined;

    if (args.customer_id) {
      customer = this.customers.find(c => c.id === args.customer_id);
    } else if (args.email) {
      customer = this.customers.find(c => c.email === args.email);
    }

    if (!customer) {
      throw new Error('Customer not found');
    }

    // Get recent payments
    const recentPayments = this.paymentIntents
      .filter(p => p.customer_id === customer?.id)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 5);

    return {
      content: [{
        type: 'text' as const,
        text: `👤 **CUSTOMER DETAILS**

**${customer.name || customer.email}**
Email: ${customer.email}
Customer ID: ${customer.id}
Total Spent: $${(customer.total_spent / 100).toFixed(2)}
Services Used: ${customer.services_used.length}
Member Since: ${new Date(customer.created_at).toLocaleDateString()}
Last Payment: ${customer.last_payment ? new Date(customer.last_payment).toLocaleDateString() : 'Never'}

**RECENT PAYMENTS:**
${recentPayments.map(p => `• $${(p.amount / 100).toFixed(2)} - ${p.status} - ${new Date(p.created_at).toLocaleDateString()}`).join('\n') || 'No recent payments'}`,
      }],
    };
  }

  // Payment processing methods
  private async createPaymentIntent(args: any) {
    const service = this.services.find(s => s.id === args.service_id);
    if (!service) {
      throw new Error('Service not found');
    }

    const stripePaymentIntent = await this.stripe.paymentIntents.create({
      amount: args.amount,
      currency: args.currency || 'usd',
      customer: args.customer_id ? this.customers.find(c => c.id === args.customer_id)?.stripe_customer_id : undefined,
      description: args.description || `Payment for ${service.name}`,
      metadata: {
        revbot_service_id: args.service_id,
        revbot_customer_id: args.customer_id || '',
        ...args.metadata,
      },
    });

    const paymentIntent: PaymentIntent = {
      id: uuidv4(),
      service_id: args.service_id,
      amount: args.amount,
      currency: args.currency || 'usd',
      customer_id: args.customer_id,
      status: stripePaymentIntent.status,
      stripe_payment_intent_id: stripePaymentIntent.id,
      metadata: args.metadata || {},
      created_at: Date.now(),
    };

    this.paymentIntents.push(paymentIntent);

    return {
      content: [{
        type: 'text' as const,
        text: `💳 **PAYMENT INTENT CREATED**

Service: ${service.name}
Amount: $${(args.amount / 100).toFixed(2)} ${args.currency || 'USD'}
Status: ${stripePaymentIntent.status}
Payment Intent ID: ${paymentIntent.id}
Stripe PI ID: ${stripePaymentIntent.id}
Client Secret: ${stripePaymentIntent.client_secret}

Use client secret to complete payment on frontend.`,
      }],
    };
  }

  private async confirmPayment(args: any) {
    const paymentIntent = this.paymentIntents.find(p => p.id === args.payment_intent_id);
    if (!paymentIntent) {
      throw new Error('Payment intent not found');
    }

    const confirmedPI = await this.stripe.paymentIntents.confirm(paymentIntent.stripe_payment_intent_id, {
      payment_method: args.payment_method_id,
    });

    paymentIntent.status = confirmedPI.status;

    return {
      content: [{
        type: 'text' as const,
        text: `✅ **PAYMENT CONFIRMED**

Payment Intent: ${args.payment_intent_id}
Status: ${confirmedPI.status}
Amount: $${(paymentIntent.amount / 100).toFixed(2)}

${confirmedPI.status === 'succeeded' ? 'Payment completed successfully!' : 'Payment processing...'}`,
      }],
    };
  }

  // Subscription methods
  private async createSubscription(args: any) {
    const service = this.services.find(s => s.id === args.service_id);
    const customer = this.customers.find(c => c.id === args.customer_id);

    if (!service || !customer) {
      throw new Error('Service or customer not found');
    }

    const stripeSubscription = await this.stripe.subscriptions.create({
      customer: customer.stripe_customer_id,
      items: [{
        price: args.price_id,
      }],
      trial_period_days: args.trial_period_days || 0,
      metadata: {
        revbot_service_id: args.service_id,
        revbot_customer_id: args.customer_id,
      },
    });

    const subscription: Subscription = {
      id: uuidv4(),
      service_id: args.service_id,
      customer_id: args.customer_id,
      stripe_subscription_id: stripeSubscription.id,
      status: stripeSubscription.status,
      current_period_start: stripeSubscription.current_period_start * 1000,
      current_period_end: stripeSubscription.current_period_end * 1000,
      amount: stripeSubscription.items.data[0].price.unit_amount || 0,
      currency: stripeSubscription.items.data[0].price.currency,
    };

    this.subscriptions.push(subscription);

    return {
      content: [{
        type: 'text' as const,
        text: `🔄 **SUBSCRIPTION CREATED**

Service: ${service.name}
Customer: ${customer.email}
Amount: $${(subscription.amount / 100).toFixed(2)}/${stripeSubscription.items.data[0].price.recurring?.interval}
Status: ${stripeSubscription.status}
Trial Period: ${args.trial_period_days || 0} days
Subscription ID: ${subscription.id}

Recurring billing is now active!`,
      }],
    };
  }

  private async cancelSubscription(args: any) {
    const subscription = this.subscriptions.find(s => s.id === args.subscription_id);
    if (!subscription) {
      throw new Error('Subscription not found');
    }

    const cancelledSub = await this.stripe.subscriptions.update(subscription.stripe_subscription_id, {
      cancel_at_period_end: args.at_period_end,
    });

    if (!args.at_period_end) {
      await this.stripe.subscriptions.cancel(subscription.stripe_subscription_id);
    }

    subscription.status = cancelledSub.status;

    return {
      content: [{
        type: 'text' as const,
        text: `❌ **SUBSCRIPTION CANCELLED**

Subscription ID: ${args.subscription_id}
Status: ${cancelledSub.status}
${args.at_period_end ? 'Will cancel at period end' : 'Cancelled immediately'}

Customer will no longer be billed for this service.`,
      }],
    };
  }

  // Analytics methods
  private async getRevenueMetrics(args: any = {}) {
    const timeframeDays = args.timeframe_days || 30;
    const cutoffTime = Date.now() - (timeframeDays * 24 * 60 * 60 * 1000);

    let payments = this.paymentIntents.filter(p =>
      p.created_at >= cutoffTime && p.status === 'succeeded'
    );

    if (args.service_id) {
      payments = payments.filter(p => p.service_id === args.service_id);
    }

    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    const totalTransactions = payments.length;
    const averageTransaction = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    // Get Stripe balance to show actual revenue
    const balance = await this.stripe.balance.retrieve();
    const availableBalance = balance.available.reduce((sum, b) => sum + b.amount, 0);
    const pendingBalance = balance.pending.reduce((sum, b) => sum + b.amount, 0);

    return {
      content: [{
        type: 'text' as const,
        text: `💰 **REVENUE METRICS** (Last ${timeframeDays} days)

**TRANSACTION SUMMARY:**
💵 Total Revenue: $${(totalRevenue / 100).toFixed(2)}
📊 Total Transactions: ${totalTransactions}
📈 Average Transaction: $${(averageTransaction / 100).toFixed(2)}
📅 Daily Average: $${(totalRevenue / timeframeDays / 100).toFixed(2)}

**STRIPE BALANCE:**
✅ Available: $${(availableBalance / 100).toFixed(2)}
⏳ Pending: $${(pendingBalance / 100).toFixed(2)}
💎 Total Balance: $${((availableBalance + pendingBalance) / 100).toFixed(2)}

**SERVICE BREAKDOWN:**
${this.services.map(s => {
  const servicePayments = payments.filter(p => p.service_id === s.id);
  const serviceRevenue = servicePayments.reduce((sum, p) => sum + p.amount, 0);
  return `• ${s.name}: $${(serviceRevenue / 100).toFixed(2)} (${servicePayments.length} transactions)`;
}).join('\n') || 'No services with revenue yet'}`,
      }],
    };
  }

  private async getPaymentAnalytics(args: any = {}) {
    const timeframeDays = args.timeframe_days || 30;
    const cutoffTime = Date.now() - (timeframeDays * 24 * 60 * 60 * 1000);

    const payments = this.paymentIntents.filter(p => p.created_at >= cutoffTime);
    const successfulPayments = payments.filter(p => p.status === 'succeeded');
    const failedPayments = payments.filter(p => p.status === 'failed');

    const successRate = payments.length > 0 ? (successfulPayments.length / payments.length) * 100 : 0;

    // Group by time period
    const groupedData = new Map<string, { revenue: number, count: number }>();

    successfulPayments.forEach(payment => {
      let key: string;
      const date = new Date(payment.created_at);

      switch (args.group_by) {
        case 'week':
          key = `Week ${Math.ceil(date.getDate() / 7)}`;
          break;
        case 'month':
          key = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
          break;
        default:
          key = date.toLocaleDateString();
      }

      if (!groupedData.has(key)) {
        groupedData.set(key, { revenue: 0, count: 0 });
      }

      const data = groupedData.get(key)!;
      data.revenue += payment.amount;
      data.count += 1;
    });

    return {
      content: [{
        type: 'text' as const,
        text: `📊 **PAYMENT ANALYTICS** (Last ${timeframeDays} days)

**PERFORMANCE METRICS:**
✅ Success Rate: ${successRate.toFixed(1)}%
📈 Successful Payments: ${successfulPayments.length}
❌ Failed Payments: ${failedPayments.length}
💳 Total Attempts: ${payments.length}

**REVENUE TREND (${args.group_by || 'daily'}):**
${Array.from(groupedData.entries())
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([period, data]) => `${period}: $${(data.revenue / 100).toFixed(2)} (${data.count} transactions)`)
  .join('\n') || 'No revenue data available'}

**CUSTOMER INSIGHTS:**
👥 Unique Customers: ${new Set(successfulPayments.map(p => p.customer_id).filter(Boolean)).size}
🔄 Repeat Customer Rate: ${this.calculateRepeatCustomerRate().toFixed(1)}%
💰 Average Customer Value: $${this.calculateAverageCustomerValue().toFixed(2)}`,
      }],
    };
  }

  private calculateRepeatCustomerRate(): number {
    const customerPaymentCounts = new Map<string, number>();

    this.paymentIntents
      .filter(p => p.status === 'succeeded' && p.customer_id)
      .forEach(p => {
        const count = customerPaymentCounts.get(p.customer_id!) || 0;
        customerPaymentCounts.set(p.customer_id!, count + 1);
      });

    const totalCustomers = customerPaymentCounts.size;
    const repeatCustomers = Array.from(customerPaymentCounts.values()).filter(count => count > 1).length;

    return totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;
  }

  private calculateAverageCustomerValue(): number {
    const customerTotals = new Map<string, number>();

    this.paymentIntents
      .filter(p => p.status === 'succeeded' && p.customer_id)
      .forEach(p => {
        const total = customerTotals.get(p.customer_id!) || 0;
        customerTotals.set(p.customer_id!, total + p.amount);
      });

    const values = Array.from(customerTotals.values());
    const totalValue = values.reduce((sum, value) => sum + value, 0);

    return values.length > 0 ? (totalValue / values.length / 100) : 0;
  }

  // Additional service methods
  private async createRefund(args: any) {
    const paymentIntent = this.paymentIntents.find(p => p.id === args.payment_intent_id);
    if (!paymentIntent) {
      throw new Error('Payment intent not found');
    }

    const refund = await this.stripe.refunds.create({
      payment_intent: paymentIntent.stripe_payment_intent_id,
      amount: args.amount,
      reason: args.reason,
      metadata: args.metadata,
    });

    return {
      content: [{
        type: 'text' as const,
        text: `💸 **REFUND PROCESSED**

Refund ID: ${refund.id}
Amount: $${(refund.amount / 100).toFixed(2)}
Reason: ${args.reason || 'Not specified'}
Status: ${refund.status}

Refund will appear in customer's account within 5-10 business days.`,
      }],
    };
  }

  private async createPrice(args: any) {
    const service = this.services.find(s => s.id === args.service_id);
    if (!service) {
      throw new Error('Service not found');
    }

    // Find or create Stripe product for this service
    const products = await this.stripe.products.list({
      limit: 100,
      expand: ['data.default_price'],
    });

    let product = products.data.find(p => p.metadata.revbot_service_id === args.service_id);

    if (!product) {
      product = await this.stripe.products.create({
        name: service.name,
        metadata: { revbot_service_id: args.service_id },
      });
    }

    const price = await this.stripe.prices.create({
      unit_amount: args.amount,
      currency: args.currency || 'usd',
      recurring: {
        interval: args.interval,
        interval_count: args.interval_count || 1,
      },
      product: product.id,
    });

    return {
      content: [{
        type: 'text' as const,
        text: `💎 **PRICE CREATED**

Service: ${service.name}
Amount: $${(args.amount / 100).toFixed(2)}/${args.interval}
Price ID: ${price.id}
Currency: ${args.currency || 'USD'}

Price is ready for subscription creation.`,
      }],
    };
  }

  private async getServicePerformance(args: any) {
    const service = this.services.find(s => s.id === args.service_id);
    if (!service) {
      throw new Error('Service not found');
    }

    const timeframeDays = args.timeframe_days || 7;
    const cutoffTime = Date.now() - (timeframeDays * 24 * 60 * 60 * 1000);

    const servicePayments = this.paymentIntents.filter(p =>
      p.service_id === args.service_id && p.created_at >= cutoffTime
    );

    const successfulPayments = servicePayments.filter(p => p.status === 'succeeded');
    const totalRevenue = successfulPayments.reduce((sum, p) => sum + p.amount, 0);
    const successRate = servicePayments.length > 0 ? (successfulPayments.length / servicePayments.length) * 100 : 0;

    return {
      content: [{
        type: 'text' as const,
        text: `📈 **SERVICE PERFORMANCE** - ${service.name}

**REVENUE METRICS (Last ${timeframeDays} days):**
💰 Total Revenue: $${(totalRevenue / 100).toFixed(2)}
📊 Successful Transactions: ${successfulPayments.length}
📈 Success Rate: ${successRate.toFixed(1)}%
📅 Daily Average: $${(totalRevenue / timeframeDays / 100).toFixed(2)}

**SERVICE CONFIGURATION:**
💵 Base Price: $${(service.base_price / 100).toFixed(2)}
🎯 Pricing Model: ${service.pricing_model}
🏦 Max Daily Revenue: $${(service.max_daily_revenue / 100).toFixed(2)}
⚡ Auto-billing: ${service.auto_billing ? 'Enabled' : 'Disabled'}

**PERFORMANCE ASSESSMENT:**
${this.generateServiceRecommendations(service, totalRevenue, successRate, timeframeDays)}`,
      }],
    };
  }

  private generateServiceRecommendations(service: ServiceConfig, totalRevenue: number, successRate: number, timeframeDays: number): string {
    const dailyRevenue = totalRevenue / timeframeDays / 100;
    let recommendations = '';

    if (dailyRevenue < 1) {
      recommendations += '🔴 Low revenue - consider marketing boost or pricing adjustment\n';
    } else if (dailyRevenue > 50) {
      recommendations += '🟢 Strong performance - consider scaling or premium features\n';
    }

    if (successRate < 80) {
      recommendations += '⚠️ Payment success rate below 80% - check payment flow\n';
    } else if (successRate > 95) {
      recommendations += '✅ Excellent payment success rate\n';
    }

    if (dailyRevenue * 30 > service.max_daily_revenue * 0.8) {
      recommendations += '📈 Approaching daily revenue limit - consider increasing cap\n';
    }

    return recommendations || '🎯 Service performing within normal parameters';
  }

  private async updateServiceLimits(args: any) {
    const service = this.services.find(s => s.id === args.service_id);
    if (!service) {
      throw new Error('Service not found');
    }

    if (args.max_daily_revenue !== undefined) {
      service.max_daily_revenue = args.max_daily_revenue;
    }
    if (args.auto_billing !== undefined) {
      service.auto_billing = args.auto_billing;
    }

    return {
      content: [{
        type: 'text' as const,
        text: `⚙️ **SERVICE LIMITS UPDATED**

Service: ${service.name}
Max Daily Revenue: $${(service.max_daily_revenue / 100).toFixed(2)}
Auto-billing: ${service.auto_billing ? 'Enabled' : 'Disabled'}

Updated limits are now in effect.`,
      }],
    };
  }

  async start() {
    // Start webhook server
    this.expressApp.listen(this.webhookPort, () => {
      console.log(`RevBot Stripe webhook server running on port ${this.webhookPort}`);
    });

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('RevBot Stripe Server started - Payment processing active');
  }
}

const server = new RevBotStripeServer();
server.start().catch(console.error);