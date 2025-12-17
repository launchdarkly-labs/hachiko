/**
 * Schema for migration document frontmatter
 * Based on the GitHub Actions architecture plan
 */
/**
 * Validate migration frontmatter
 */
export function validateMigrationFrontmatter(data) {
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
 * Create initial migration frontmatter
 */
export function createMigrationFrontmatter(id, title, agent, totalSteps = 1) {
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
export function updateMigrationFrontmatter(existing, updates) {
    return {
        ...existing,
        ...updates,
        last_updated: new Date().toISOString(),
    };
}
//# sourceMappingURL=migration-schema.js.map