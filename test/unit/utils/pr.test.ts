import { describe, expect, it } from "vitest";
import {
  extractHachikoLabels,
  extractMigrationMetadata,
  generateMigrationPRBody,
  generateMigrationPRLabels,
  generateMigrationPRTitle,
  isMigrationPR,
} from "../../../src/utils/pr.js";

describe("PR utilities", () => {
  describe("isMigrationPR", () => {
    it("should return true for PRs with hachiko labels", () => {
      const pr = { labels: [{ name: "hachiko" }, { name: "bug" }] };
      expect(isMigrationPR(pr)).toBe(true);
    });

    it("should return true for PRs with migration labels", () => {
      const pr = { labels: [{ name: "migration:upgrade" }, { name: "bug" }] };
      expect(isMigrationPR(pr)).toBe(true);
    });

    it("should return false for PRs without hachiko or migration labels", () => {
      const pr = { labels: [{ name: "bug" }, { name: "enhancement" }] };
      expect(isMigrationPR(pr)).toBe(false);
    });

    it("should return false for PRs without labels", () => {
      const pr = {};
      expect(isMigrationPR(pr)).toBe(false);
    });

    it("should return false for PRs with undefined labels", () => {
      const pr = { labels: undefined };
      expect(isMigrationPR(pr)).toBe(false);
    });
  });

  describe("extractHachikoLabels", () => {
    it("should extract hachiko-prefixed labels", () => {
      const pr = {
        labels: [
          { name: "hachiko:plan:upgrade-junit" },
          { name: "hachiko:step:step-1" },
          { name: "bug" },
          { name: "migration:react" },
        ],
      };
      const result = extractHachikoLabels(pr);
      expect(result).toEqual([
        "hachiko:plan:upgrade-junit",
        "hachiko:step:step-1",
        "migration:react",
      ]);
    });

    it("should return empty array when no hachiko labels", () => {
      const pr = { labels: [{ name: "bug" }, { name: "enhancement" }] };
      const result = extractHachikoLabels(pr);
      expect(result).toEqual([]);
    });

    it("should return empty array when no labels", () => {
      const pr = {};
      const result = extractHachikoLabels(pr);
      expect(result).toEqual([]);
    });
  });

  describe("extractMigrationMetadata", () => {
    it("should extract metadata from hachiko step labels", () => {
      const pr = {
        labels: [{ name: "hachiko:step:upgrade-junit:update-deps" }, { name: "bug" }],
      };
      const result = extractMigrationMetadata(pr);
      expect(result).toEqual({
        planId: "upgrade-junit",
        stepId: "update-deps",
        chunk: undefined,
      });
    });

    it("should extract metadata with chunk from labels", () => {
      const pr = {
        labels: [{ name: "hachiko:step:upgrade-junit:update-deps:src/main" }],
      };
      const result = extractMigrationMetadata(pr);
      expect(result).toEqual({
        planId: "upgrade-junit",
        stepId: "update-deps",
        chunk: "src/main",
      });
    });

    it("should fall back to branch name parsing when no step label found", () => {
      const pr = {
        labels: [{ name: "hachiko" }],
        head: { ref: "hachi/upgrade-junit/update-deps" },
      };
      const result = extractMigrationMetadata(pr);
      expect(result).toEqual({
        planId: "upgrade-junit",
        stepId: "update-deps",
        chunk: undefined,
      });
    });

    it("should fall back to branch name parsing with chunk", () => {
      const pr = {
        labels: [{ name: "hachiko" }],
        head: { ref: "hachi/upgrade-junit/update-deps/src/main" },
      };
      const result = extractMigrationMetadata(pr);
      expect(result).toEqual({
        planId: "upgrade-junit",
        stepId: "update-deps",
        chunk: "src/main",
      });
    });

    it("should return null when branch name parsing fails", () => {
      const pr = {
        labels: [{ name: "hachiko" }],
        head: { ref: "feature/not-a-migration-branch" },
      };
      const result = extractMigrationMetadata(pr);
      expect(result).toBeNull();
    });

    it("should return null when no metadata available", () => {
      const pr = { labels: [{ name: "bug" }] };
      const result = extractMigrationMetadata(pr);
      expect(result).toBeNull();
    });

    it("should return null for invalid step label format", () => {
      const pr = {
        labels: [{ name: "hachiko:step:invalid-format" }],
      };
      const result = extractMigrationMetadata(pr);
      expect(result).toBeNull();
    });
  });

  describe("generateMigrationPRLabels", () => {
    it("should generate basic labels without chunk", () => {
      const result = generateMigrationPRLabels("upgrade-junit", "update-deps");
      expect(result).toEqual([
        "hachiko",
        "migration",
        "hachiko:plan:upgrade-junit",
        "hachiko:step:upgrade-junit:update-deps",
      ]);
    });

    it("should generate labels with chunk", () => {
      const result = generateMigrationPRLabels("upgrade-junit", "update-deps", "src/main");
      expect(result).toEqual([
        "hachiko",
        "migration",
        "hachiko:plan:upgrade-junit",
        "hachiko:step:upgrade-junit:update-deps:src/main",
      ]);
    });

    it("should include additional labels", () => {
      const result = generateMigrationPRLabels("upgrade-junit", "update-deps", undefined, [
        "breaking-change",
        "needs-review",
      ]);
      expect(result).toEqual([
        "hachiko",
        "migration",
        "hachiko:plan:upgrade-junit",
        "hachiko:step:upgrade-junit:update-deps",
        "breaking-change",
        "needs-review",
      ]);
    });
  });

  describe("generateMigrationPRTitle", () => {
    it("should generate title without chunk", () => {
      const result = generateMigrationPRTitle("Upgrade JUnit to 5.x", "Update Maven dependencies");
      expect(result).toBe("Hachiko: Upgrade JUnit to 5.x - Update Maven dependencies");
    });

    it("should generate title with chunk", () => {
      const result = generateMigrationPRTitle(
        "Upgrade JUnit to 5.x",
        "Update test files",
        "src/test/java"
      );
      expect(result).toBe("Hachiko: Upgrade JUnit to 5.x - Update test files (src/test/java)");
    });
  });

  describe("generateMigrationPRBody", () => {
    it("should generate basic PR body", () => {
      const result = generateMigrationPRBody(
        "upgrade-junit",
        "update-deps",
        "Update Maven dependencies to JUnit 5"
      );

      expect(result).toContain("This pull request was automatically generated by Hachiko");
      expect(result).toContain("**Step**: update-deps");
      expect(result).toContain("**Description**: Update Maven dependencies to JUnit 5");
      expect(result).toContain("**Plan**: upgrade-junit");
      expect(result).toContain("Review Checklist");
      expect(result).toContain("Generated by [Hachiko]");
    });

    it("should include chunk when provided", () => {
      const result = generateMigrationPRBody(
        "upgrade-junit",
        "update-tests",
        "Update test files",
        undefined,
        "src/test"
      );

      expect(result).toContain("**Chunk**: src/test");
    });

    it("should include plan URL when provided", () => {
      const result = generateMigrationPRBody(
        "upgrade-junit",
        "update-deps",
        "Update dependencies",
        "https://github.com/example/repo/blob/main/migrations/upgrade-junit.md"
      );

      expect(result).toContain(
        "**Plan**: [upgrade-junit](https://github.com/example/repo/blob/main/migrations/upgrade-junit.md)"
      );
    });

    it("should include prompt version when provided", () => {
      const result = generateMigrationPRBody(
        "upgrade-junit",
        "update-deps",
        "Update dependencies",
        undefined,
        undefined,
        "v1.2.3"
      );

      expect(result).toContain("**Prompt Version**: v1.2.3");
    });

    it("should include all optional fields when provided", () => {
      const result = generateMigrationPRBody(
        "upgrade-junit",
        "update-tests",
        "Update test files",
        "https://example.com/plan",
        "src/test",
        "v2.0.0"
      );

      expect(result).toContain("**Chunk**: src/test");
      expect(result).toContain("**Plan**: [upgrade-junit](https://example.com/plan)");
      expect(result).toContain("**Prompt Version**: v2.0.0");
    });
  });
});
