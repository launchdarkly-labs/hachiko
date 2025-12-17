import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { glob } from "glob";
import matter from "gray-matter";
import {
  type HachikoConfig,
  type MigrationFrontmatter,
  type MigrationStatus,
  validateMigrationFrontmatter,
} from "../config/schema.js";
import { ConfigurationError } from "../utils/errors.js";
import { createLogger } from "../utils/logger.js";

const logger = createLogger("plans");

export interface MigrationPlan {
  id: string;
  frontmatter: MigrationFrontmatter;
  content: string;
  filePath: string;
}

export interface ParsedPlan {
  plan: MigrationPlan;
  isValid: boolean;
  errors: string[];
}

/**
 * Parse a migration plan file (frontmatter + markdown)
 */
export async function parsePlanFile(filePath: string): Promise<ParsedPlan> {
  const errors: string[] = [];

  try {
    const fileContent = await readFile(filePath, "utf-8");
    const parsed = matter(fileContent);

    // Validate frontmatter
    let frontmatter: MigrationFrontmatter;
    try {
      frontmatter = validateMigrationFrontmatter(parsed.data);
    } catch (error) {
      errors.push(`Invalid frontmatter: ${error instanceof Error ? error.message : String(error)}`);

      // Use a minimal valid frontmatter for further processing
      frontmatter = {
        id: parsed.data.id || "unknown",
        title: parsed.data.title || "Unknown Migration",
        owner: parsed.data.owner || "@unknown",
        status: "draft" as MigrationStatus,
        strategy: { chunkBy: "module", maxOpenPRs: 1 },
        checks: [],
        rollback: [],
        successCriteria: [],
        steps: [],
        dependsOn: [],
        touches: [],
        attempts: 0,
      };
    }

    // Validate content
    if (!parsed.content || parsed.content.trim().length === 0) {
      errors.push("Migration plan content cannot be empty");
    }

    // Validate steps if present
    if (frontmatter.steps.length === 0) {
      errors.push("Migration plan must have at least one step");
    }

    // Validate step IDs are unique
    const stepIds = frontmatter.steps.map((s) => s.id);
    const duplicateSteps = stepIds.filter((id, index) => stepIds.indexOf(id) !== index);
    if (duplicateSteps.length > 0) {
      errors.push(`Duplicate step IDs found: ${duplicateSteps.join(", ")}`);
    }

    const plan: MigrationPlan = {
      id: frontmatter.id,
      frontmatter,
      content: parsed.content,
      filePath,
    };

    return {
      plan,
      isValid: errors.length === 0,
      errors,
    };
  } catch (error) {
    errors.push(
      `Failed to read plan file: ${error instanceof Error ? error.message : String(error)}`
    );

    // Return a minimal invalid plan
    return {
      plan: {
        id: "invalid",
        frontmatter: {
          id: "invalid",
          title: "Invalid Plan",
          owner: "@unknown",
          status: "draft",
          strategy: { chunkBy: "module", maxOpenPRs: 1 },
          checks: [],
          rollback: [],
          successCriteria: [],
          steps: [],
          dependsOn: [],
          touches: [],
          attempts: 0,
        },
        content: "",
        filePath,
      },
      isValid: false,
      errors,
    };
  }
}

/**
 * Discover all migration plan files in a directory
 */
export async function discoverPlans(repoRoot: string, config: HachikoConfig): Promise<string[]> {
  const planDir = join(repoRoot, config.plans.directory);
  const pattern = join(planDir, config.plans.filenamePattern);

  try {
    const files = await glob(pattern, {
      cwd: repoRoot,
      absolute: true,
      ignore: ["**/node_modules/**", "**/.git/**"],
    });

    logger.info({ planDir, pattern, filesFound: files.length }, "Discovered migration plans");
    return files;
  } catch (error) {
    logger.error({ error, planDir, pattern }, "Failed to discover migration plans");
    throw new ConfigurationError(`Failed to discover migration plans in ${planDir}`, {
      planDir,
      pattern,
      error: String(error),
    });
  }
}

/**
 * Load and parse all migration plans
 */
