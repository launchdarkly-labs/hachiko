/**
 * Utilities for parsing and manipulating migration documents
 */
import { readFile, writeFile } from "node:fs/promises";
import { parse as parseYAML, stringify as stringifyYAML } from "yaml";
import { validateMigrationFrontmatter } from "../config/migration-schema.js";
import { createLogger } from "./logger.js";
const logger = createLogger("migration-document");
/**
 * Parse a migration document file
 */
export async function parseMigrationDocument(filePath) {
    try {
        const content = await readFile(filePath, "utf-8");
        return parseMigrationDocumentContent(content);
    }
    catch (error) {
        logger.error({ error, filePath }, "Failed to read migration document");
        throw new Error(`Failed to read migration document: ${filePath}`);
    }
}
/**
 * Parse migration document content string
 */
export function parseMigrationDocumentContent(content) {
    // Extract frontmatter using regex
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
        throw new Error("Migration document missing frontmatter");
    }
    const rawFrontmatter = frontmatterMatch[1];
    const documentContent = frontmatterMatch[2];
    if (!rawFrontmatter || documentContent === undefined) {
        throw new Error("Invalid frontmatter format");
    }
    try {
        const frontmatter = parseYAML(rawFrontmatter);
        if (!validateMigrationFrontmatter(frontmatter)) {
            throw new Error("Invalid migration frontmatter schema");
        }
        return {
            frontmatter,
            content: documentContent.trim(),
            rawFrontmatter,
        };
    }
    catch (error) {
        logger.error({ error, rawFrontmatter }, "Failed to parse migration frontmatter");
        throw new Error("Failed to parse migration frontmatter");
    }
}
/**
 * Update migration document frontmatter
 */
export async function updateMigrationDocument(filePath, updates) {
    try {
        const parsed = await parseMigrationDocument(filePath);
        // Update frontmatter (only works for v1 schema)
        if (parsed.frontmatter.schema_version !== 1) {
            throw new Error("Can only update legacy schema version 1 frontmatter");
        }
        const updatedFrontmatter = {
            ...parsed.frontmatter,
            ...updates,
            last_updated: new Date().toISOString(),
        };
        // Rebuild document
        const yamlContent = stringifyYAML(updatedFrontmatter);
        const updatedContent = `---\n${yamlContent}---\n\n${parsed.content}`;
        await writeFile(filePath, updatedContent, "utf-8");
        logger.debug({ filePath, updates }, "Updated migration document");
    }
    catch (error) {
        logger.error({ error, filePath, updates }, "Failed to update migration document");
        throw error;
    }
}
/**
 * Create migration document with frontmatter
 */
export async function createMigrationDocument(filePath, frontmatter, content) {
    try {
        const yamlContent = stringifyYAML(frontmatter);
        const documentContent = `---\n${yamlContent}---\n\n${content.trim()}`;
        await writeFile(filePath, documentContent, "utf-8");
        logger.debug({ filePath }, "Created migration document");
    }
    catch (error) {
        logger.error({ error, filePath }, "Failed to create migration document");
        throw error;
    }
}
/**
 * Extract migration ID from file path
 */
export function getMigrationIdFromPath(filePath) {
    const match = filePath.match(/migrations\/([^/]+)\.md$/);
    if (!match || !match[1]) {
        throw new Error(`Invalid migration file path: ${filePath}`);
    }
    return match[1];
}
/**
 * Get migration file path from ID
 */
export function getMigrationPath(migrationId) {
    return `migrations/${migrationId}.md`;
}
/**
 * Check if a string looks like a migration document (has frontmatter)
 */
export function hasMigrationFrontmatter(content) {
    return /^---\n[\s\S]*?\n---\n/.test(content);
}
/**
 * Extract just the content (without frontmatter) from a migration document
 */
export function extractMigrationContent(content) {
    const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    return match && match[1] ? match[1].trim() : content.trim();
}
//# sourceMappingURL=migration-document.js.map