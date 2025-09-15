#!/usr/bin/env node

/**
 * RevBot Auto-Restore Script
 * Run this ONE command in any new Claude session to restore everything
 * Usage: node revbot-restore.js
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

class RevBotAutoRestore {
  async restore() {
    console.log('🤖 REVBOT AUTO-RESTORE\n');

    // Step 1: Check if services are running
    const serviceStatus = await this.checkServices();

    // Step 2: Load business state from persistent files
    const businessState = this.loadBusinessState();

    // Step 3: Generate current status report
    this.generateStatusReport(serviceStatus, businessState);

    // Step 4: Generate suggested actions for Claude
    this.generateClaudeActions(serviceStatus, businessState);
  }

  async checkServices() {
    console.log('🔍 Checking RevBot services...\n');

    const services = {
      qr_generator: { url: 'http://localhost:4001/health', status: 'unknown' },
      memory_server: { process: 'memory-server', status: 'unknown' },
      stripe_server: { process: 'stripe-server', status: 'unknown' }
    };

    // Check QR Generator
    try {
      const response = await fetch(services.qr_generator.url, { timeout: 2000 });
      if (response.ok) {
        const data = await response.json();
        services.qr_generator = {
          ...services.qr_generator,
          status: 'running',
          uptime: data.uptime,
          daily_revenue: data.daily_revenue,
          daily_generations: data.daily_generations
        };
        console.log(`✅ QR Generator: RUNNING (Revenue: $${(data.daily_revenue/100).toFixed(2)})`);
      }
    } catch (error) {
      services.qr_generator.status = 'stopped';
      console.log(`❌ QR Generator: STOPPED`);
    }

    // Check Memory Server (by process)
    try {
      const { execSync } = await import('child_process');
      const processes = execSync('tasklist /FI "IMAGENAME eq node.exe"', { encoding: 'utf8' });
      if (processes.includes('memory-server') || processes.includes('revbot')) {
        services.memory_server.status = 'running';
        console.log(`✅ Memory Server: RUNNING`);
      } else {
        services.memory_server.status = 'stopped';
        console.log(`❌ Memory Server: STOPPED`);
      }
    } catch (error) {
      services.memory_server.status = 'unknown';
      console.log(`⚠️ Memory Server: UNKNOWN (${error.message})`);
    }

    return services;
  }

  loadBusinessState() {
    console.log('\n💾 Loading persistent business state...\n');

    const dataPath = path.join(process.cwd(), 'mcp-servers', 'memory-server', 'data', 'revbot-data.json');

    if (fs.existsSync(dataPath)) {
      try {
        const rawData = fs.readFileSync(dataPath, 'utf8');
        const data = JSON.parse(rawData);

        console.log(`✅ Business state loaded:`);
        console.log(`   Services: ${data.services?.length || 0}`);
        console.log(`   Transactions: ${data.transactions?.length || 0}`);
        console.log(`   Decisions: ${data.decisions?.length || 0}`);
        console.log(`   Opportunities: ${data.market_opportunities?.length || 0}`);

        return data;
      } catch (error) {
        console.log(`❌ Failed to load business state: ${error.message}`);
      }
    } else {
      console.log(`⚠️ No business state found at ${dataPath}`);
    }

    return null;
  }

  generateStatusReport(serviceStatus, businessState) {
    console.log('\n📊 REVBOT STATUS REPORT\n');

    const isOperational = serviceStatus.qr_generator.status === 'running';

    console.log(`🚀 SYSTEM STATUS: ${isOperational ? '🟢 OPERATIONAL' : '🔴 NEEDS ATTENTION'}`);

    if (isOperational) {
      console.log(`💰 REVENUE TODAY: $${(serviceStatus.qr_generator.daily_revenue/100).toFixed(2)}`);
      console.log(`📊 TRANSACTIONS: ${serviceStatus.qr_generator.daily_generations}`);
      console.log(`⏱️ UPTIME: ${Math.round(serviceStatus.qr_generator.uptime/1000/60)} minutes`);
    }

    if (businessState) {
      const totalTransactions = businessState.transactions?.length || 0;
      const totalRevenue = businessState.transactions?.reduce((sum, t) => sum + t.amount, 0) || 0;

      console.log(`\n📈 LIFETIME STATS:`);
      console.log(`   Total Revenue: $${(totalRevenue/100).toFixed(2)}`);
      console.log(`   Total Transactions: ${totalTransactions}`);
      console.log(`   Active Services: ${businessState.services?.filter(s => s.status === 'active').length || 0}`);
    }
  }

  generateClaudeActions(serviceStatus, businessState) {
    console.log('\n🤖 CLAUDE ACTIONS (Copy these commands):\n');

    if (serviceStatus.qr_generator.status === 'running') {
      console.log('# RevBot is operational! Continue autonomous operations:');
      console.log('');
      console.log('# Check current analytics');
      console.log('curl http://localhost:4001/analytics');
      console.log('');
      console.log('# Next deployment suggestions:');

      if ((serviceStatus.qr_generator.daily_revenue || 0) > 1000) { // $10+
        console.log('# Revenue is strong - deploy URL shortener service');
        console.log('cd revbot-system && mkdir -p services/url-shortener');
      } else {
        console.log('# Revenue building - optimize QR service marketing');
        console.log('# Consider A/B testing pricing or adding features');
      }

    } else {
      console.log('# RevBot needs restart:');
      console.log('cd C:\\Users\\eoino\\revbot-system');
      console.log('cd mcp-servers/memory-server && npm start &');
      console.log('cd ../../services/qr-generator && npm start &');
      console.log('');
      console.log('# Then re-run this script to verify');
    }

    console.log('\n📝 REMEMBER: All RevBot state is preserved in MCP Memory Server');
    console.log('             Just tell Claude: "Run revbot-restore.js"');
  }
}

// Add fetch polyfill for Node.js
if (!globalThis.fetch) {
  const { default: fetch } = await import('node-fetch');
  globalThis.fetch = fetch;
}

// Run the restore process
const restorer = new RevBotAutoRestore();
await restorer.restore();