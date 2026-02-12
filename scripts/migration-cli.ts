#!/usr/bin/env node
/**
 * CLI utility for managing migration documents
 * Used by GitHub Actions workflows
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import {
  parseMigrationDocument,
  updateMigrationDocument,
  getMigrationIdFromPath,
  getMigrationPath,
  hasMigrationFrontmatter,
} from "../src/utils/migration-document.js";
import { createMigrationFrontmatter } from "../src/config/migration-schema.js";
import { Octokit } from "@octokit/rest";
import { getMigrationState } from "../src/services/state-inference.js";
import { getOpenHachikoPRs, getClosedHachikoPRs } from "../src/services/pr-detection.js";
import { createLogger } from "../src/utils/logger.js";

const program = new Command();

program
  .name("migration-cli")
  .description("CLI utility for managing migration documents")
  .version("1.0.0");

// List all migrations with their status
program
  .command("list")
  .description("List all migration documents")
  .option("--status <status>", "Filter by status")
  .action(async (options) => {
    try {
      const files = await readdir("migrations");
      const migrationFiles = files.filter((f) => f.endsWith(".md"));
      
      const migrations = [];
      
      for (const file of migrationFiles) {
        const filePath = join("migrations", file);
        try {
          const parsed = await parseMigrationDocument(filePath);
          migrations.push({
            id: parsed.frontmatter.id,
            title: parsed.frontmatter.title,
            status: parsed.frontmatter.status,
            progress: `${parsed.frontmatter.current_step}/${parsed.frontmatter.total_steps}`,
            agent: parsed.frontmatter.agent,
            updated: parsed.frontmatter.last_updated,
          });
        } catch (error) {
          migrations.push({
            id: file.replace(".md", ""),
            title: "Invalid/No frontmatter",
            status: "invalid",
            progress: "?/?",
            agent: "unknown",
            updated: "unknown",
          });
        }
      }
      
      // Filter by status if specified
      const filtered = options.status 
        ? migrations.filter((m) => m.status === options.status)
        : migrations;
      
      // Output as JSON for GitHub Actions
      console.log(JSON.stringify(filtered, null, 2));
    } catch (error) {
      console.error("Failed to list migrations:", error);
      process.exit(1);
    }
  });

// Get migration info
program
  .command("get <migration-id>")
  .description("Get migration document information")
  .action(async (migrationId) => {
    try {
      const filePath = getMigrationPath(migrationId);
      const parsed = await parseMigrationDocument(filePath);
      
      console.log(JSON.stringify({
        id: parsed.frontmatter.id,
        title: parsed.frontmatter.title,
        status: parsed.frontmatter.status,
        current_step: parsed.frontmatter.current_step,
        total_steps: parsed.frontmatter.total_steps,
        agent: parsed.frontmatter.agent,
        created: parsed.frontmatter.created,
        last_updated: parsed.frontmatter.last_updated,
        pr_number: parsed.frontmatter.pr_number,
        branch: parsed.frontmatter.branch,
        error: parsed.frontmatter.error,
      }, null, 2));
    } catch (error) {
      console.error(`Failed to get migration ${migrationId}:`, error);
      process.exit(1);
    }
  });

// Update migration status
program
  .command("update <migration-id>")
  .description("Update migration document")
  .option("--status <status>", "Update status")
  .option("--step <step>", "Update current step")
  .option("--pr <number>", "Set PR number")
  .option("--branch <name>", "Set branch name")
  .option("--error <message>", "Set error message")
  .action(async (migrationId, options) => {
    try {
      const filePath = getMigrationPath(migrationId);
      const updates: any = {};
      
      if (options.status) updates.status = options.status;
      if (options.step) updates.current_step = parseInt(options.step);
      if (options.pr) updates.pr_number = parseInt(options.pr);
      if (options.branch) updates.branch = options.branch;
      if (options.error) updates.error = options.error;
      
      await updateMigrationDocument(filePath, updates);
      
      console.log(`Updated migration ${migrationId}`);
    } catch (error) {
      console.error(`Failed to update migration ${migrationId}:`, error);
      process.exit(1);
    }
  });

// Enhance migration (add frontmatter)
program
  .command("enhance <file-path>")
  .description("Add frontmatter to a migration document")
  .option("--agent <agent>", "Agent to use", "cursor")
  .option("--steps <steps>", "Total steps", "1")
  .action(async (filePath, options) => {
    try {
      const { readFile, writeFile } = await import("node:fs/promises");
      
      const content = await readFile(filePath, "utf-8");
      
      // Check if already has frontmatter
      if (hasMigrationFrontmatter(content)) {
        console.log("Migration already has frontmatter");
        return;
      }
      
      const migrationId = getMigrationIdFromPath(filePath);
      
      // Extract title from first heading or use ID
      let title = migrationId;
      const headingMatch = content.match(/^#\s+(.+)$/m);
      if (headingMatch) {
        title = headingMatch[1].trim();
      }
      
      const frontmatter = createMigrationFrontmatter(
        migrationId,
        title,
        options.agent,
        parseInt(options.steps)
      );
      
      // Create enhanced content
      const { stringify } = await import("yaml");
      const yamlContent = stringify(frontmatter);
      
      const enhancedContent = `---\n${yamlContent}---\n\n${content}`;
      
      await writeFile(filePath, enhancedContent, "utf-8");
      
      console.log(`Enhanced migration document: ${filePath}`);
    } catch (error) {
      console.error(`Failed to enhance migration ${filePath}:`, error);
      process.exit(1);
    }
  });

// Validate migration document
program
  .command("validate <file-path>")
  .description("Validate migration document frontmatter")
  .action(async (filePath) => {
    try {
      const parsed = await parseMigrationDocument(filePath);
      
      console.log(JSON.stringify({
        valid: true,
        id: parsed.frontmatter.id,
        status: parsed.frontmatter.status,
        has_frontmatter: true,
      }));
    } catch (error) {
      // Check if file has any frontmatter at all
      try {
        const { readFile } = await import("node:fs/promises");
        const content = await readFile(filePath, "utf-8");
        const hasFrontmatter = hasMigrationFrontmatter(content);
        
        console.log(JSON.stringify({
          valid: false,
          has_frontmatter: hasFrontmatter,
          error: error instanceof Error ? error.message : String(error),
        }));
      } catch {
        console.log(JSON.stringify({
          valid: false,
          has_frontmatter: false,
          error: "File not found or not readable",
        }));
      }
    }
  });

// Generate migration dashboard issue body using state inference
program
  .command("generate-migration-dashboard")
  .description("Generate migration dashboard issue body from migrations using state inference")
  .action(async () => {
    try {
      // Create Octokit client for state inference
      const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
      
      // Extract repository info from environment
      const repo = process.env.GITHUB_REPOSITORY;
      if (!repo) {
        throw new Error("GITHUB_REPOSITORY environment variable not set");
      }
      const [owner, repoName] = repo.split("/");
      
      // Create context object for services
      const context = {
        repo: {
          owner,
          repo: repoName,
        },
        octokit,
        // Add minimal payload for ContextWithRepository compatibility
        payload: { repository: { name: repoName, owner: { login: owner } } }
      };
      
      // Discover migration files
      const files = await readdir("migrations");
      const migrationFiles = files.filter((f) => f.endsWith(".md"));
      
      let pendingMigrations = "";
      let inProgressMigrations = "";
      let pausedMigrations = "";
      let migrationsNeedingCleanup: string[] = [];
      
      for (const file of migrationFiles) {
        const filePath = join("migrations", file);
        try {
          const parsed = await parseMigrationDocument(filePath);
          const { frontmatter } = parsed;
          
          // Create logger with silenced output to prevent pollution in issue descriptions
          const logger = createLogger("migration-cli");
          logger.info = () => {};
          logger.debug = () => {};
          logger.error = () => {};

          // Use state inference instead of frontmatter status
          const stateInfo = await getMigrationState(context, frontmatter.id, parsed.content, logger);
          const state = stateInfo.state;
          
          const checkboxLine = `- [ ] \`${frontmatter.id}\` - ${frontmatter.title}`;
          
          switch (state) {
            case "pending":
              pendingMigrations += `${checkboxLine}\n`;
              break;
            case "active":
              // Get both open and closed PRs for active migrations
              const openPRs = await getOpenHachikoPRs(context, frontmatter.id, logger);
              const closedPRs = await getClosedHachikoPRs(context, frontmatter.id, logger);
              
              const mergedPRs = closedPRs.filter(pr => pr.merged);
              const totalSteps = frontmatter.total_steps || 1;
              
              // Start with migration title
              inProgressMigrations += `- [ ] \`${frontmatter.id}\` - ${frontmatter.title}\n`;
              
              // Add current open PRs first with "Current step:" prefix
              for (const pr of openPRs) {
                inProgressMigrations += `  - Current step: [${pr.title}](${pr.url})\n`;
              }
              
              // Add progress summary as sub-bullet after PR links
              const completedSteps = mergedPRs.length;
              if (completedSteps > 0) {
                inProgressMigrations += `  - ${completedSteps} of ${totalSteps} steps completed\n`;
              }
              
              // If no open PRs but has merged PRs, check if migration is complete
              if (openPRs.length === 0 && mergedPRs.length > 0) {
                if (completedSteps >= totalSteps) {
                  inProgressMigrations += `  - Migration complete! Cleanup should kick off soon\n`;

                  // Check if cleanup PR already exists before triggering cleanup
                  const allOpenPRs = await context.octokit.pulls.list({
                    owner: context.payload.repository.owner.login,
                    repo: context.payload.repository.name,
                    state: "open",
                    per_page: 100,
                  });

                  const cleanupPRExists = allOpenPRs.data.some(pr =>
                    pr.head.ref.includes(`${frontmatter.id}-cleanup`) ||
                    pr.head.ref.includes(`${frontmatter.id}/cleanup`) ||
                    (pr.title.toLowerCase().includes('cleanup') && pr.head.ref.includes(frontmatter.id))
                  );

                  // Only trigger cleanup if no cleanup PR exists
                  if (!cleanupPRExists) {
                    migrationsNeedingCleanup.push(frontmatter.id);
                  } else {
                    inProgressMigrations += `  - Cleanup PR already exists\n`;
                  }
                } else {
                  const nextStep = completedSteps + 1;
                  inProgressMigrations += `  - Step ${nextStep} should automatically kick off soon\n`;
                }
              }
              
              // If no PRs at all (shouldn't happen for active state)
              if (openPRs.length === 0 && mergedPRs.length === 0) {
                inProgressMigrations += `  - In progress\n`;
              }
              
              break;
            case "paused":
              // Determine if the paused step is a cleanup step
              let stepInfo = "";
              if (stateInfo.currentStep > frontmatter.total_steps) {
                stepInfo = " (paused on: cleanup)";
              } else if (stateInfo.totalTasks > 0) {
                stepInfo = ` (paused on: step ${stateInfo.currentStep}/${frontmatter.total_steps})`;
              }

              // Check if most recent closed PR was a cleanup PR by examining branch names
              const closedPRsWithCleanup = stateInfo.closedPRs.filter(pr =>
                pr.branch.includes('cleanup') || pr.branch.includes('final')
              );
              if (closedPRsWithCleanup.length > 0 && !stepInfo.includes("cleanup")) {
                stepInfo = " (paused on: cleanup)";
              }

              pausedMigrations += `${checkboxLine}${stepInfo}\n`;
              break;
            case "completed":
              // Completed migrations don't appear in the dashboard checkboxes
              break;
          }
        } catch (error) {
          console.error(`Failed to process migration ${file}:`, error);
          // Skip invalid migration files
        }
      }
      
      // Build sections with conditional descriptions
      const pendingSection = pendingMigrations 
        ? `## 🟡 Pending Migrations

The following migrations haven't been started yet. To kick off the first step in a migration, click on a checkbox below.

${pendingMigrations}`
        : `## 🟡 Pending Migrations

✨ *No pending migrations*
`;
      
      const inProgressSection = inProgressMigrations 
        ? `## 🔄 In-Progress Migrations

These migrations are currently active with work in progress. Click a checkbox to force the last unmerged step to be retried.

${inProgressMigrations}`
        : `## 🔄 In-Progress Migrations

✨ *No active migrations*
`;
      
      const pausedSection = pausedMigrations 
        ? `## ⏸️ Paused Migrations

These migrations have been paused because the last pull request was closed without merging. Click a checkbox to resume the migration.

${pausedMigrations}`
        : `## ⏸️ Paused Migrations

✨ *No paused migrations*
`;
      
      const issueBody = `# 📊 Hachiko Migration Dashboard

This issue tracks all active migrations in the repository. Use the checkboxes below to control migration execution.

${pendingSection}
${inProgressSection}
${pausedSection}
---

**How to use:**
- ✅ Check a box next to a pending migration to start it
- ✅ Check a box next to a paused migration to resume it  
- ❌ Closing a Hachiko PR will pause the migration
- 🔄 This dashboard updates automatically as migrations progress

🤖 *Managed by Hachiko - Do not edit the sections above manually*`;

      console.log(issueBody);
      
      // Output cleanup-needed migrations to stderr for workflow consumption
      if (migrationsNeedingCleanup.length > 0 && process.env.GITHUB_ACTIONS) {
        console.error(`CLEANUP_NEEDED=${migrationsNeedingCleanup.join(',')}`);
      }
    } catch (error) {
      console.error("Failed to generate migration dashboard issue:", error);
      process.exit(1);
    }
  });

// Generate agent instructions command
program
  .command("get-agent-instructions")
  .description("Generate standardized instructions for migration agents")
  .argument("<migration-id>", "Migration ID")
  .argument("<step-id>", "Step number to execute") 
  .argument("<agent>", "Agent type (devin, cursor, codex)")
  .option("--repository <repo>", "Repository name", process.env.GITHUB_REPOSITORY)
  .option("--branch <branch>", "Working branch name")
  .action(async (migrationId: string, stepId: string, agent: string, options) => {
    try {
      
      const migrationPath = getMigrationPath(migrationId);
      
      const parsedMigration = await parseMigrationDocument(migrationPath);
      
      const { frontmatter } = parsedMigration;
      const totalSteps = frontmatter.total_steps || 1;
      const repository = options.repository;
      const branch = options.branch || `hachiko/${migrationId}-step-${stepId}`;

      if (!repository) {
        throw new Error("Repository name is required (set GITHUB_REPOSITORY or use --repository)");
      }

      // Generate standardized agent instructions
      // TODO: Replace with AI Configs integration in the future
      const reviewers = frontmatter.reviewers || [];
      const reviewersText = reviewers.length > 0 ? reviewers.join(', ') : 'none specified';
      const migrationTitle = frontmatter.title || `Migration ${migrationId}`;
      
      // Handle different schema versions for total_steps
      const actualTotalSteps = frontmatter.schema_version === 1 ? 
        (frontmatter as any).total_steps || totalSteps : 
        totalSteps;
      
      // Special handling for cleanup step
      if (stepId === 'cleanup') {
        const cleanupInstructions = `You are executing the CLEANUP step for migration "${migrationId}" using the Hachiko migration system.

TRACKING REQUIREMENT:
Your FIRST commit message MUST begin with this exact line:
hachiko-track:${migrationId}:cleanup

This is critical for automated tracking. Example first commit message:
hachiko-track:${migrationId}:cleanup
chore: clean up completed migration

CLEANUP TASK:
You are reviewing a migration that appears to have completed all ${actualTotalSteps} steps. Your job is to verify the actual status and update accordingly:

**STEP 1: VERIFY COMPLETION STATUS**
- Review the migration document at migrations/${migrationId}.md
- Check if ALL ${actualTotalSteps} steps are truly complete and marked with [x]
- Look for any incomplete tasks, failed requirements, or unfinished work
- Review the Success Criteria section to ensure all items are satisfied

**STEP 2A: IF MIGRATION IS COMPLETE**
- Remove the migration document: migrations/${migrationId}.md
- Create PR with:
  - Branch: hachiko/${migrationId}-cleanup
  - Title: "Cleanup: ${migrationTitle} (Migration Complete)"
  - Description: Include "<!-- hachiko-track:${migrationId}:cleanup -->" at the top, then "Migration verified as complete - removing migration document after successful completion of all ${actualTotalSteps} steps"

**STEP 2B: IF MIGRATION IS INCOMPLETE**
- Update migration document frontmatter to:
  - status: active (or paused if there are blockers)
  - last_updated: ${new Date().toISOString()}
- Document what remains incomplete in the migration document
- Create PR with:
  - Branch: hachiko/${migrationId}-status-update
  - Title: "Status Update: ${migrationTitle} (Incomplete)"  
  - Description: Include "<!-- hachiko-track:${migrationId}:cleanup -->" at the top, then "Migration review found incomplete work - documented remaining tasks"

Migration Details:
- Migration ID: ${migrationId}
- Migration File: migrations/${migrationId}.md
- Total Steps Completed: ${actualTotalSteps}
- Repository: https://github.com/${repository}
- Agent Type: ${agent}

**This is the final step that officially completes the migration lifecycle.**`;

        console.log(cleanupInstructions);
        return;
      }
      
      const instructions = `You are executing step ${stepId} of migration "${migrationId}" using the Hachiko migration system.

TRACKING REQUIREMENT:
Your FIRST commit message MUST begin with this exact line:
hachiko-track:${migrationId}:${stepId}

This is critical for automated tracking. Example first commit message:
hachiko-track:${migrationId}:${stepId}
feat: implement step ${stepId} changes

Instructions:
1. Read and understand the migration document at: migrations/${migrationId}.md
2. Focus on completing step ${stepId} of the migration as described in the document
3. Make the necessary code changes following the migration requirements
4. Create a new branch following the pattern "hachiko/${migrationId}-step-${stepId}" or similar descriptive name
5. Commit your changes with clear, descriptive commit messages (no emojis)
6. Create a pull request with the following specifications:
   - Title: "Migration: ${migrationTitle} (Step ${stepId}/${actualTotalSteps})"
   - Label: "hachiko:migration"
   - Reviewers: ${reviewersText}
   - Description: Use the standard migration PR template (see below)
7. Update the migration document:
   - Check off any completed tasks/requirements
   - Add any new critical learnings or important discoveries (keep concise)
   - Do not update progress beyond checking completed tasks
8. Ensure all tests pass and code quality checks succeed
9. Follow the coding standards and patterns established in the codebase

Migration Details:
- Migration ID: ${migrationId}
- Current Step: ${stepId} of ${actualTotalSteps}
- Migration File: migrations/${migrationId}.md
- Repository: https://github.com/${repository}
- Agent Type: ${agent}
- Reviewers: ${reviewersText}

PR Description Template:
<!-- hachiko-track:${migrationId}:${stepId} -->
## Migration Progress: Step ${stepId}/${actualTotalSteps}

**Migration**: \`${migrationId}\`
**Title**: ${migrationTitle}
**Agent**: ${agent}

### Changes Applied
[Describe the specific changes made in this step]

### Migration Document
See: migrations/${migrationId}.md

### Testing
- [ ] All existing tests pass
- [ ] New tests added if applicable
- [ ] Manual testing completed

### Next Steps
${parseInt(stepId) < actualTotalSteps ? `- Merge this PR to advance to step ${parseInt(stepId) + 1}` : '- This completes the migration'}
- Review changes carefully before merging

Generated by Hachiko Migration System

The migration document contains the full context, requirements, and success criteria. Focus on delivering high-quality, well-tested changes that advance the migration to completion.`;


      console.log(instructions);
    } catch (error) {
      console.error("Failed to generate agent instructions:", error);
      process.exit(1);
    }
  });

program.parse();