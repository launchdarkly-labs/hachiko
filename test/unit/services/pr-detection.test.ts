import { beforeEach, describe, expect, it, vi } from "vitest";

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
  getOpenHachikoPRs,
  getClosedHachikoPRs,
  getHachikoPRs,
  getAllOpenHachikoPRs,
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

    it("should extract migration ID from tracking token in PR body (method 2 - preferred)", () => {
      const pr: PullRequest = {
        number: 141,
        title: "Test coverage step 1",
        body: "<!-- hachiko-track:improve-test-coverage:1 -->\n## Migration Progress\nAdding tests...",
        state: "open",
        head: { ref: "cursor/test-coverage-step-1-f46a" },
        labels: [{ name: "hachiko:migration" }],
        html_url: "https://github.com/repo/pull/141",
        merged_at: null,
      };

      expect(extractMigrationId(pr)).toBe("improve-test-coverage");
    });

    it("should NOT match tracking tokens in plain text (only HTML comments)", () => {
      const pr: PullRequest = {
        number: 142,
        title: "Fix PR detection",
        body: "The tracking token `hachiko-track:improve-test-coverage:1` is mentioned as an example.",
        state: "open",
        head: { ref: "fix/some-fix" },
        labels: [],
        html_url: "https://github.com/repo/pull/142",
        merged_at: null,
      };

      expect(extractMigrationId(pr)).toBeNull();
    });

    it("should extract migration ID from tracking token in title (method 3 - fallback)", () => {
      const pr: PullRequest = {
        number: 123,
        title: "hachiko-track:improve-test-coverage:1 feat: add tests",
        body: null,
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
        body: null,
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
        body: "<!-- hachiko-track:another-wrong-id:2 -->",
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

  describe("async GitHub API functions", () => {
    let mockContext: any;
    let mockOctokit: any;

    beforeEach(() => {
      mockOctokit = {
        pulls: {
          list: vi.fn(),
          listCommits: vi.fn(),
        },
      };

      mockContext = {
        octokit: mockOctokit,
        payload: {
          repository: {
            owner: { login: "test-owner" },
            name: "test-repo",
          },
        },
      };
    });

    describe("getOpenHachikoPRs", () => {
      it("should get all open PRs for a migration", async () => {
        const mockPRs = [
          {
            number: 1,
            title: "Test PR 1",
            body: null,
            state: "open",
            head: { ref: "hachiko/test-migration-step-1" },
            labels: [{ name: "hachiko:migration" }],
            html_url: "https://github.com/test/repo/pull/1",
            merged_at: null,
          },
          {
            number: 2,
            title: "Test PR 2",
            body: null,
            state: "open",
            head: { ref: "hachiko/test-migration-step-2" },
            labels: [{ name: "hachiko:migration" }],
            html_url: "https://github.com/test/repo/pull/2",
            merged_at: null,
          },
          {
            number: 3,
            title: "Other PR",
            body: null,
            state: "open",
            head: { ref: "feature/other" },
            labels: [],
            html_url: "https://github.com/test/repo/pull/3",
            merged_at: null,
          },
        ];

        mockOctokit.pulls.list.mockResolvedValue({ data: mockPRs });

        const result = await getOpenHachikoPRs(mockContext, "test-migration");

        expect(mockOctokit.pulls.list).toHaveBeenCalledWith({
          owner: "test-owner",
          repo: "test-repo",
          state: "open",
          per_page: 100,
        });

        expect(result).toHaveLength(2);
        expect(result[0].number).toBe(1);
        expect(result[1].number).toBe(2);
        expect(result[0].migrationId).toBe("test-migration");
      });

      it("should return empty array when no matching PRs found", async () => {
        mockOctokit.pulls.list.mockResolvedValue({ data: [] });

        const result = await getOpenHachikoPRs(mockContext, "nonexistent-migration");

        expect(result).toHaveLength(0);
      });

      it("should throw error when API call fails", async () => {
        mockOctokit.pulls.list.mockRejectedValue(new Error("API Error"));

        await expect(getOpenHachikoPRs(mockContext, "test-migration")).rejects.toThrow(
          "API Error"
        );
      });
    });

    describe("getClosedHachikoPRs", () => {
      it("should get all closed PRs for a migration", async () => {
        const mockPRs = [
          {
            number: 1,
            title: "Test PR 1",
            body: null,
            state: "closed",
            head: { ref: "hachiko/test-migration-step-1" },
            labels: [{ name: "hachiko:migration" }],
            html_url: "https://github.com/test/repo/pull/1",
            merged_at: "2024-01-01T00:00:00Z",
          },
        ];

        mockOctokit.pulls.list.mockResolvedValue({ data: mockPRs });

        const result = await getClosedHachikoPRs(mockContext, "test-migration");

        expect(mockOctokit.pulls.list).toHaveBeenCalledWith({
          owner: "test-owner",
          repo: "test-repo",
          state: "closed",
          per_page: 100,
        });

        expect(result).toHaveLength(1);
        expect(result[0].state).toBe("closed");
        expect(result[0].merged).toBe(true);
      });
    });

    describe("getHachikoPRs", () => {
      it("should get PRs with matching branch prefix", async () => {
        const mockPRs = [
          {
            number: 1,
            title: "Test PR",
            body: null,
            state: "open",
            head: { ref: "hachiko/test-migration-step-1" },
            labels: [],
            html_url: "https://github.com/test/repo/pull/1",
            merged_at: null,
          },
        ];

        mockOctokit.pulls.list.mockResolvedValue({ data: mockPRs });

        const result = await getHachikoPRs(mockContext, "test-migration", "open");

        expect(result).toHaveLength(1);
        expect(result[0].migrationId).toBe("test-migration");
      });

      it("should detect PRs with hachiko:migration label", async () => {
        const mockPRs = [
          {
            number: 1,
            title: "[test-migration] Test PR",
            body: null,
            state: "open",
            head: { ref: "feature/some-branch" },
            labels: [{ name: "hachiko:migration" }],
            html_url: "https://github.com/test/repo/pull/1",
            merged_at: null,
          },
        ];

        mockOctokit.pulls.list.mockResolvedValue({ data: mockPRs });

        const result = await getHachikoPRs(mockContext, "test-migration", "open");

        expect(result).toHaveLength(1);
        expect(result[0].migrationId).toBe("test-migration");
      });

      it("should detect PRs via commit tracking tokens", async () => {
        const mockPRs = [
          {
            number: 1,
            title: "Test PR",
            body: null,
            state: "open",
            head: { ref: "cursor/random-branch-abc123" },
            labels: [{ name: "hachiko:migration" }],
            html_url: "https://github.com/test/repo/pull/1",
            merged_at: null,
          },
        ];

        const mockCommits = [
          {
            sha: "abc123def456",
            commit: {
              message: "hachiko-track:test-migration:1\nfeat: implement changes",
            },
          },
        ];

        mockOctokit.pulls.list.mockResolvedValue({ data: mockPRs });
        mockOctokit.pulls.listCommits.mockResolvedValue({ data: mockCommits });

        const result = await getHachikoPRs(mockContext, "test-migration", "open");

        expect(mockOctokit.pulls.listCommits).toHaveBeenCalledWith({
          owner: "test-owner",
          repo: "test-repo",
          pull_number: 1,
          per_page: 10,
        });

        expect(result).toHaveLength(1);
        expect(result[0].migrationId).toBe("test-migration");
        expect(result[0].number).toBe(1);
      });

      it("should handle commit fetch failures gracefully", async () => {
        const mockPRs = [
          {
            number: 1,
            title: "Test PR",
            body: null,
            state: "open",
            head: { ref: "feature/branch" },
            labels: [{ name: "hachiko:migration" }],
            html_url: "https://github.com/test/repo/pull/1",
            merged_at: null,
          },
        ];

        mockOctokit.pulls.list.mockResolvedValue({ data: mockPRs });
        mockOctokit.pulls.listCommits.mockRejectedValue(new Error("Commits fetch failed"));

        // Should not throw, just skip commit-based detection
        const result = await getHachikoPRs(mockContext, "test-migration", "open");

        expect(result).toHaveLength(0); // No match without commit detection
      });

      it("should handle 'all' state parameter", async () => {
        const mockPRs = [
          {
            number: 1,
            title: "Test PR",
            body: null,
            state: "open",
            head: { ref: "hachiko/test-migration" },
            labels: [],
            html_url: "https://github.com/test/repo/pull/1",
            merged_at: null,
          },
        ];

        mockOctokit.pulls.list.mockResolvedValue({ data: mockPRs });

        await getHachikoPRs(mockContext, "test-migration", "all");

        expect(mockOctokit.pulls.list).toHaveBeenCalledWith({
          owner: "test-owner",
          repo: "test-repo",
          state: "all",
          per_page: 100,
        });
      });

      it("should deduplicate PRs found by multiple methods", async () => {
        const mockPRs = [
          {
            number: 1,
            title: "[test-migration] Test PR",
            body: null,
            state: "open",
            head: { ref: "hachiko/test-migration" },
            labels: [{ name: "hachiko:migration" }],
            html_url: "https://github.com/test/repo/pull/1",
            merged_at: null,
          },
        ];

        mockOctokit.pulls.list.mockResolvedValue({ data: mockPRs });

        const result = await getHachikoPRs(mockContext, "test-migration", "open");

        // Should only return 1 PR even though it matches branch, label, and title
        expect(result).toHaveLength(1);
        expect(result[0].number).toBe(1);
      });
    });

    describe("getAllOpenHachikoPRs", () => {
      it("should get all open Hachiko PRs across all migrations", async () => {
        const mockPRs = [
          {
            number: 1,
            title: "Migration A",
            body: null,
            state: "open",
            head: { ref: "hachiko/migration-a" },
            labels: [{ name: "hachiko:migration" }],
            html_url: "https://github.com/test/repo/pull/1",
            merged_at: null,
          },
          {
            number: 2,
            title: "Migration B",
            body: null,
            state: "open",
            head: { ref: "hachiko/migration-b" },
            labels: [{ name: "hachiko:migration" }],
            html_url: "https://github.com/test/repo/pull/2",
            merged_at: null,
          },
          {
            number: 3,
            title: "Regular PR",
            body: null,
            state: "open",
            head: { ref: "feature/other" },
            labels: [],
            html_url: "https://github.com/test/repo/pull/3",
            merged_at: null,
          },
        ];

        mockOctokit.pulls.list.mockResolvedValue({ data: mockPRs });

        const result = await getAllOpenHachikoPRs(mockContext);

        expect(mockOctokit.pulls.list).toHaveBeenCalledWith({
          owner: "test-owner",
          repo: "test-repo",
          state: "open",
          per_page: 100,
        });

        expect(result).toHaveLength(2);
        expect(result[0].migrationId).toBe("migration-a");
        expect(result[1].migrationId).toBe("migration-b");
      });

      it("should return empty array when no Hachiko PRs found", async () => {
        const mockPRs = [
          {
            number: 1,
            title: "Regular PR",
            body: null,
            state: "open",
            head: { ref: "feature/other" },
            labels: [],
            html_url: "https://github.com/test/repo/pull/1",
            merged_at: null,
          },
        ];

        mockOctokit.pulls.list.mockResolvedValue({ data: mockPRs });

        const result = await getAllOpenHachikoPRs(mockContext);

        expect(result).toHaveLength(0);
      });

      it("should throw error when API call fails", async () => {
        mockOctokit.pulls.list.mockRejectedValue(new Error("API Error"));

        await expect(getAllOpenHachikoPRs(mockContext)).rejects.toThrow("API Error");
      });
    });
  });
});
