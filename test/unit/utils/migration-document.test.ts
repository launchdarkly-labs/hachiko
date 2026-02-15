import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile, writeFile } from "node:fs/promises";

// Mock the logger
vi.mock("../../../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock the migration schema validator
vi.mock("../../../src/config/migration-schema.js", () => ({
  validateMigrationFrontmatter: vi.fn((data: any) => {
    // Simple validation - check for required fields
    return (
      data &&
      typeof data.schema_version === "number" &&
      typeof data.id === "string" &&
      typeof data.title === "string"
    );
  }),
}));

import {
  parseMigrationDocument,
  parseMigrationDocumentContent,
  updateMigrationDocument,
  createMigrationDocument,
  getMigrationIdFromPath,
  getMigrationPath,
  hasMigrationFrontmatter,
  extractMigrationContent,
} from "../../../src/utils/migration-document.js";

describe("migration-document", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseMigrationDocumentContent", () => {
    it("should parse valid migration document content", () => {
      const content = `---
schema_version: 1
id: test-migration
title: Test Migration
agent: cursor
status: active
current_step: 1
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---

# Test Migration

This is the migration content.`;

      const result = parseMigrationDocumentContent(content);

      expect(result.frontmatter.id).toBe("test-migration");
      expect(result.frontmatter.title).toBe("Test Migration");
      expect(result.frontmatter.schema_version).toBe(1);
      expect(result.content).toContain("# Test Migration");
      expect(result.content).toContain("This is the migration content.");
    });

    it("should throw error if frontmatter is missing", () => {
      const content = "# Test Migration\n\nNo frontmatter here.";

      expect(() => parseMigrationDocumentContent(content)).toThrow(
        "Migration document missing frontmatter"
      );
    });

    it("should throw error if frontmatter is invalid", () => {
      const content = `---
invalid yaml: [unclosed bracket
---

# Test Migration`;

      expect(() => parseMigrationDocumentContent(content)).toThrow(
        "Failed to parse migration frontmatter"
      );
    });

    it("should throw error if frontmatter schema is invalid", () => {
      const content = `---
invalid: data
missing: required_fields
---

# Test Migration`;

      expect(() => parseMigrationDocumentContent(content)).toThrow(
        "Failed to parse migration frontmatter"
      );
    });

    it("should handle migration with empty content", () => {
      const content = `---
schema_version: 1
id: test-migration
title: Test Migration
agent: cursor
status: active
current_step: 1
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---

`;

      const result = parseMigrationDocumentContent(content);

      expect(result.frontmatter.id).toBe("test-migration");
      expect(result.content).toBe("");
    });

    it("should handle multiline content with special characters", () => {
      const content = `---
schema_version: 1
id: test-migration
title: Test Migration
agent: cursor
status: active
current_step: 1
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---

# Test Migration

Code example:
\`\`\`typescript
const test = "value";
\`\`\`

Special chars: @#$%^&*()`;

      const result = parseMigrationDocumentContent(content);

      expect(result.content).toContain("Code example:");
      expect(result.content).toContain("Special chars:");
    });
  });

  describe("parseMigrationDocument", () => {
    it("should parse migration document from file", async () => {
      const fileContent = `---
schema_version: 1
id: test-migration
title: Test Migration
agent: cursor
status: active
current_step: 1
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---

# Test Migration`;

      vi.mocked(readFile).mockResolvedValue(fileContent);

      const result = await parseMigrationDocument("migrations/test-migration.md");

      expect(readFile).toHaveBeenCalledWith("migrations/test-migration.md", "utf-8");
      expect(result.frontmatter.id).toBe("test-migration");
    });

    it("should throw error if file cannot be read", async () => {
      vi.mocked(readFile).mockRejectedValue(new Error("File not found"));

      await expect(parseMigrationDocument("migrations/nonexistent.md")).rejects.toThrow(
        "Failed to read migration document: migrations/nonexistent.md"
      );
    });
  });

  describe("updateMigrationDocument", () => {
    const validContent = `---
schema_version: 1
id: test-migration
title: Test Migration
agent: cursor
status: active
current_step: 1
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---

# Test Migration

Original content.`;

    beforeEach(() => {
      vi.mocked(readFile).mockResolvedValue(validContent);
      vi.mocked(writeFile).mockResolvedValue(undefined);
    });

    it("should update migration document frontmatter", async () => {
      await updateMigrationDocument("migrations/test-migration.md", {
        status: "completed",
        current_step: 3,
      });

      expect(writeFile).toHaveBeenCalled();
      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;

      expect(writtenContent).toContain("status: completed");
      expect(writtenContent).toContain("current_step: 3");
      expect(writtenContent).toContain("# Test Migration");
      expect(writtenContent).toContain("last_updated:");
    });

    it("should preserve original content when updating frontmatter", async () => {
      await updateMigrationDocument("migrations/test-migration.md", {
        status: "paused",
      });

      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      expect(writtenContent).toContain("Original content.");
    });

    it("should throw error for non-v1 schema version", async () => {
      const v2Content = `---
schema_version: 2
id: test-migration
title: Test Migration
---

# Test Migration`;

      vi.mocked(readFile).mockResolvedValue(v2Content);

      await expect(
        updateMigrationDocument("migrations/test-migration.md", { status: "active" })
      ).rejects.toThrow("Can only update legacy schema version 1 frontmatter");
    });

    it("should handle file write errors", async () => {
      vi.mocked(writeFile).mockRejectedValue(new Error("Permission denied"));

      await expect(
        updateMigrationDocument("migrations/test-migration.md", { status: "active" })
      ).rejects.toThrow("Permission denied");
    });

    it("should update last_updated timestamp", async () => {
      const beforeTime = new Date().toISOString();

      await updateMigrationDocument("migrations/test-migration.md", {
        status: "completed",
      });

      const afterTime = new Date().toISOString();
      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;

      // Extract the last_updated value from the written content
      const lastUpdatedMatch = writtenContent.match(/last_updated: (.+)/);
      expect(lastUpdatedMatch).toBeTruthy();

      const lastUpdated = lastUpdatedMatch![1];
      expect(lastUpdated >= beforeTime).toBe(true);
      expect(lastUpdated <= afterTime).toBe(true);
    });
  });

  describe("createMigrationDocument", () => {
    beforeEach(() => {
      vi.mocked(writeFile).mockResolvedValue(undefined);
    });

    it("should create migration document with frontmatter and content", async () => {
      const frontmatter = {
        schema_version: 1 as const,
        id: "new-migration",
        title: "New Migration",
        agent: "cursor" as const,
        status: "active" as const,
        current_step: 1,
        total_steps: 3,
        created: "2024-01-01T00:00:00Z",
        last_updated: "2024-01-01T00:00:00Z",
      };

      const content = "# New Migration\n\nThis is a new migration.";

      await createMigrationDocument("migrations/new-migration.md", frontmatter, content);

      expect(writeFile).toHaveBeenCalledWith(
        "migrations/new-migration.md",
        expect.stringContaining("id: new-migration"),
        "utf-8"
      );

      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      expect(writtenContent).toContain("---");
      expect(writtenContent).toContain("# New Migration");
      expect(writtenContent).toContain("This is a new migration.");
    });

    it("should handle content with leading/trailing whitespace", async () => {
      const frontmatter = {
        schema_version: 1 as const,
        id: "test",
        title: "Test",
        agent: "cursor" as const,
        status: "active" as const,
        current_step: 1,
        total_steps: 1,
        created: "2024-01-01T00:00:00Z",
        last_updated: "2024-01-01T00:00:00Z",
      };

      const content = "   \n\n# Test\n\n   ";

      await createMigrationDocument("migrations/test.md", frontmatter, content);

      const writtenContent = vi.mocked(writeFile).mock.calls[0][1] as string;
      // Content should be trimmed
      expect(writtenContent).toContain("---\n\n# Test");
      expect(writtenContent).not.toContain("   \n\n# Test");
    });

    it("should throw error if file write fails", async () => {
      vi.mocked(writeFile).mockRejectedValue(new Error("Disk full"));

      const frontmatter = {
        schema_version: 1 as const,
        id: "test",
        title: "Test",
        agent: "cursor" as const,
        status: "active" as const,
        current_step: 1,
        total_steps: 1,
        created: "2024-01-01T00:00:00Z",
        last_updated: "2024-01-01T00:00:00Z",
      };

      await expect(
        createMigrationDocument("migrations/test.md", frontmatter, "Content")
      ).rejects.toThrow("Disk full");
    });
  });

  describe("getMigrationIdFromPath", () => {
    it("should extract migration ID from valid path", () => {
      expect(getMigrationIdFromPath("migrations/test-migration.md")).toBe("test-migration");
      expect(getMigrationIdFromPath("migrations/my-awesome-migration.md")).toBe(
        "my-awesome-migration"
      );
    });

    it("should throw error for invalid path", () => {
      expect(() => getMigrationIdFromPath("test.md")).toThrow("Invalid migration file path");
      expect(() => getMigrationIdFromPath("other/folder/test.md")).toThrow(
        "Invalid migration file path"
      );
      expect(() => getMigrationIdFromPath("migrations/.md")).toThrow(
        "Invalid migration file path"
      );
    });
  });

  describe("getMigrationPath", () => {
    it("should construct migration path from ID", () => {
      expect(getMigrationPath("test-migration")).toBe("migrations/test-migration.md");
      expect(getMigrationPath("my-migration")).toBe("migrations/my-migration.md");
    });
  });

  describe("hasMigrationFrontmatter", () => {
    it("should return true for content with frontmatter", () => {
      const content = `---
id: test
---

Content`;

      expect(hasMigrationFrontmatter(content)).toBe(true);
    });

    it("should return false for content without frontmatter", () => {
      expect(hasMigrationFrontmatter("# Just a heading")).toBe(false);
      expect(hasMigrationFrontmatter("Regular content")).toBe(false);
    });

    it("should return false for content with invalid frontmatter format", () => {
      expect(hasMigrationFrontmatter("--- incomplete")).toBe(false);
      expect(hasMigrationFrontmatter("---\nno closing")).toBe(false);
    });
  });

  describe("extractMigrationContent", () => {
    it("should extract content without frontmatter", () => {
      const document = `---
id: test
title: Test
---

# Migration Content

This is the actual content.`;

      const content = extractMigrationContent(document);

      expect(content).toBe("# Migration Content\n\nThis is the actual content.");
      expect(content).not.toContain("---");
      expect(content).not.toContain("id: test");
    });

    it("should return trimmed content if no frontmatter", () => {
      const content = "  \n# Just Content\n\n  ";

      expect(extractMigrationContent(content)).toBe("# Just Content");
    });

    it("should handle empty content after frontmatter", () => {
      const document = `---
id: test
---

`;

      expect(extractMigrationContent(document)).toBe("");
    });

    it("should handle content with multiple dashes", () => {
      const document = `---
id: test
---

# Content

---

More content with --- dashes`;

      const content = extractMigrationContent(document);

      expect(content).toContain("---");
      expect(content).toContain("More content with --- dashes");
      expect(content).not.toContain("id: test");
    });
  });
});
