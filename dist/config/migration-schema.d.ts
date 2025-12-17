/**
 * Schema for migration document frontmatter
 * Based on the GitHub Actions architecture plan
 */
export interface MigrationFrontmatter {
    /** Schema version for future evolution */
    schema_version: 1;
    /** Unique migration identifier (kebab-case) */
    id: string;
    /** Human-readable title */
    title: string;
    /** Cloud agent to use (cursor, codex, devin, mock) */
    agent: string;
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
/**
 * Validate migration frontmatter
 */
export declare function validateMigrationFrontmatter(data: any): data is MigrationFrontmatter;
/**
 * Create initial migration frontmatter
 */
export declare function createMigrationFrontmatter(id: string, title: string, agent: string, totalSteps?: number): MigrationFrontmatter;
/**
 * Update migration frontmatter
 */
export declare function updateMigrationFrontmatter(existing: MigrationFrontmatter, updates: Partial<Omit<MigrationFrontmatter, "schema_version" | "id" | "created">>): MigrationFrontmatter;
//# sourceMappingURL=migration-schema.d.ts.map