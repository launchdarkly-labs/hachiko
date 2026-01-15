#!/usr/bin/env node

/**
 * Agent Connectivity Test Script
 * 
 * Tests connectivity and authentication for configured cloud agents
 * without executing any actual migrations.
 */

import { readFile } from 'fs/promises';
import yaml from 'js-yaml';
import { validateHachikoConfig } from '../dist/config/schema.js';
import { initializeAgents } from '../dist/adapters/registry.js';

const TEST_CONFIG = {
  policy: {
    allowWorkflowEdits: false,
    network: "restricted",
    maxAttemptsPerStep: 2,
    stepTimeoutMinutes: 30,
    perRepoMaxConcurrentMigrations: 1,
    riskyGlobs: [".github/workflows/**", "package.json"],
    allowlistGlobs: ["src/**", "test/**"]
  }
};

async function testAgentConnectivity() {
  console.log('🔧 Testing Agent Connectivity');
  console.log('===============================\n');

  try {
    // Load configuration locally
    console.log('📋 Loading Hachiko configuration...');
    const configContent = await readFile('.hachiko.yml', 'utf-8');
    const rawConfig = yaml.load(configContent);
    const config = validateHachikoConfig(rawConfig);
    console.log(`✅ Configuration loaded: ${Object.keys(config.agents || {}).length} agents configured\n`);

    // Test each configured agent
    const results = {};
    
    for (const [agentName, agentConfig] of Object.entries(config.agents || {})) {
      console.log(`🤖 Testing ${agentName} agent (${agentConfig.kind})...`);
      
      try {
        // Skip CLI agents and mock agents for connectivity testing  
        if (agentConfig.kind !== 'cloud') {
          console.log(`   ⏭️  Skipping ${agentConfig.kind} agent (not cloud-based)\n`);
          results[agentName] = { status: 'skipped', reason: 'Not a cloud agent' };
          continue;
        }

        // Initialize registry with config and get agent
        const registry = await initializeAgents(config);
        const agent = registry.getAdapter(agentName);
        
        // Test connectivity/validation
        const isValid = await agent.validate();
        
        if (isValid) {
          console.log(`   ✅ ${agentName}: Authentication successful`);
          console.log(`   📊 Config: ${JSON.stringify(agent.getConfig())}\n`);
          results[agentName] = { status: 'connected', config: agent.getConfig() };
        } else {
          console.log(`   ❌ ${agentName}: Authentication failed\n`);
          results[agentName] = { status: 'failed', reason: 'Authentication failed' };
        }
        
      } catch (error) {
        console.log(`   💥 ${agentName}: Error - ${error.message}\n`);
        results[agentName] = { status: 'error', error: error.message };
      }
    }

    // Summary
    console.log('📊 Connectivity Test Results');
    console.log('=============================');
    
    const connected = Object.entries(results).filter(([_, r]) => r.status === 'connected').length;
    const failed = Object.entries(results).filter(([_, r]) => r.status === 'failed').length;
    const errors = Object.entries(results).filter(([_, r]) => r.status === 'error').length;
    const skipped = Object.entries(results).filter(([_, r]) => r.status === 'skipped').length;
    
    Object.entries(results).forEach(([agent, result]) => {
      const icon = result.status === 'connected' ? '✅' : 
                   result.status === 'failed' ? '❌' : 
                   result.status === 'error' ? '💥' : '⏭️';
      
      const message = result.status === 'connected' ? 'CONNECTED' :
                     result.status === 'failed' ? `FAILED: ${result.reason}` :
                     result.status === 'error' ? `ERROR: ${result.error}` :
                     `SKIPPED: ${result.reason}`;
      
      console.log(`${icon} ${agent}: ${message}`);
    });
    
    console.log(`\n🎯 Summary: ${connected} connected, ${failed} failed, ${errors} errors, ${skipped} skipped`);
    
    if (connected > 0) {
      console.log('\n🎉 Ready for automated execution with connected agents!');
      console.log('\nNext steps:');
      console.log('1. Choose a safe migration to test');
      console.log('2. Update migration to use connected agent');  
      console.log('3. Run: pnpm migration update <id> --agent <agent-name>');
      console.log('4. Execute migration with real agent');
    } else {
      console.log('\n⚠️  No agents connected. Please check your environment variables:');
      console.log('- DEVIN_API_KEY (and optionally DEVIN_ORG_ID) for Devin');
      console.log('- CURSOR_API_KEY for Cursor (CURSOR_WEBHOOK_URL is optional)');
      console.log('- OPENAI_API_KEY for Codex');
    }
    
  } catch (error) {
    console.error('💥 Test script failed:', error);
    process.exit(1);
  }
}

// Run the test
testAgentConnectivity().catch(error => {
  console.error('💥 Script execution failed:', error);
  process.exit(1);
});