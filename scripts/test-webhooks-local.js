#!/usr/bin/env node
/**
 * Local webhook testing server for GitHub Actions workflows
 * Simulates GitHub webhook events to test Hachiko locally
 */

import { createServer } from 'http';
import { exec } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const PORT = 3000;
const WEBHOOK_ENDPOINT = '/webhooks/github';

// Sample payloads for testing
const samplePayloads = {
  issueEdit: {
    action: 'edited',
    issue: {
      number: 123,
      title: '📊 Hachiko Migration Dashboard',
      body: `# 📊 Hachiko Migration Dashboard

This issue tracks all active migrations in the repository. Use the checkboxes below to control migration execution.

## 🟡 Pending Migrations

- [x] \`react-hooks-conversion\` - Convert class components to hooks
- [ ] \`typescript-strict-mode\` - Enable TypeScript strict mode

## 🔄 In-Progress Migrations

✨ *No active migrations*

## ⏸️ Paused Migrations

- [x] \`legacy-api-cleanup\` - Remove deprecated API calls

---

**How to use:**
- ✅ Check a box next to a pending migration to start it
- ✅ Check a box next to a paused migration to resume it
- ❌ Closing a Hachiko PR will pause the migration
- 🔄 This dashboard updates automatically as migrations progress

🤖 *Managed by Hachiko - Do not edit the sections above manually*`,
      labels: [{ name: 'hachiko:migration-dashboard' }]
    },
    repository: {
      name: 'test-repo',
      owner: { login: 'test-org' },
      default_branch: 'main'
    },
    sender: { login: 'test-user' }
  },

  prOpened: {
    action: 'opened',
    pull_request: {
      number: 456,
      title: '🔄 Migration: Convert React class components to hooks (Step 1/3)',
      head: { ref: 'hachiko/react-hooks-conversion-step-1' },
      labels: [{ name: 'hachiko:migration' }]
    },
    repository: {
      name: 'test-repo',
      owner: { login: 'test-org' }
    }
  },

  prClosed: {
    action: 'closed',
    pull_request: {
      number: 456,
      title: '🔄 Migration: Convert React class components to hooks (Step 1/3)',
      head: { ref: 'hachiko/react-hooks-conversion-step-1' },
      merged: true,
      labels: [{ name: 'hachiko:migration' }]
    },
    repository: {
      name: 'test-repo',
      owner: { login: 'test-org' }
    }
  }
};

function createTestMigrations() {
  const migrationsDir = 'migrations';
  if (!existsSync(migrationsDir)) {
    exec('mkdir -p migrations');
  }

  const sampleMigration = `---
id: react-hooks-conversion
title: Convert React class components to hooks
agent: cursor
status: pending
current_step: 1
total_steps: 3
created: 2024-01-20T10:00:00Z
last_updated: 2024-01-20T10:00:00Z
---

# Convert React class components to hooks

This migration converts React class components to functional components using hooks.

## Steps

1. Identify class components with state
2. Convert state to useState hooks
3. Convert lifecycle methods to useEffect
`;

  if (!existsSync('migrations/react-hooks-conversion.md')) {
    require('fs').writeFileSync('migrations/react-hooks-conversion.md', sampleMigration);
  }
}

