/**
 * Schema for migration document frontmatter
 * Based on the GitHub Actions architecture plan
 */
export interface MigrationFrontmatterV1 {
    /** Schema version for future evolution */
    schema_version: 1;
    /** Unique migration identifier (kebab-case) */
    id: string;
    /** Human-readable title */
    title: string;
    /** Cloud agent to use (cursor, codex, devin, mock) */
    agent: string;
    /** GitHub usernames to request as PR reviewers (optional) */
    reviewers?: string[];
    /** Current migration status */
    status: "pending" | "in_progress" | "completed" | "paused" | "failed";
    /** Current step number (1-indexed) */
    current_step: number;
    /** Total number of steps */
    total_steps: number;
    /** When migration was created */
    created: string;
    /** When migration was last updated */
    last_updated: string;
    /** Associated PR number (when in progress) */
    pr_number?: number;
    /** Working branch name */
    branch?: string;
    /** Last error message (when status is failed) */
    error?: string;
}
export interface MigrationFrontmatterV2 {
    /** Schema version for future evolution */
    schema_version: 2;
    /** Unique migration identifier (kebab-case) */
    id: string;
    /** Human-readable title */
    title: string;
    /** Cloud agent to use (cursor, codex, devin, mock) */
    agent: string;
    /** GitHub usernames to request as PR reviewers (optional) */
    reviewers?: string[];
    /** When migration was created */
    created: string;
}
export type MigrationFrontmatter = MigrationFrontmatterV1 | MigrationFrontmatterV2;
export type MigrationState = "pending" | "active" | "paused" | "completed";
/**
 * Validate migration frontmatter (supports both schema versions)
 */
export declare function validateMigrationFrontmatter(data: any): data is MigrationFrontmatter;
/**
 * Validate legacy schema version 1
 */
export declare function validateMigrationFrontmatterV1(data: any): data is MigrationFrontmatterV1;
/**
 * Validate new schema version 2
 */
export declare function validateMigrationFrontmatterV2(data: any): data is MigrationFrontmatterV2;
/**
 * Create initial migration frontmatter (schema version 2)
 */
export declare function createMigrationFrontmatter(id: string, title: string, agent: string): MigrationFrontmatterV2;
/**
 * Create legacy migration frontmatter (schema version 1) - for backward compatibility
 */
export declare function createLegacyMigrationFrontmatter(id: string, title: string, agent: string, totalSteps?: number): MigrationFrontmatterV1;
/**
 * Update migration frontmatter (only for legacy schema v1)
 */
export declare function updateMigrationFrontmatter(existing: MigrationFrontmatterV1, updates: Partial<Omit<MigrationFrontmatterV1, "schema_version" | "id" | "created">>): MigrationFrontmatterV1;
/**
 * Migrate schema version 1 frontmatter to version 2
 * This removes all state-tracking fields
 */
export declare function migrateFrontmatterToV2(v1: MigrationFrontmatterV1): MigrationFrontmatterV2;
/**
 * Check if frontmatter is schema version 2
 */
export declare function isFrontmatterV2(frontmatter: MigrationFrontmatter): frontmatter is MigrationFrontmatterV2;
/**
 * Check if frontmatter is schema version 1
 */
export declare function isFrontmatterV1(frontmatter: MigrationFrontmatter): frontmatter is MigrationFrontmatterV1;
//# sourceMappingURL=migration-schema.d.ts.map