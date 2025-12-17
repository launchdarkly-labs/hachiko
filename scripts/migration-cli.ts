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

// Generate control plane issue body
program
  .command("generate-control-plane")
  .description("Generate control plane issue body from migrations")
  .action(async () => {
    try {
      const files = await readdir("migrations");
      const migrationFiles = files.filter((f) => f.endsWith(".md"));
      
      let pendingMigrations = "";
      let inProgressMigrations = "";
      let pausedMigrations = "";
      
      for (const file of migrationFiles) {
        const filePath = join("migrations", file);
        try {
          const parsed = await parseMigrationDocument(filePath);
          const { frontmatter } = parsed;
          
          const line = `- ${frontmatter.status === "pending" || frontmatter.status === "paused" ? "[ ]" : ""} \`${frontmatter.id}\` - ${frontmatter.title}`;
          
          switch (frontmatter.status) {
            case "pending":
              pendingMigrations += `${line}\n`;
              break;
            case "in_progress":
              const prLink = frontmatter.pr_number 
                ? `([PR #${frontmatter.pr_number}](https://github.com/${process.env.GITHUB_REPOSITORY}/pull/${frontmatter.pr_number}))`
                : "";
              inProgressMigrations += `- \`${frontmatter.id}\` - ${frontmatter.title} ${prLink} - ${frontmatter.current_step}/${frontmatter.total_steps} steps completed\n`;
              break;
            case "paused":
              pausedMigrations += `${line} (last attempt: step ${frontmatter.current_step}/${frontmatter.total_steps})\n`;
              break;
          }
        } catch {
          // Skip invalid migration files
        }
      }
      
      // Use default messages if no migrations
      if (!pendingMigrations) pendingMigrations = "✨ *No pending migrations*\n";
      if (!inProgressMigrations) inProgressMigrations = "✨ *No active migrations*\n";
      if (!pausedMigrations) pausedMigrations = "✨ *No paused migrations*\n";
      
      const issueBody = `# 🎛️ Hachiko Migration Control Plane

This issue tracks all active migrations in the repository. Use the checkboxes below to control migration execution.

## 🟡 Pending Migrations

${pendingMigrations}
## 🔄 In-Progress Migrations

${inProgressMigrations}
## ⏸️ Paused Migrations

${pausedMigrations}
---

**How to use:**
- ✅ Check a box next to a pending migration to start it
- ✅ Check a box next to a paused migration to resume it  
- ❌ Closing a Hachiko PR will pause the migration
- 🔄 This dashboard updates automatically as migrations progress

🤖 *Managed by Hachiko - Do not edit the sections above manually*`;

      console.log(issueBody);
    } catch (error) {
      console.error("Failed to generate control plane issue:", error);
      process.exit(1);
    }
  });

program.parse();