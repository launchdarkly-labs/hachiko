import { type HachikoConfig, type MigrationFrontmatter } from "../config/schema.js";
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
export declare function parsePlanFile(filePath: string): Promise<ParsedPlan>;
/**
 * Discover all migration plan files in a directory
 */
export declare function discoverPlans(repoRoot: string, config: HachikoConfig): Promise<string[]>;
/**
 * Load and parse all migration plans
 */
export declare function loadAllPlans(repoRoot: string, config: HachikoConfig): Promise<ParsedPlan[]>;
/**
 * Validate plan dependencies and detect cycles
 */
export declare function validatePlanDependencies(plans: MigrationPlan[]): string[];
/**
 * Generate normalized frontmatter for a plan (for Plan Review PRs)
 */
export declare function generateNormalizedFrontmatter(frontmatter: MigrationFrontmatter, config: HachikoConfig): MigrationFrontmatter;
/**
 * Serialize frontmatter back to YAML format
 */
export declare function serializeFrontmatter(frontmatter: MigrationFrontmatter): string;
//# sourceMappingURL=plans.d.ts.map