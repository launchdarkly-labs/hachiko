/**
 * Utilities for parsing and manipulating Hachiko migration documents.
 *
 * Migration documents are Markdown files with YAML frontmatter that define
 * the plan, steps, and metadata for automated code migrations.
 */
import type { MigrationFrontmatter } from "../config/migration-schema.js";
/**
 * Represents a parsed migration document with separated frontmatter and content.
 *
 * @example
 * ```typescript
 * const doc: ParsedMigrationDocument = {
 *   frontmatter: { id: 'add-jsdoc', title: 'Add JSDoc', schema_version: 1, ... },
 *   content: '# Migration Plan\n...',
 *   rawFrontmatter: 'id: add-jsdoc\ntitle: Add JSDoc\n...'
 * };
 * ```
 */
export interface ParsedMigrationDocument {
    /** The validated and typed frontmatter metadata */
    frontmatter: MigrationFrontmatter;
    /** The markdown content below the frontmatter */
    content: string;
    /** The raw YAML string of the frontmatter before parsing */
    rawFrontmatter: string;
}
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
export declare function parseMigrationDocument(filePath: string): Promise<ParsedMigrationDocument>;
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
export declare function parseMigrationDocumentContent(content: string): ParsedMigrationDocument;
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
export declare function updateMigrationDocument(filePath: string, updates: Partial<Omit<MigrationFrontmatter, "schema_version" | "id" | "created">>): Promise<void>;
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
export declare function createMigrationDocument(filePath: string, frontmatter: MigrationFrontmatter, content: string): Promise<void>;
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
export declare function getMigrationIdFromPath(filePath: string): string;
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
export declare function getMigrationPath(migrationId: string): string;
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
export declare function hasMigrationFrontmatter(content: string): boolean;
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
export declare function extractMigrationContent(content: string): string;
//# sourceMappingURL=migration-document.d.ts.map