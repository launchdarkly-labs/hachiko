/**
 * Utilities for parsing and manipulating migration documents
 */
import type { MigrationFrontmatter } from "../config/migration-schema.js";
export interface ParsedMigrationDocument {
    frontmatter: MigrationFrontmatter;
    content: string;
    rawFrontmatter: string;
}
/**
 * Parse a migration document file
 */
export declare function parseMigrationDocument(filePath: string): Promise<ParsedMigrationDocument>;
/**
 * Parse migration document content string
 */
export declare function parseMigrationDocumentContent(content: string): ParsedMigrationDocument;
/**
 * Update migration document frontmatter
 */
export declare function updateMigrationDocument(filePath: string, updates: Partial<Omit<MigrationFrontmatter, "schema_version" | "id" | "created">>): Promise<void>;
/**
 * Create migration document with frontmatter
 */
export declare function createMigrationDocument(filePath: string, frontmatter: MigrationFrontmatter, content: string): Promise<void>;
/**
 * Extract migration ID from file path
 */
export declare function getMigrationIdFromPath(filePath: string): string;
/**
 * Get migration file path from ID
 */
export declare function getMigrationPath(migrationId: string): string;
/**
 * Check if a string looks like a migration document (has frontmatter)
 */
export declare function hasMigrationFrontmatter(content: string): boolean;
/**
 * Extract just the content (without frontmatter) from a migration document
 */
export declare function extractMigrationContent(content: string): string;
//# sourceMappingURL=migration-document.d.ts.map