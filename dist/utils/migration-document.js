/**
 * Utilities for parsing and manipulating Hachiko migration documents.
 *
 * Migration documents are Markdown files with YAML frontmatter that define
 * the plan, steps, and metadata for automated code migrations.
 */
import { readFile, writeFile } from "node:fs/promises";
import { parse as parseYAML, stringify as stringifyYAML } from "yaml";
import { validateMigrationFrontmatter } from "../config/migration-schema.js";
import { createLogger } from "./logger.js";
const logger = createLogger("migration-document");
/**
 * Reads and parses a migration document file from disk.
 *
 * Loads the file content and delegates to {@link parseMigrationDocumentContent}
 * for frontmatter extraction and validation.
 *
 * @param filePath - Absolute or relative path to the migration markdown file
 * @returns The parsed document with frontmatter, content, and raw YAML
 * @throws {Error} If the file cannot be read or the document format is invalid
 *
 * @example
 * ```typescript
 * const doc = await parseMigrationDocument('migrations/add-jsdoc-comments.md');
 * console.log(doc.frontmatter.id); // 'add-jsdoc-comments'
 * ```
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
 * Parses migration document content from a raw string.
 *
 * Extracts YAML frontmatter delimited by `---` markers, validates it against
 * the migration schema, and returns the separated components.
 *
 * @param content - The full migration document content including frontmatter
 * @returns The parsed document with frontmatter, content, and raw YAML
 * @throws {Error} If the document is missing frontmatter, has invalid YAML, or fails schema validation
 *
 * @example
 * ```typescript
 * const raw = '---\nid: my-migration\ntitle: My Migration\n---\n# Plan\n...';
 * const doc = parseMigrationDocumentContent(raw);
 * console.log(doc.frontmatter.title); // 'My Migration'
 * ```
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
 * Updates the frontmatter of an existing migration document on disk.
 *
 * Reads the document, merges the provided updates into the frontmatter
 * (automatically setting `last_updated` to the current timestamp),
 * and writes the updated document back to disk. Only supports schema version 1.
 *
 * @param filePath - Path to the migration document to update
 * @param updates - Partial frontmatter fields to merge (cannot change schema_version, id, or created)
 * @throws {Error} If the file cannot be read/written, or the schema version is not 1
 *
 * @example
 * ```typescript
 * await updateMigrationDocument('migrations/add-jsdoc.md', {
 *   status: 'active',
 *   current_step: 2
 * });
 * ```
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
 * Creates a new migration document file with the given frontmatter and content.
 *
 * Serializes the frontmatter to YAML and combines it with the markdown content
 * to produce a complete migration document.
 *
 * @param filePath - Path where the new migration document will be written
 * @param frontmatter - The complete frontmatter metadata for the migration
 * @param content - The markdown body content for the migration document
 * @throws {Error} If the file cannot be written
 *
 * @example
 * ```typescript
 * await createMigrationDocument('migrations/new-migration.md', {
 *   schema_version: 1,
 *   id: 'new-migration',
 *   title: 'New Migration',
 *   agent: 'devin',
 *   status: 'pending',
 *   current_step: 1,
 *   total_steps: 3,
 *   created: new Date().toISOString(),
 *   last_updated: new Date().toISOString()
 * }, '# New Migration\n\nDescription here...');
 * ```
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
 * Extracts the migration ID from a migration document file path.
 *
 * Parses the filename (without extension) from a path matching the
 * `migrations/{id}.md` pattern.
 *
 * @param filePath - The file path to extract the ID from
 * @returns The migration identifier (e.g., "add-jsdoc-comments")
 * @throws {Error} If the path doesn't match the expected migrations directory pattern
 *
 * @example
 * ```typescript
 * getMigrationIdFromPath('migrations/add-jsdoc-comments.md');
 * // Returns: 'add-jsdoc-comments'
 * ```
 */
export function getMigrationIdFromPath(filePath) {
    const match = filePath.match(/migrations\/([^/]+)\.md$/);
    if (!match || !match[1]) {
        throw new Error(`Invalid migration file path: ${filePath}`);
    }
    return match[1];
}
/**
 * Constructs the file path for a migration document from its ID.
 *
 * @param migrationId - The migration identifier
 * @returns The relative file path to the migration document
 *
 * @example
 * ```typescript
 * getMigrationPath('add-jsdoc-comments');
 * // Returns: 'migrations/add-jsdoc-comments.md'
 * ```
 */
export function getMigrationPath(migrationId) {
    return `migrations/${migrationId}.md`;
}
/**
 * Checks if a string contains YAML frontmatter indicating a migration document.
 *
 * Tests whether the content starts with `---` delimiters enclosing YAML content,
 * which is the expected format for migration documents.
 *
 * @param content - The string content to check
 * @returns True if the content begins with valid frontmatter delimiters
 *
 * @example
 * ```typescript
 * hasMigrationFrontmatter('---\nid: test\n---\n# Content');
 * // Returns: true
 *
 * hasMigrationFrontmatter('# Just a regular markdown file');
 * // Returns: false
 * ```
 */
export function hasMigrationFrontmatter(content) {
    return /^---\n[\s\S]*?\n---\n/.test(content);
}
/**
 * Extracts the markdown body content from a migration document, stripping the frontmatter.
 *
 * If the content contains frontmatter delimiters, returns everything after the
 * closing `---`. If no frontmatter is found, returns the trimmed original content.
 *
 * @param content - The full migration document content including frontmatter
 * @returns The markdown content without the YAML frontmatter block
 *
 * @example
 * ```typescript
 * extractMigrationContent('---\nid: test\n---\n# My Migration\nDetails...');
 * // Returns: '# My Migration\nDetails...'
 *
 * extractMigrationContent('# No frontmatter here');
 * // Returns: '# No frontmatter here'
 * ```
 */
export function extractMigrationContent(content) {
    const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
    return match && match[1] ? match[1].trim() : content.trim();
}
//# sourceMappingURL=migration-document.js.map