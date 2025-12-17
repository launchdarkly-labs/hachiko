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
  created: string; // ISO 8601
  
  /** When migration was last updated */
  last_updated: string; // ISO 8601
  
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
export function validateMigrationFrontmatter(data: any): data is MigrationFrontmatter {
  return (
    typeof data === "object" &&
    data !== null &&
    data.schema_version === 1 &&
    typeof data.id === "string" &&
    typeof data.title === "string" &&
    typeof data.agent === "string" &&
    ["pending", "in_progress", "completed", "paused", "failed"].includes(data.status) &&
    typeof data.current_step === "number" &&
    typeof data.total_steps === "number" &&
    typeof data.created === "string" &&
    typeof data.last_updated === "string" &&
    data.current_step >= 1 &&
    data.current_step <= data.total_steps &&
    data.total_steps >= 1
  );
}

/**
 * Create initial migration frontmatter
 */
export function createMigrationFrontmatter(
  id: string,
  title: string,
  agent: string,
  totalSteps: number = 1
): MigrationFrontmatter {
  const now = new Date().toISOString();
  
  return {
    schema_version: 1,
    id,
    title,
    agent,
    status: "pending",
    current_step: 1,
    total_steps: totalSteps,
    created: now,
    last_updated: now,
  };
}

/**
 * Update migration frontmatter
 */
export function updateMigrationFrontmatter(
  existing: MigrationFrontmatter,
  updates: Partial<Omit<MigrationFrontmatter, "schema_version" | "id" | "created">>
): MigrationFrontmatter {
  return {
    ...existing,
    ...updates,
    last_updated: new Date().toISOString(),
  };
}