/**
 * Utilities for parsing and manipulating migration documents.
 *
 * Migration documents are Markdown files with YAML frontmatter that define
 * the plan, steps, and metadata for automated code migrations managed by Hachiko.
 */
import type { MigrationFrontmatter } from "../config/migration-schema.js";
export interface ParsedMigrationDocument {
    frontmatter: MigrationFrontmatter;
    content: string;
    rawFrontmatter: string;
}
/**
 * Parses a migration document file from disk.
 *
 * Reads the file at the given path and extracts the YAML frontmatter
 * and Markdown content.
 *
 * @param filePath - Absolute or relative path to the migration document
 * @returns The parsed migration document with frontmatter, content, and raw frontmatter
 * @throws {Error} If the file cannot be read or has invalid structure
 * @example
 * ```typescript
 * const doc = await parseMigrationDocument('migrations/add-jsdoc-comments.md');
 * console.log(doc.frontmatter.id); // 'add-jsdoc-comments'
 * console.log(doc.frontmatter.status); // 'active'
 * ```
 */
export declare function parseMigrationDocument(filePath: string): Promise<ParsedMigrationDocument>;
/**
 * Parses migration document content from a string.
 *
 * Extracts YAML frontmatter delimited by `---` markers and validates it
 * against the migration frontmatter schema.
 *
 * @param content - The full migration document content including frontmatter
 * @returns The parsed migration document with frontmatter, content, and raw frontmatter
 * @throws {Error} If the content is missing frontmatter or has an invalid schema
 * @example
 * ```typescript
 * const content = '---\nid: my-migration\ntitle: My Migration\n---\n# My Migration\n...';
 * const doc = parseMigrationDocumentContent(content);
 * console.log(doc.frontmatter.title); // 'My Migration'
 * ```
 */
export declare function parseMigrationDocumentContent(content: string): ParsedMigrationDocument;
/**
 * Updates the frontmatter of an existing migration document on disk.
 *
 * Reads the document, merges the provided updates into the existing frontmatter,
 * sets the `last_updated` timestamp, and writes the result back. Only supports
 * schema version 1 documents.
 *
 * @param filePath - Path to the migration document to update
 * @param updates - Partial frontmatter fields to merge (cannot update schema_version, id, or created)
 * @throws {Error} If the document cannot be read, parsed, or is not schema version 1
 * @example
 * ```typescript
 * await updateMigrationDocument('migrations/add-jsdoc-comments.md', {
 *   status: 'active',
 *   current_step: 2
 * });
 * ```
 */
export declare function updateMigrationDocument(filePath: string, updates: Partial<Omit<MigrationFrontmatter, "schema_version" | "id" | "created">>): Promise<void>;
/**
 * Creates a new migration document file with frontmatter and content.
 *
 * @param filePath - Path where the migration document should be written
 * @param frontmatter - The YAML frontmatter metadata for the migration
 * @param content - The Markdown body content of the migration document
 * @throws {Error} If the file cannot be written
 * @example
 * ```typescript
 * await createMigrationDocument(
 *   'migrations/new-migration.md',
 *   { schema_version: 1, id: 'new-migration', title: 'New Migration', agent: 'cursor', status: 'pending' },
 *   '# New Migration\n\nDescription of what this migration does.'
 * );
 * ```
 */
export declare function createMigrationDocument(filePath: string, frontmatter: MigrationFrontmatter, content: string): Promise<void>;
/**
 * Extracts the migration ID from a migration document file path.
 *
 * The migration ID is derived from the filename by stripping the `migrations/`
 * prefix and `.md` extension.
 *
 * @param filePath - The file path to extract the ID from (e.g., "migrations/add-jsdoc.md")
 * @returns The migration ID (e.g., "add-jsdoc")
 * @throws {Error} If the path doesn't match the expected `migrations/*.md` pattern
 * @example
 * ```typescript
 * getMigrationIdFromPath('migrations/add-jsdoc-comments.md');
 * // Returns: 'add-jsdoc-comments'
 * ```
 */
export declare function getMigrationIdFromPath(filePath: string): string;
/**
 * Constructs the file path for a migration document given its ID.
 *
 * @param migrationId - The unique migration identifier
 * @returns The relative file path to the migration document
 * @example
 * ```typescript
 * getMigrationPath('add-jsdoc-comments');
 * // Returns: 'migrations/add-jsdoc-comments.md'
 * ```
 */
export declare function getMigrationPath(migrationId: string): string;
/**
 * Checks if a string contains YAML frontmatter delimiters.
 *
 * Tests whether the content starts with a `---` delimited YAML block,
 * which indicates it is a structured migration document rather than plain Markdown.
 *
 * @param content - The document content to check
 * @returns True if the content starts with a YAML frontmatter block, false otherwise
 * @example
 * ```typescript
 * hasMigrationFrontmatter('---\nid: test\n---\n# Content');
 * // Returns: true
 *
 * hasMigrationFrontmatter('# Just a heading');
 * // Returns: false
 * ```
 */
export declare function hasMigrationFrontmatter(content: string): boolean;
/**
 * Extracts the Markdown body content from a migration document, stripping frontmatter.
 *
 * If the content contains YAML frontmatter, it is removed and only the body
 * is returned. If no frontmatter is detected, the original content is returned trimmed.
 *
 * @param content - The full migration document content including frontmatter
 * @returns The document body without the YAML frontmatter block
 * @example
 * ```typescript
 * extractMigrationContent('---\nid: test\n---\n# My Migration\nDetails here.');
 * // Returns: '# My Migration\nDetails here.'
 *
 * extractMigrationContent('# No frontmatter');
 * // Returns: '# No frontmatter'
 * ```
 */
export declare function extractMigrationContent(content: string): string;
//# sourceMappingURL=migration-document.d.ts.map