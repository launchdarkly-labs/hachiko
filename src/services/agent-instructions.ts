/**
 * Service for generating agent-specific instructions using the new state inference system
 * Replaces hardcoded instructions with template-based generation
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ContextWithRepository } from "../types/context.js";
import type { Logger } from "../utils/logger.js";
import { createLogger } from "../utils/logger.js";
import type { MigrationFrontmatter } from "../config/migration-schema.js";

const logger = createLogger("agent-instructions");

export interface MigrationContext {
  id: string;
  title: string;
  agent: string;
  filePath: string;
  created: string;
}

export interface RepositoryContext {
  owner: string;
  name: string;
  url: string;
}

/**
 * Generate agent instructions for a specific migration
 */
export async function generateAgentInstructions(
  migrationContext: MigrationContext,
  repositoryContext: RepositoryContext,
  logger?: Logger
): Promise<string> {
  const log = logger || createLogger("agent-instructions");

  try {
    // Load the instruction template
    const template = await loadInstructionTemplate();

    // Apply template substitutions
    const instructions = applyTemplateSubstitutions(template, migrationContext, repositoryContext);

    log.info(
      { migrationId: migrationContext.id, agent: migrationContext.agent },
      "Generated agent instructions"
    );

    return instructions;
  } catch (error) {
    log.error({ error, migrationId: migrationContext.id }, "Failed to generate agent instructions");
    throw error;
  }
}

/**
 * Generate agent instructions from migration document in GitHub
 */
export async function generateAgentInstructionsFromRepo(
  context: ContextWithRepository,
  migrationId: string,
  logger?: Logger
): Promise<string> {
  const log = logger || createLogger("agent-instructions");

  try {
    // Get migration document content
    const filePath = `migrations/${migrationId}.md`;
    const response = await context.octokit.repos.getContent({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      path: filePath,
      ref: "main",
    });

    if (!("content" in response.data) || typeof response.data.content !== "string") {
      throw new Error(`Migration document not found: ${filePath}`);
    }

    const content = Buffer.from(response.data.content, "base64").toString("utf-8");

    // Parse frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch || !frontmatterMatch[1]) {
      throw new Error("Migration document missing frontmatter");
    }

    const frontmatter = require("yaml").parse(frontmatterMatch[1]) as MigrationFrontmatter;

    const migrationContext: MigrationContext = {
      id: frontmatter.id,
      title: frontmatter.title,
      agent: frontmatter.agent,
      filePath,
      created: frontmatter.created,
    };

    const repositoryContext: RepositoryContext = {
      owner: context.payload.repository.owner.login,
      name: context.payload.repository.name,
      url: context.payload.repository.html_url,
    };

    return await generateAgentInstructions(migrationContext, repositoryContext, log);
  } catch (error) {
    log.error({ error, migrationId }, "Failed to generate agent instructions from repo");
    throw error;
  }
}

/**
 * Load the instruction template file
 */
async function loadInstructionTemplate(): Promise<string> {
  try {
    const templatePath = join(__dirname, "../templates/agent-instructions.md");
    return await readFile(templatePath, "utf-8");
  } catch {
    // Fallback to inline template if file not found
    logger.warn("Template file not found, using inline template");
    return getInlineInstructionTemplate();
  }
}

/**
 * Apply template variable substitutions
 */
function applyTemplateSubstitutions(
  template: string,
  migrationContext: MigrationContext,
  repositoryContext: RepositoryContext
): string {
  let instructions = template;

  // Migration context substitutions
  instructions = instructions.replace(/\{migration\.id\}/g, migrationContext.id);
  instructions = instructions.replace(/\{migration\.title\}/g, migrationContext.title);
  instructions = instructions.replace(/\{migration\.agent\}/g, migrationContext.agent);
  instructions = instructions.replace(/\{migration\.filePath\}/g, migrationContext.filePath);
  instructions = instructions.replace(/\{migration\.created\}/g, migrationContext.created);

  // Repository context substitutions
  instructions = instructions.replace(/\{repository\.owner\}/g, repositoryContext.owner);
  instructions = instructions.replace(/\{repository\.name\}/g, repositoryContext.name);
  instructions = instructions.replace(/\{repository\.url\}/g, repositoryContext.url);

  return instructions;
}

