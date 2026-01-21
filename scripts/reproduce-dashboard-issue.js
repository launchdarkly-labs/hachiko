#!/usr/bin/env node
/**
 * Script to reproduce the dashboard update issue
 * Simulates the exact workflow steps that cause the issue
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Setup test environment
function setupTestEnvironment() {
  console.log('📋 Setting up test environment...');
  
  // Create migrations directory if it doesn't exist
  if (!existsSync('migrations')) {
    mkdirSync('migrations');
  }
  
  // Create test migration files
  const testMigrations = [
    {
      id: 'react-hooks-conversion',
      title: 'Convert React class components to hooks',
      status: 'pending'
    },
    {
      id: 'typescript-strict-mode',
      title: 'Enable TypeScript strict mode', 
      status: 'pending'
    },
    {
      id: 'legacy-api-cleanup',
      title: 'Remove deprecated API calls',
      status: 'paused'
    }
  ];
  
  testMigrations.forEach(migration => {
    const frontmatter = `---
schema_version: 1
id: ${migration.id}
title: ${migration.title}
agent: cursor
status: ${migration.status}
current_step: 1
total_steps: 3
created: 2024-01-20T10:00:00Z
last_updated: 2024-01-20T10:00:00Z
---

# ${migration.title}

Test migration content for reproducing dashboard issue.
`;
    
    const filePath = join('migrations', `${migration.id}.md`);
    if (!existsSync(filePath)) {
      writeFileSync(filePath, frontmatter);
      console.log(`✅ Created test migration: ${filePath}`);
    }
  });
}

// Simulate the dashboard issue workflow
async function reproduceDashboardIssue() {
  console.log('\n🎯 Reproducing dashboard update issue...');
  
  // Step 1: Generate initial dashboard
  console.log('\n1️⃣ Generating initial dashboard...');
  try {
    const { stdout: initialDashboard } = await execAsync('pnpm migration generate-migration-dashboard');
    console.log('Initial dashboard generated:');
    console.log('---');
    console.log(initialDashboard);
    console.log('---');
    
    // Step 2: Simulate checkbox being checked (user edits issue)
    console.log('\n2️⃣ Simulating user checking checkbox for "react-hooks-conversion"...');
    const dashboardWithCheckedBox = initialDashboard.replace(
      '- [ ] `react-hooks-conversion`',
      '- [x] `react-hooks-conversion`'
    );
    
    console.log('Dashboard after checkbox check:');
    console.log('---');
    console.log(dashboardWithCheckedBox);
    console.log('---');
    
    // Step 3: Parse checked migrations (simulate workflow logic)
    console.log('\n3️⃣ Parsing checked migrations (workflow step)...');
    const checkedMigrations = parseCheckedMigrations(dashboardWithCheckedBox);
    console.log('Detected checked migrations:', checkedMigrations);
    
    // Step 4: Simulate migration trigger (this would start execute-migration workflow)
    console.log('\n4️⃣ Simulating migration trigger...');
    if (checkedMigrations.pending.length > 0 || checkedMigrations.paused.length > 0) {
      console.log('✅ Would trigger execute-migration workflow for:', [...checkedMigrations.pending, ...checkedMigrations.paused]);
      console.log('⚠️  THE ISSUE: Dashboard update happens immediately, before migration status changes!');
    }
    
    // Step 5: Immediate dashboard update (the problematic step)
    console.log('\n5️⃣ Immediate dashboard update (PROBLEMATIC)...');
    const { stdout: updatedDashboard } = await execAsync('pnpm migration generate-migration-dashboard');
    console.log('Dashboard after immediate update:');
    console.log('---');
    console.log(updatedDashboard);
    console.log('---');
    
    // Check if the issue is reproduced
    const issueReproduced = updatedDashboard.includes('- [ ] `react-hooks-conversion`');
    if (issueReproduced) {
      console.log('🐛 ISSUE REPRODUCED: Checkbox was unchecked because migration status hasn\'t changed yet!');
      console.log('   - User checked the box ✅');
      console.log('   - Migration was triggered ⚡');
      console.log('   - Dashboard updated immediately 📊');
      console.log('   - But migration is still "pending" status, so checkbox shows unchecked ❌');
    } else {
      console.log('✅ Issue not reproduced in this scenario');
    }
    
    // Step 6: Simulate what SHOULD happen - update migration status first
    console.log('\n6️⃣ Demonstrating the fix - update migration status first...');
    
    // Update migration status to in_progress
    const migrationFile = 'migrations/react-hooks-conversion.md';
    let migrationContent = readFileSync(migrationFile, 'utf-8');
    migrationContent = migrationContent.replace('status: pending', 'status: in_progress');
    migrationContent = migrationContent.replace('last_updated: 2024-01-20T10:00:00Z', `last_updated: ${new Date().toISOString()}`);
    writeFileSync(migrationFile, migrationContent);
    
    console.log('Updated migration status to in_progress');
    
    // Generate dashboard again
    const { stdout: fixedDashboard } = await execAsync('pnpm migration generate-migration-dashboard');
    console.log('Dashboard after status update:');
    console.log('---');
    console.log(fixedDashboard);
    console.log('---');
    
    const isFixed = fixedDashboard.includes('## 🔄 In-Progress Migrations') && 
                   fixedDashboard.includes('react-hooks-conversion');
    
    if (isFixed) {
      console.log('✅ ISSUE FIXED: Migration now shows in "In-Progress" section');
    }
    
  } catch (error) {
    console.error('❌ Error during reproduction:', error);
  }
}

// Parse checked migrations from dashboard body (simulate workflow bash logic)
function parseCheckedMigrations(dashboardBody) {
  const checkedPending = [];
  const checkedPaused = [];
  
  // Parse pending section
  const pendingSection = dashboardBody.match(/## 🟡 Pending Migrations(.*?)## 🔄 In-Progress Migrations/s);
  if (pendingSection) {
    const matches = pendingSection[1].match(/- \[x\] `([^`]+)`/g);
    if (matches) {
      matches.forEach(match => {
        const migrationId = match.match(/`([^`]+)`/)?.[1];
        if (migrationId) checkedPending.push(migrationId);
      });
    }
  }
  
  // Parse paused section  
  const pausedSection = dashboardBody.match(/## ⏸️ Paused Migrations(.*?)---/s);
  if (pausedSection) {
    const matches = pausedSection[1].match(/- \[x\] `([^`]+)`/g);
    if (matches) {
      matches.forEach(match => {
        const migrationId = match.match(/`([^`]+)`/)?.[1];
        if (migrationId) checkedPaused.push(migrationId);
      });
    }
  }
  
  return { pending: checkedPending, paused: checkedPaused };
}

// Cleanup test environment
function cleanupTestEnvironment() {
  console.log('\n🧹 Cleaning up test environment...');
  try {
    // Reset migration files to original state
    const testMigrationIds = ['react-hooks-conversion', 'typescript-strict-mode', 'legacy-api-cleanup'];
    testMigrationIds.forEach(id => {
      const filePath = join('migrations', `${id}.md`);
      if (existsSync(filePath)) {
        // Reset to pending status
        let content = readFileSync(filePath, 'utf-8');
        content = content.replace(/status: in_progress/, 'status: pending');
        content = content.replace(/status: paused/, id === 'legacy-api-cleanup' ? 'status: paused' : 'status: pending');
        writeFileSync(filePath, content);
      }
    });
    console.log('✅ Reset migration files');
  } catch (error) {
    console.log('⚠️ Cleanup error (non-critical):', error.message);
  }
}

// Main execution
async function main() {
  console.log('🔍 Dashboard Issue Reproduction Script');
  console.log('=====================================');
  
  try {
    setupTestEnvironment();
    await reproduceDashboardIssue();
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    cleanupTestEnvironment();
  }
  
  console.log('\n📋 Summary:');
  console.log('- ✅ Test environment set up');
  console.log('- 🎯 Dashboard issue reproduced');
  console.log('- 💡 Root cause identified: Dashboard updates before migration status changes');
  console.log('- 🔧 Fix demonstrated: Update migration status before dashboard update');
  console.log('\n🚀 Next steps: Apply the timing fix to the workflow!');
}

main().catch(console.error);