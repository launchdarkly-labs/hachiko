#!/usr/bin/env node

/**
 * Test script to simulate the webhook that should have been sent when 
 * migration plans were merged to main branch.
 * 
 * Usage: node scripts/test-migration-detection.js
 */

import { handlePush } from '../dist/webhooks/push.js';
import { createLogger } from '../dist/utils/logger.js';
import { readFileSync } from 'fs';

// Mock context that simulates the push to main that occurred when we merged
const mockContext = {
  id: 'test-self-testing-123',
  payload: {
    repository: {
      name: 'hachiko',
      full_name: 'launchdarkly-labs/hachiko',
      owner: { login: 'launchdarkly-labs' },
      default_branch: 'main'
    },
    ref: 'refs/heads/main',
    commits: [{
      id: '70c0d75',
      message: 'Add comprehensive self-testing environment for Hachiko migrations',
      added: [
        'migrations/self-test-react-hooks.md',
        'migrations/unoptimized-test-plan.md',
        '.hachiko.yml'
      ],
      modified: [],
      removed: []
    }],
    head_commit: { 
      id: '70c0d75',
      message: 'Add comprehensive self-testing environment for Hachiko migrations'
    },
    pusher: { name: 'zdavis' },
    after: '70c0d75'
  },
  octokit: {
    repos: {
      getContent: async ({ path, ref }) => {
        console.log(`📁 Loading file: ${path} (ref: ${ref || 'main'})`);
        
        try {
          const content = readFileSync(path, 'utf8');
          return {
            data: {
              type: 'file',
              content: Buffer.from(content).toString('base64')
            }
          };
        } catch (error) {
          console.error(`❌ Failed to read ${path}:`, error.message);
          const notFoundError = new Error('Not Found');
          notFoundError.status = 404;
          throw notFoundError;
        }
      },
      getBranch: async ({ branch }) => {
        console.log(`🌿 Getting branch info for: ${branch}`);
        return {
          data: {
            commit: {
              sha: 'abc123def456'
            }
          }
        };
      }
    },
    issues: {
      create: async (params) => {
        console.log('\n🎯 WOULD CREATE MIGRATION ISSUE:');
        console.log(`   Title: ${params.title}`);
        console.log(`   Labels: ${params.labels?.join(', ')}`);
        console.log(`   Body preview: ${params.body?.substring(0, 100)}...`);
        
        return { 
          data: { 
            number: 42, 
            html_url: `https://github.com/${params.owner}/${params.repo}/issues/42` 
          } 
        };
      },
      listForRepo: async ({ labels }) => {
        console.log(`🔍 Checking for existing issues with labels: ${labels}`);
        return { data: [] }; // No existing issues
      }
    },
    pulls: {
      create: async (params) => {
        console.log('\n📋 WOULD CREATE PLAN REVIEW PR:');
        console.log(`   Title: ${params.title}`);
        console.log(`   Base: ${params.base} ← Head: ${params.head}`);
        console.log(`   Body preview: ${params.body?.substring(0, 100)}...`);
        
        return {
          data: {
            number: 6,
            html_url: `https://github.com/${params.owner}/${params.repo}/pull/6`
          }
        };
      }
    }
  }
};

async function testMigrationDetection() {
  console.log('🚀 Testing Hachiko Migration Detection');
  console.log('=====================================\n');
  
  console.log('📝 Simulating push webhook for commit 70c0d75');
  console.log('   Repository: launchdarkly-labs/hachiko');
  console.log('   Branch: refs/heads/main');
  console.log('   Added files:');
  mockContext.payload.commits[0].added.forEach(file => {
    console.log(`     + ${file}`);
  });
  console.log('');

  const logger = createLogger('test-webhook');
  
  try {
    await handlePush(mockContext, logger);
    console.log('\n✅ Migration detection test completed successfully!');
    console.log('\nThis simulates what should have happened when you merged the self-testing PR to main.');
  } catch (error) {
    console.error('\n❌ Migration detection test failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run the test
testMigrationDetection();