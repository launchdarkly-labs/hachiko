/**
 * Schema for migration document frontmatter
 * Based on the GitHub Actions architecture plan
 */
/**
 * Validate migration frontmatter (supports both schema versions)
 */
export function validateMigrationFrontmatter(data) {
    if (typeof data !== "object" || data === null) {
        return false;
    }
    // Common fields
    if (typeof data.id !== "string" ||
        typeof data.title !== "string" ||
        typeof data.agent !== "string" ||
        typeof data.created !== "string") {
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
export function validateMigrationFrontmatterV1(data) {
    return (typeof data === "object" &&
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
        data.total_steps >= 1);
}
/**
 * Validate new schema version 2
 */
export function validateMigrationFrontmatterV2(data) {
    return (typeof data === "object" &&
        data !== null &&
        data.schema_version === 2 &&
        typeof data.id === "string" &&
        typeof data.title === "string" &&
        typeof data.agent === "string" &&
        typeof data.created === "string");
}
/**
 * Create initial migration frontmatter (schema version 2)
 */
export function createMigrationFrontmatter(id, title, agent) {
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
export function createLegacyMigrationFrontmatter(id, title, agent, totalSteps = 1) {
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
export function updateMigrationFrontmatter(existing, updates) {
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
export function migrateFrontmatterToV2(v1) {
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
export function isFrontmatterV2(frontmatter) {
    return frontmatter.schema_version === 2;
}
/**
 * Check if frontmatter is schema version 1
 */
export function isFrontmatterV1(frontmatter) {
    return frontmatter.schema_version === 1;
}
//# sourceMappingURL=migration-schema.js.map