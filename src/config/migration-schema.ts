/**
 * Schema for migration document frontmatter
 * Based on the GitHub Actions architecture plan
 */

// Legacy schema version 1 - includes state fields (deprecated)
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

// New schema version 2 - static metadata only, state inferred from PRs
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
  created: string; // ISO 8601
}

// Union type for backward compatibility
export type MigrationFrontmatter = MigrationFrontmatterV1 | MigrationFrontmatterV2;

// Inferred migration state (not stored in frontmatter)
export type MigrationState = "pending" | "active" | "paused" | "completed";

/**
 * Validate migration frontmatter (supports both schema versions)
 */
export function validateMigrationFrontmatter(data: any): data is MigrationFrontmatter {
  if (typeof data !== "object" || data === null) {
    return false;
  }

  // Common fields
  if (
    typeof data.id !== "string" ||
    typeof data.title !== "string" ||
    typeof data.agent !== "string" ||
    typeof data.created !== "string"
  ) {
    return false;
  }

  // Schema version 1 (legacy)
  if (data.schema_version === 1) {
    return validateMigrationFrontmatterV1(data);
  }

  // Schema version 2 (new)
  if (data.schema_version === 2) {
    return validateMigrationFrontmatterV2(data);
  }

  return false;
}

/**
 * Validate legacy schema version 1
 */
export function validateMigrationFrontmatterV1(data: any): data is MigrationFrontmatterV1 {
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
 * Validate new schema version 2
 */
export function validateMigrationFrontmatterV2(data: any): data is MigrationFrontmatterV2 {
  return (
    typeof data === "object" &&
    data !== null &&
    data.schema_version === 2 &&
    typeof data.id === "string" &&
    typeof data.title === "string" &&
    typeof data.agent === "string" &&
    typeof data.created === "string"
  );
}

/**
 * Create initial migration frontmatter (schema version 2)
 */
export function createMigrationFrontmatter(
  id: string,
  title: string,
  agent: string
): MigrationFrontmatterV2 {
  const now = new Date().toISOString();

  return {
    schema_version: 2,
    id,
    title,
    agent,
    created: now,
  };
}

/**
 * Create legacy migration frontmatter (schema version 1) - for backward compatibility
 */
export function createLegacyMigrationFrontmatter(
  id: string,
  title: string,
  agent: string,
  totalSteps: number = 1
): MigrationFrontmatterV1 {
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
 * Update migration frontmatter (only for legacy schema v1)
 */
export function updateMigrationFrontmatter(
  existing: MigrationFrontmatterV1,
  updates: Partial<Omit<MigrationFrontmatterV1, "schema_version" | "id" | "created">>
): MigrationFrontmatterV1 {
  return {
    ...existing,
    ...updates,
    last_updated: new Date().toISOString(),
  };
}

/**
 * Migrate schema version 1 frontmatter to version 2
 * This removes all state-tracking fields
 */
export function migrateFrontmatterToV2(v1: MigrationFrontmatterV1): MigrationFrontmatterV2 {
  return {
    schema_version: 2,
    id: v1.id,
    title: v1.title,
    agent: v1.agent,
    created: v1.created,
  };
}

/**
 * Check if frontmatter is schema version 2
 */
export function isFrontmatterV2(
  frontmatter: MigrationFrontmatter
): frontmatter is MigrationFrontmatterV2 {
  return frontmatter.schema_version === 2;
}

/**
 * Check if frontmatter is schema version 1
 */
export function isFrontmatterV1(
  frontmatter: MigrationFrontmatter
): frontmatter is MigrationFrontmatterV1 {
  return frontmatter.schema_version === 1;
}