export async function loadAllPlans(repoRoot: string, config: HachikoConfig): Promise<ParsedPlan[]> {
  const planFiles = await discoverPlans(repoRoot, config);
  const plans: ParsedPlan[] = [];

  for (const filePath of planFiles) {
    // Only process markdown files
    if (extname(filePath) !== ".md") {
      continue;
    }

    try {
      const parsed = await parsePlanFile(filePath);
      plans.push(parsed);
    } catch (error) {
      logger.error({ error, filePath }, "Failed to parse migration plan");
      plans.push({
        plan: {
          id: `invalid-${Date.now()}`,
          frontmatter: {
            id: `invalid-${Date.now()}`,
            title: "Failed to Parse",
            owner: "@unknown",
            status: "draft",
            strategy: { chunkBy: "module", maxOpenPRs: 1 },
            checks: [],
            rollback: [],
            successCriteria: [],
            steps: [],
            dependsOn: [],
            touches: [],
            attempts: 0,
          },
          content: "",
          filePath,
        },
        isValid: false,
        errors: [`Failed to parse: ${error instanceof Error ? error.message : String(error)}`],
      });
    }
  }

  logger.info(
    {
      totalPlans: plans.length,
      validPlans: plans.filter((p) => p.isValid).length,
      invalidPlans: plans.filter((p) => !p.isValid).length,
    },
    "Loaded migration plans"
  );

  return plans;
}

/**
 * Validate plan dependencies and detect cycles
 */
export function validatePlanDependencies(plans: MigrationPlan[]): string[] {
  const errors: string[] = [];
  const planIds = new Set(plans.map((p) => p.id));

  // Check for missing dependencies
  for (const plan of plans) {
    for (const depId of plan.frontmatter.dependsOn) {
      if (!planIds.has(depId)) {
        errors.push(`Plan "${plan.id}" depends on non-existent plan "${depId}"`);
      }
    }
  }

  // Check for dependency cycles using DFS
  function hasCycle(planId: string, visited: Set<string>, stack: Set<string>): boolean {
    if (stack.has(planId)) return true;
    if (visited.has(planId)) return false;

    visited.add(planId);
    stack.add(planId);

    const plan = plans.find((p) => p.id === planId);
    if (plan) {
      for (const depId of plan.frontmatter.dependsOn) {
        if (hasCycle(depId, visited, stack)) {
          return true;
        }
      }
    }

    stack.delete(planId);
    return false;
  }

  const visited = new Set<string>();
  for (const plan of plans) {
    if (!visited.has(plan.id) && hasCycle(plan.id, visited, new Set())) {
      errors.push(`Circular dependency detected involving plan "${plan.id}"`);
    }
  }

  return errors;
}

/**
 * Generate normalized frontmatter for a plan (for Plan Review PRs)
 */
export function generateNormalizedFrontmatter(
  frontmatter: MigrationFrontmatter,
  config: HachikoConfig
): MigrationFrontmatter {
  const normalized = { ...frontmatter };

  // Set default agent if not specified
  if (!normalized.agent) {
    normalized.agent = config.defaults.agent;
  }

  // Ensure strategy has defaults
  normalized.strategy = {
    chunkBy: normalized.strategy.chunkBy || "module",
    maxOpenPRs: normalized.strategy.maxOpenPRs || config.defaults.prParallelism,
  };

  // Generate default steps if none provided
  if (normalized.steps.length === 0) {
    normalized.steps = [
      {
        id: "detect",
        description: "Analyze codebase and create migration plan",
        expectedPR: false,
      },
      {
        id: "implement",
        description: "Apply migration changes",
        expectedPR: true,
      },
      {
        id: "verify",
        description: "Verify migration success and run checks",
        expectedPR: false,
      },
    ];
  }

  return normalized;
}

/**
 * Serialize frontmatter back to YAML format
 */
export function serializeFrontmatter(frontmatter: MigrationFrontmatter): string {
  // Remove undefined fields for cleaner output
  const clean = JSON.parse(JSON.stringify(frontmatter));
  return `${matter.stringify("", clean).split("---\n")[1]}---`;
}