function simulateWorkflow(eventName, payload) {
  console.log(`\n🚀 Simulating ${eventName} event...`);
  console.log('📋 Payload:', JSON.stringify(payload, null, 2));

  // Test the CLI migration dashboard generation
  if (eventName === 'issues' && payload.action === 'edited') {
    console.log('\n📊 Testing migration dashboard generation...');
    exec('pnpm migration generate-migration-dashboard', (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Dashboard generation failed:', error);
        return;
      }
      console.log('✅ Generated dashboard:');
      console.log(stdout);
    });

    // Parse checked migrations
    const body = payload.issue.body;
    const checkedPending = [];
    const checkedPaused = [];
    
    const pendingSection = body.match(/## 🟡 Pending Migrations(.*?)## 🔄 In-Progress Migrations/s);
    const pausedSection = body.match(/## ⏸️ Paused Migrations(.*?)---/s);
    
    if (pendingSection) {
      const checked = pendingSection[1].match(/- \[x\] `([^`]+)`/g);
      if (checked) {
        checked.forEach(match => {
          const migrationId = match.match(/`([^`]+)`/)[1];
          checkedPending.push(migrationId);
        });
      }
    }
    
    if (pausedSection) {
      const checked = pausedSection[1].match(/- \[x\] `([^`]+)`/g);
      if (checked) {
        checked.forEach(match => {
          const migrationId = match.match(/`([^`]+)`/)[1];
          checkedPaused.push(migrationId);
        });
      }
    }

    console.log('\n🎯 Detected checked migrations:');
    console.log('  Pending:', checkedPending);
    console.log('  Paused:', checkedPaused);

    // Simulate triggering execute-migration workflow
    [...checkedPending, ...checkedPaused].forEach(migrationId => {
      console.log(`\n⚡ Would trigger: gh workflow run execute-migration.yml -f migration_id="${migrationId}" -f step_id="1"`);
    });
  }

  // Test PR handling
  if (eventName === 'pull_request') {
    const { action, pull_request } = payload;
    const branch = pull_request.head.ref;
    
    console.log(`\n🔀 PR ${action}: ${pull_request.title}`);
    console.log(`📦 Branch: ${branch}`);
    
    if (branch.startsWith('hachiko/')) {
      console.log('✅ Detected Hachiko migration branch');
      
      if (action === 'closed') {
        if (pull_request.merged) {
          console.log('✅ PR merged - would advance migration');
        } else {
          console.log('⏸️ PR closed without merge - would pause migration');
        }
      }
    } else {
      console.log('ℹ️ Not a Hachiko migration branch');
    }
  }
}

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === WEBHOOK_ENDPOINT) {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const eventName = req.headers['x-github-event'];
        
        simulateWorkflow(eventName, payload);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'processed' }));
      } catch (error) {
        console.error('❌ Error processing webhook:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  } else if (req.method === 'GET' && req.url === '/test') {
    // Test endpoint for manual testing
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <head><title>Hachiko Webhook Tester</title></head>
        <body>
          <h1>Hachiko Local Webhook Tester</h1>
          <div>
            <h3>Test Issue Edit (Checkbox Toggle)</h3>
            <button onclick="testIssueEdit()">Test Issue Edit</button>
          </div>
          <div>
            <h3>Test PR Events</h3>
            <button onclick="testPROpened()">Test PR Opened</button>
            <button onclick="testPRClosed()">Test PR Closed</button>
          </div>
          <div>
            <h3>Logs</h3>
            <pre id="logs"></pre>
          </div>
          
          <script>
            function testIssueEdit() {
              fetch('/webhooks/github', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-GitHub-Event': 'issues'
                },
                body: JSON.stringify(${JSON.stringify(samplePayloads.issueEdit)})
              }).then(() => addLog('✅ Issue edit test sent'));
            }
            
            function testPROpened() {
              fetch('/webhooks/github', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-GitHub-Event': 'pull_request'
                },
                body: JSON.stringify(${JSON.stringify(samplePayloads.prOpened)})
              }).then(() => addLog('✅ PR opened test sent'));
            }
            
            function testPRClosed() {
              fetch('/webhooks/github', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-GitHub-Event': 'pull_request'
                },
                body: JSON.stringify(${JSON.stringify(samplePayloads.prClosed)})
              }).then(() => addLog('✅ PR closed test sent'));
            }
            
            function addLog(message) {
              document.getElementById('logs').textContent += message + '\\n';
            }
          </script>
        </body>
      </html>
    `);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

// Create test migrations and start server
createTestMigrations();

server.listen(PORT, () => {
  console.log(`🚀 Hachiko webhook test server running on http://localhost:${PORT}`);
  console.log(`📊 Test interface: http://localhost:${PORT}/test`);
  console.log('🪝 Webhook endpoint:', `http://localhost:${PORT}${WEBHOOK_ENDPOINT}`);
  console.log('\n🧪 Available tests:');
  console.log('  - Issue edit (checkbox toggle)');
  console.log('  - PR opened/closed events');
  console.log('\n⚡ Quick CLI tests:');
  console.log('  pnpm migration list');
  console.log('  pnpm migration generate-migration-dashboard');
});