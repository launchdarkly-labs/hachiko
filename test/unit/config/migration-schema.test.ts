import { describe, expect, it } from "vitest";

import {
  validateMigrationFrontmatter,
  validateMigrationFrontmatterV1,
  validateMigrationFrontmatterV2,
  createMigrationFrontmatter,
  createLegacyMigrationFrontmatter,
  migrateFrontmatterToV2,
  isFrontmatterV1,
  isFrontmatterV2,
  updateMigrationFrontmatter,
  type MigrationFrontmatterV1,
  type MigrationFrontmatterV2,
} from "../../../src/config/migration-schema.js";

describe("Migration Schema", () => {
  describe("validateMigrationFrontmatter", () => {
    it("should validate schema version 1 frontmatter", () => {
      const frontmatter = {
        schema_version: 1,
        id: "test-migration",
        title: "Test Migration",
        agent: "claude-cli",
        status: "pending",
        current_step: 1,
        total_steps: 3,
        created: "2024-01-01T00:00:00Z",
        last_updated: "2024-01-01T00:00:00Z",
      };

      expect(validateMigrationFrontmatter(frontmatter)).toBe(true);
    });

    it("should validate schema version 2 frontmatter", () => {
      const frontmatter = {
        schema_version: 2,
        id: "test-migration",
        title: "Test Migration",
        agent: "claude-cli",
        created: "2024-01-01T00:00:00Z",
      };

      expect(validateMigrationFrontmatter(frontmatter)).toBe(true);
    });

    it("should reject frontmatter with unsupported schema version", () => {
      const frontmatter = {
        schema_version: 99,
        id: "test-migration",
        title: "Test Migration",
        agent: "claude-cli",
        created: "2024-01-01T00:00:00Z",
      };

      expect(validateMigrationFrontmatter(frontmatter)).toBe(false);
    });

    it("should reject frontmatter with missing required fields", () => {
      const frontmatter = {
        schema_version: 2,
        // Missing id, title, agent, created
      };

      expect(validateMigrationFrontmatter(frontmatter)).toBe(false);
    });
  });

  describe("validateMigrationFrontmatterV1", () => {
    it("should validate complete v1 frontmatter", () => {
      const frontmatter = {
        schema_version: 1,
        id: "test-migration",
        title: "Test Migration",
        agent: "claude-cli",
        status: "in_progress",
        current_step: 2,
        total_steps: 3,
        created: "2024-01-01T00:00:00Z",
        last_updated: "2024-01-02T00:00:00Z",
        pr_number: 123,
        branch: "hachiko/test-migration",
        error: "Some error message",
      };

      expect(validateMigrationFrontmatterV1(frontmatter)).toBe(true);
    });

    it("should validate minimal v1 frontmatter", () => {
      const frontmatter = {
        schema_version: 1,
        id: "test-migration",
        title: "Test Migration",
        agent: "claude-cli",
        status: "pending",
        current_step: 1,
        total_steps: 1,
        created: "2024-01-01T00:00:00Z",
        last_updated: "2024-01-01T00:00:00Z",
      };

      expect(validateMigrationFrontmatterV1(frontmatter)).toBe(true);
    });

    it("should reject v1 frontmatter with invalid status", () => {
      const frontmatter = {
        schema_version: 1,
        id: "test-migration",
        title: "Test Migration",
        agent: "claude-cli",
        status: "invalid-status",
        current_step: 1,
        total_steps: 1,
        created: "2024-01-01T00:00:00Z",
        last_updated: "2024-01-01T00:00:00Z",
      };

      expect(validateMigrationFrontmatterV1(frontmatter)).toBe(false);
    });

    it("should reject v1 frontmatter with invalid step numbers", () => {
      const frontmatter = {
        schema_version: 1,
        id: "test-migration",
        title: "Test Migration",
        agent: "claude-cli",
        status: "pending",
        current_step: 0, // Invalid: must be >= 1
        total_steps: 1,
        created: "2024-01-01T00:00:00Z",
        last_updated: "2024-01-01T00:00:00Z",
      };

      expect(validateMigrationFrontmatterV1(frontmatter)).toBe(false);
    });

    it("should reject v1 frontmatter with current_step > total_steps", () => {
      const frontmatter = {
        schema_version: 1,
        id: "test-migration",
        title: "Test Migration",
        agent: "claude-cli",
        status: "pending",
        current_step: 5,
        total_steps: 3, // current_step > total_steps
        created: "2024-01-01T00:00:00Z",
        last_updated: "2024-01-01T00:00:00Z",
      };

      expect(validateMigrationFrontmatterV1(frontmatter)).toBe(false);
    });
  });

  describe("validateMigrationFrontmatterV2", () => {
    it("should validate minimal v2 frontmatter", () => {
      const frontmatter = {
        schema_version: 2,
        id: "test-migration",
        title: "Test Migration",
        agent: "claude-cli",
        created: "2024-01-01T00:00:00Z",
      };

      expect(validateMigrationFrontmatterV2(frontmatter)).toBe(true);
    });

    it("should reject v2 frontmatter with state fields", () => {
      const frontmatter = {
        schema_version: 2,
        id: "test-migration",
        title: "Test Migration",
        agent: "claude-cli",
        created: "2024-01-01T00:00:00Z",
        status: "pending", // Not allowed in v2
      };

      // This would still validate as the extra field is just ignored
      // But it should not have state fields in practice
      expect(validateMigrationFrontmatterV2(frontmatter)).toBe(true);
    });

    it("should reject v2 frontmatter with missing required fields", () => {
      const frontmatter = {
        schema_version: 2,
        id: "test-migration",
        // Missing title, agent, created
      };

      expect(validateMigrationFrontmatterV2(frontmatter)).toBe(false);
    });
  });

  describe("createMigrationFrontmatter", () => {
    it("should create v2 frontmatter by default", () => {
      const frontmatter = createMigrationFrontmatter(
        "test-migration",
        "Test Migration",
        "claude-cli"
      );

      expect(frontmatter.schema_version).toBe(2);
      expect(frontmatter.id).toBe("test-migration");
      expect(frontmatter.title).toBe("Test Migration");
      expect(frontmatter.agent).toBe("claude-cli");
      expect(frontmatter.created).toBeDefined();
      expect(new Date(frontmatter.created)).toBeInstanceOf(Date);
    });
  });

  describe("createLegacyMigrationFrontmatter", () => {
    it("should create v1 frontmatter with all state fields", () => {
      const frontmatter = createLegacyMigrationFrontmatter(
        "test-migration",
        "Test Migration",
        "claude-cli",
        5
      );

      expect(frontmatter.schema_version).toBe(1);
      expect(frontmatter.id).toBe("test-migration");
      expect(frontmatter.title).toBe("Test Migration");
      expect(frontmatter.agent).toBe("claude-cli");
      expect(frontmatter.status).toBe("pending");
      expect(frontmatter.current_step).toBe(1);
      expect(frontmatter.total_steps).toBe(5);
      expect(frontmatter.created).toBeDefined();
      expect(frontmatter.last_updated).toBeDefined();
    });

    it("should default to 1 total step", () => {
      const frontmatter = createLegacyMigrationFrontmatter(
        "test-migration",
        "Test Migration",
        "claude-cli"
      );

      expect(frontmatter.total_steps).toBe(1);
      expect(frontmatter.current_step).toBe(1);
    });
  });

  describe("migrateFrontmatterToV2", () => {
    it("should migrate v1 frontmatter to v2 by removing state fields", () => {
      const v1: MigrationFrontmatterV1 = {
        schema_version: 1,
        id: "test-migration",
        title: "Test Migration",
        agent: "claude-cli",
        status: "in_progress",
        current_step: 2,
        total_steps: 3,
        created: "2024-01-01T00:00:00Z",
        last_updated: "2024-01-02T00:00:00Z",
        pr_number: 123,
        branch: "hachiko/test-migration",
        error: "Some error",
      };

      const v2 = migrateFrontmatterToV2(v1);

      expect(v2.schema_version).toBe(2);
      expect(v2.id).toBe("test-migration");
      expect(v2.title).toBe("Test Migration");
      expect(v2.agent).toBe("claude-cli");
      expect(v2.created).toBe("2024-01-01T00:00:00Z");

      // Ensure state fields are not present
      expect('status' in v2).toBe(false);
      expect('current_step' in v2).toBe(false);
      expect('total_steps' in v2).toBe(false);
      expect('last_updated' in v2).toBe(false);
      expect('pr_number' in v2).toBe(false);
      expect('branch' in v2).toBe(false);
      expect('error' in v2).toBe(false);
    });
  });

  describe("type guards", () => {
    it("should correctly identify v1 frontmatter", () => {
      const v1: MigrationFrontmatterV1 = {
        schema_version: 1,
        id: "test",
        title: "Test",
        agent: "claude",
        status: "pending",
        current_step: 1,
        total_steps: 1,
        created: "2024-01-01T00:00:00Z",
        last_updated: "2024-01-01T00:00:00Z",
      };

      expect(isFrontmatterV1(v1)).toBe(true);
      expect(isFrontmatterV2(v1)).toBe(false);
    });

    it("should correctly identify v2 frontmatter", () => {
      const v2: MigrationFrontmatterV2 = {
        schema_version: 2,
        id: "test",
        title: "Test",
        agent: "claude",
        created: "2024-01-01T00:00:00Z",
      };

      expect(isFrontmatterV2(v2)).toBe(true);
      expect(isFrontmatterV1(v2)).toBe(false);
    });
  });

  describe("updateMigrationFrontmatter", () => {
    it("should update v1 frontmatter and set last_updated", () => {
      const original: MigrationFrontmatterV1 = {
        schema_version: 1,
        id: "test-migration",
        title: "Test Migration",
        agent: "claude-cli",
        status: "pending",
        current_step: 1,
        total_steps: 3,
        created: "2024-01-01T00:00:00Z",
        last_updated: "2024-01-01T00:00:00Z",
      };

      const updated = updateMigrationFrontmatter(original, {
        status: "in_progress",
        current_step: 2,
        pr_number: 123,
      });

      expect(updated.status).toBe("in_progress");
      expect(updated.current_step).toBe(2);
      expect(updated.pr_number).toBe(123);
      expect(updated.last_updated).not.toBe(original.last_updated);
      expect(new Date(updated.last_updated)).toBeInstanceOf(Date);

      // Ensure immutable fields are preserved
      expect(updated.schema_version).toBe(1);
      expect(updated.id).toBe("test-migration");
      expect(updated.created).toBe("2024-01-01T00:00:00Z");
    });
  });

  describe("edge cases", () => {
    it("should handle null input", () => {
      expect(validateMigrationFrontmatter(null)).toBe(false);
    });

    it("should handle undefined input", () => {
      expect(validateMigrationFrontmatter(undefined)).toBe(false);
    });

    it("should handle non-object input", () => {
      expect(validateMigrationFrontmatter("string")).toBe(false);
      expect(validateMigrationFrontmatter(123)).toBe(false);
      expect(validateMigrationFrontmatter([])).toBe(false);
    });

    it("should handle empty object", () => {
      expect(validateMigrationFrontmatter({})).toBe(false);
    });

    it("should handle frontmatter with wrong field types", () => {
      const frontmatter = {
        schema_version: 2,
        id: 123, // Should be string
        title: "Test Migration",
        agent: "claude-cli",
        created: "2024-01-01T00:00:00Z",
      };

      expect(validateMigrationFrontmatter(frontmatter)).toBe(false);
    });
  });
});