/**
 * Inline template fallback if file-based template is not available
 */
function getInlineInstructionTemplate(): string {
  return `# Migration Instructions: {migration.title}

## Migration: {migration.id}

You are working on migration "{migration.id}" in repository {repository.owner}/{repository.name}.

### Important: Follow Hachiko Conventions

1. **Branch naming**: Create branch \`hachiko/{migration.id}\` or \`hachiko/{migration.id}-description\`

2. **PR requirements**:
   - Title must contain \`[{migration.id}]\`
   - Add label: \`hachiko:migration\`
   - Include migration link in description

3. **Update migration document**: 
   - Check off completed tasks: \`- [x] Task description\`
   - DO NOT modify frontmatter (id, title, agent, created)

4. **Quality gates**: Ensure tests pass, linting passes, types check

### How State Tracking Works

The system automatically tracks your progress:
- **pending**: No PRs opened yet  
- **active**: Has open PRs
- **paused**: All PRs closed, tasks incomplete
- **completed**: All tasks checked off and merged

### Migration Document

Update tasks in: {migration.filePath}

### Support

Check the migration dashboard at MIGRATION_DASHBOARD.md for current status.

---
Focus on good work and conventions - the system handles progress tracking automatically!`;
}

/**
 * Generate agent-specific instructions based on agent type
 */
export async function generateAgentSpecificInstructions(
  agentType: string,
  migrationContext: MigrationContext,
  repositoryContext: RepositoryContext,
  logger?: Logger
): Promise<string> {
  const log = logger || createLogger("agent-instructions");

  try {
    // Get base instructions
    const baseInstructions = await generateAgentInstructions(
      migrationContext,
      repositoryContext,
      log
    );

    // Add agent-specific guidance
    let agentSpecific = "";

    switch (agentType.toLowerCase()) {
      case "claude-cli":
      case "claude":
        agentSpecific = getClaudeSpecificInstructions();
        break;

      case "cursor":
      case "cursor-cli":
        agentSpecific = getCursorSpecificInstructions();
        break;

      case "devin":
        agentSpecific = getDevinSpecificInstructions();
        break;

      case "codex":
        agentSpecific = getCodexSpecificInstructions();
        break;

      case "mock":
        agentSpecific = getMockAgentInstructions();
        break;

      default:
        log.warn({ agentType }, "Unknown agent type, using generic instructions");
    }

    if (agentSpecific) {
      return `${baseInstructions}\n\n## Agent-Specific Guidance\n\n${agentSpecific}`;
    }

    return baseInstructions;
  } catch (error) {
    log.error(
      { error, agentType, migrationId: migrationContext.id },
      "Failed to generate agent-specific instructions"
    );
    throw error;
  }
}

function getClaudeSpecificInstructions(): string {
  return `### Claude CLI Guidance

- Use \`claude code\` to analyze and modify files
- Create focused, incremental changes
- Use the built-in testing and validation tools
- Follow the repository's existing patterns and conventions`;
}

function getCursorSpecificInstructions(): string {
  return `### Cursor Guidance

- Use Cursor's AI-assisted editing features
- Leverage the integrated terminal for testing
- Use Ctrl/Cmd+K for inline AI assistance
- Create commits frequently with descriptive messages`;
}

function getDevinSpecificInstructions(): string {
  return `### Devin Guidance

- Use your autonomous capabilities to plan and execute
- Break down tasks into smaller, testable units
- Verify each change before moving to the next
- Document any non-obvious decisions in commit messages`;
}

function getCodexSpecificInstructions(): string {
  return `### Codex Guidance

- Generate code following the project's existing patterns
- Use descriptive variable and function names
- Add comments for complex logic
- Test thoroughly before marking tasks complete`;
}

function getMockAgentInstructions(): string {
  return `### Mock Agent Guidance

This is a test migration. Follow all conventions but:
- Changes can be minimal/placeholder implementations
- Focus on testing the migration workflow
- Ensure all tracking mechanisms work correctly`;
}
