import { describe, expect, it, vi } from "vitest";

// Mock the logger
vi.mock("../../../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  }),
}));

import {
  detectHachikoPR,
  extractMigrationId,
  validateHachikoPR,
  type PullRequest,
} from "../../../src/services/pr-detection.js";

describe("PR Detection Service", () => {
  describe("extractMigrationId", () => {
    it("should extract migration ID from branch name (method 1)", () => {
      const pr: PullRequest = {
        number: 123,
        title: "Some title",
        state: "open",
        head: { ref: "hachiko/add-jsdoc-comments" },
        labels: [],
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      expect(extractMigrationId(pr)).toBe("add-jsdoc-comments");
    });

    it("should extract migration ID from branch name with description", () => {
      const pr: PullRequest = {
        number: 123,
        title: "Some title",
        state: "open",
        head: { ref: "hachiko/add-jsdoc-comments-utility-functions" },
        labels: [],
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      expect(extractMigrationId(pr)).toBe("add-jsdoc-comments");
    });

    it("should extract migration ID from title when branch doesn't match (method 3)", () => {
      const pr: PullRequest = {
        number: 123,
        title: "[add-jsdoc-comments] Some title",
        state: "open",
        head: { ref: "feature/some-branch" },
        labels: [{ name: "bug" }, { name: "hachiko:migration" }],
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      expect(extractMigrationId(pr)).toBe("add-jsdoc-comments");
    });

    it("should extract migration ID from title (method 3)", () => {
      const pr: PullRequest = {
        number: 123,
        title: "[add-jsdoc-comments] Update utility functions",
        state: "open",
        head: { ref: "feature/some-branch" },
        labels: [],
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      expect(extractMigrationId(pr)).toBe("add-jsdoc-comments");
    });

    it("should prioritize branch name over title", () => {
      const pr: PullRequest = {
        number: 123,
        title: "[wrong-migration-id] Update utility functions",
        state: "open",
        head: { ref: "hachiko/correct-migration-id" },
        labels: [{ name: "hachiko:migration" }],
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      expect(extractMigrationId(pr)).toBe("correct-migration-id");
    });

    it("should extract migration ID from tracking token in title (method 2)", () => {
      const pr: PullRequest = {
        number: 123,
        title: "hachiko-track:improve-test-coverage:1 feat: add tests",
        state: "open",
        head: { ref: "cursor/coverage-improvement-step-1-9d93" },
        labels: [],
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      expect(extractMigrationId(pr)).toBe("improve-test-coverage");
    });

    it("should extract migration ID from tracking token with cleanup step", () => {
      const pr: PullRequest = {
        number: 124,
        title: "hachiko-track:react-migration:cleanup chore: clean up",
        state: "open",
        head: { ref: "devin/cleanup-branch-abc" },
        labels: [],
        html_url: "https://github.com/repo/pull/124",
        merged_at: null,
      };

      expect(extractMigrationId(pr)).toBe("react-migration");
    });

    it("should prioritize branch name over tracking token", () => {
      const pr: PullRequest = {
        number: 125,
        title: "hachiko-track:wrong-id:1 some changes",
        state: "open",
        head: { ref: "hachiko/correct-id-step-1" },
        labels: [],
        html_url: "https://github.com/repo/pull/125",
        merged_at: null,
      };

      expect(extractMigrationId(pr)).toBe("correct-id");
    });

    it("should return null for non-hachiko PRs", () => {
      const pr: PullRequest = {
        number: 123,
        title: "Regular PR title",
        state: "open",
        head: { ref: "feature/some-feature" },
        labels: [{ name: "enhancement" }],
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      expect(extractMigrationId(pr)).toBeNull();
    });

    it("should handle malformed branch names", () => {
      const pr: PullRequest = {
        number: 123,
        title: "Some title",
        state: "open",
        head: { ref: "hachiko/" }, // Missing migration ID
        labels: [],
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      expect(extractMigrationId(pr)).toBeNull();
    });
  });

  describe("detectHachikoPR", () => {
    it("should detect a valid Hachiko PR and return HachikoPR object", () => {
      const pr: PullRequest = {
        number: 123,
        title: "[add-jsdoc-comments] Update utility functions",
        state: "open",
        head: { ref: "hachiko/add-jsdoc-comments" },
        labels: [{ name: "hachiko:migration" }],
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      const result = detectHachikoPR(pr);

      expect(result).toEqual({
        number: 123,
        title: "[add-jsdoc-comments] Update utility functions",
        state: "open",
        migrationId: "add-jsdoc-comments",
        branch: "hachiko/add-jsdoc-comments",
        labels: ["hachiko:migration"],
        url: "https://github.com/repo/pull/123",
        merged: false,
      });
    });

    it("should return null for non-Hachiko PRs", () => {
      const pr: PullRequest = {
        number: 123,
        title: "Regular PR title",
        state: "open",
        head: { ref: "feature/some-feature" },
        labels: [{ name: "enhancement" }],
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      expect(detectHachikoPR(pr)).toBeNull();
    });
  });

  describe("validateHachikoPR", () => {
    it("should validate PR with all three identification methods", () => {
      const pr: PullRequest = {
        number: 123,
        title: "[add-jsdoc-comments] Update utility functions",
        state: "open",
        head: { ref: "hachiko/add-jsdoc-comments" },
        labels: [{ name: "hachiko:migration" }],
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      const result = validateHachikoPR(pr);

      expect(result.isValid).toBe(true);
      expect(result.migrationId).toBe("add-jsdoc-comments");
      expect(result.identificationMethods).toEqual(["branch", "label", "title"]);
      expect(result.recommendations).toEqual([]);
    });

    it("should be valid with two identification methods", () => {
      const pr: PullRequest = {
        number: 123,
        title: "[add-jsdoc-comments] Update utility functions",
        state: "open",
        head: { ref: "hachiko/add-jsdoc-comments" },
        labels: [{ name: "enhancement" }], // No hachiko label
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      const result = validateHachikoPR(pr);

      expect(result.isValid).toBe(true);
      expect(result.identificationMethods).toEqual(["branch", "title"]);
      expect(result.recommendations).toEqual([]);
    });

    it("should be invalid with only one identification method", () => {
      const pr: PullRequest = {
        number: 123,
        title: "Regular title without migration ID",
        state: "open",
        head: { ref: "hachiko/add-jsdoc-comments" },
        labels: [{ name: "enhancement" }],
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      const result = validateHachikoPR(pr);

      expect(result.isValid).toBe(false);
      expect(result.identificationMethods).toEqual(["branch"]);
      expect(result.recommendations).toContain("Add label 'hachiko:migration' to the PR");
      expect(result.recommendations).toContain(
        "Include '[{migration-id}]' somewhere in the PR title"
      );
    });

    it("should provide specific recommendations for missing conventions", () => {
      const pr: PullRequest = {
        number: 123,
        title: "Update utility functions",
        state: "open",
        head: { ref: "feature/update-utils" },
        labels: [{ name: "enhancement" }],
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      const result = validateHachikoPR(pr);

      expect(result.isValid).toBe(false);
      expect(result.identificationMethods).toEqual([]);
      expect(result.recommendations).toEqual([
        "Branch should be named 'hachiko/{migration-id}' or 'hachiko/{migration-id}-description'",
        "Add label 'hachiko:migration' to the PR",
        "Include '[{migration-id}]' somewhere in the PR title",
      ]);
    });
  });

  describe("edge cases", () => {
    it("should handle PRs with no labels gracefully", () => {
      const pr: PullRequest = {
        number: 123,
        title: "Some title",
        state: "open",
        head: { ref: "hachiko/test-migration" },
        labels: [], // Empty labels array
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      expect(extractMigrationId(pr)).toBe("test-migration");
    });

    it("should handle complex migration IDs", () => {
      const pr: PullRequest = {
        number: 123,
        title: "Some title",
        state: "open",
        head: { ref: "hachiko/react-v16-to-v18-hooks-migration" },
        labels: [],
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      expect(extractMigrationId(pr)).toBe("react-v16-to-v18-hooks-migration");
    });

    it("should handle multiple bracketed items in title", () => {
      const pr: PullRequest = {
        number: 123,
        title: "[URGENT] [migration-id] [BREAKING] Update components",
        state: "open",
        head: { ref: "feature/some-branch" },
        labels: [],
        html_url: "https://github.com/repo/pull/123",
        merged_at: null,
      };

      expect(extractMigrationId(pr)).toBe("URGENT"); // Gets first bracketed item
    });

    it("should handle closed and merged PRs", () => {
      const pr: PullRequest = {
        number: 123,
        title: "[test-migration] Update code",
        state: "closed",
        head: { ref: "hachiko/test-migration" },
        labels: [{ name: "hachiko:migration" }],
        html_url: "https://github.com/repo/pull/123",
        merged_at: "2023-01-01T00:00:00Z",
      };

      const result = detectHachikoPR(pr);

      expect(result).toBeTruthy();
      expect(result?.state).toBe("closed");
      expect(result?.merged).toBe(true);
    });
  });
});
