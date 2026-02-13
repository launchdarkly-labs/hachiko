import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "probot";
import * as config from "../../../src/services/config.js";
import * as issues from "../../../src/services/issues.js";
import * as plans from "../../../src/services/plans.js";
import { HachikoError } from "../../../src/utils/errors.js";
import * as gitUtils from "../../../src/utils/git.js";
import { createLogger } from "../../../src/utils/logger.js";
import { handlePush } from "../../../src/webhooks/push.js";

// Mock node:fs
vi.mock("node:fs", () => ({
  promises: {
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock all dependencies
vi.mock("../../../src/services/config.js", () => ({
  loadHachikoConfig: vi.fn(),
}));

vi.mock("../../../src/services/issues.js", () => ({
  createMigrationIssue: vi.fn(),
  createPlanReviewPR: vi.fn(),
}));

vi.mock("../../../src/services/plans.js", () => ({
  parsePlanFile: vi.fn(),
}));

vi.mock("../../../src/utils/git.js", () => ({
  extractChangedFiles: vi.fn(),
  isDefaultBranch: vi.fn(),
}));

describe("handlePush", () => {
  let mockContext: Partial<Context<"push">>;
  let logger: ReturnType<typeof createLogger>;
  let mockConfig: any;

  beforeEach(() => {
    logger = createLogger("test");

    mockConfig = {
      plans: {
        directory: "migrations/",
      },
      defaults: {
        requirePlanReview: true,
      },
    };

    mockContext = {
      payload: {
        repository: {
          name: "test-repo",
          default_branch: "main",
          owner: { login: "test-owner" },
        },
        commits: [
          {
            id: "abc123",
            message: "Add migration plan",
            added: ["migrations/react-hooks.md"],
            modified: [],
            removed: [],
          },
        ],
        ref: "refs/heads/main",
        head_commit: { id: "abc123" },
        after: "abc123",
        pusher: { name: "testuser" },
      } as any,
      octokit: {
        repos: {
          getContent: vi.fn().mockResolvedValue({
            data: {
              type: "file",
              content: Buffer.from(
                "---\nid: react-hooks\ntitle: React Hooks\n---\n# Test Plan"
              ).toString("base64"),
              encoding: "base64",
            },
          }),
        },
        issues: {
          listForRepo: vi.fn().mockResolvedValue({
            data: [], // No existing issues by default (new plan)
          }),
        },
      } as any,
    };

    vi.clearAllMocks();
    vi.mocked(config.loadHachikoConfig).mockResolvedValue(mockConfig);
    vi.mocked(gitUtils.isDefaultBranch).mockReturnValue(true);
    vi.mocked(gitUtils.extractChangedFiles).mockReturnValue([]);
    vi.mocked(plans.parsePlanFile).mockResolvedValue({
      isValid: true,
      plan: {
        id: "react-hooks",
        title: "React Hooks Migration",
        steps: [],
      },
      errors: [],
    });
    vi.mocked(issues.createMigrationIssue).mockResolvedValue(undefined);
    vi.mocked(issues.createPlanReviewPR).mockResolvedValue(undefined);
  });

  describe("branch filtering", () => {
    it("should ignore pushes to non-default branches", async () => {
      vi.mocked(gitUtils.isDefaultBranch).mockReturnValue(false);

      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(config.loadHachikoConfig)).not.toHaveBeenCalled();
    });

    it("should process pushes to the default branch", async () => {
      vi.mocked(gitUtils.isDefaultBranch).mockReturnValue(true);
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue([]);

      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(config.loadHachikoConfig)).toHaveBeenCalledWith(mockContext);
    });
  });

  describe("changed file detection", () => {
    it("should extract changed files from commits", async () => {
      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(gitUtils.extractChangedFiles)).toHaveBeenCalledWith(
        mockContext.payload!.commits
      );
    });

    it("should exit early when no migration plans changed", async () => {
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue(["src/app.ts", "README.md"]);

      await handlePush(mockContext as Context<"push">, logger);

      expect(mockContext.octokit!.repos.getContent).not.toHaveBeenCalled();
      expect(vi.mocked(issues.createMigrationIssue)).not.toHaveBeenCalled();
    });

    it("should process migration plan files", async () => {
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue([
        "migrations/react-hooks.md",
        "src/app.ts", // Should be filtered out
        "migrations/typescript-strict.md",
      ]);

      await handlePush(mockContext as Context<"push">, logger);

      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalledTimes(2);
      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        path: "migrations/react-hooks.md",
        ref: "abc123",
      });
      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        path: "migrations/typescript-strict.md",
        ref: "abc123",
      });
    });
  });

  describe("plan processing", () => {
    beforeEach(() => {
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue(["migrations/react-hooks.md"]);
    });

    it("should create migration issue for new valid plans", async () => {
      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(issues.createMigrationIssue)).toHaveBeenCalledWith(
        mockContext,
        {
          id: "react-hooks",
          title: "React Hooks Migration",
          steps: [],
        },
        mockConfig,
        logger
      );
    });

    it("should create plan review PR when required", async () => {
      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(issues.createPlanReviewPR)).toHaveBeenCalledWith(
        mockContext,
        {
          id: "react-hooks",
          title: "React Hooks Migration",
          steps: [],
        },
        mockConfig,
        logger
      );
    });

    it("should not create plan review PR when not required", async () => {
      mockConfig.defaults.requirePlanReview = false;

      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(issues.createMigrationIssue)).toHaveBeenCalled();
      expect(vi.mocked(issues.createPlanReviewPR)).not.toHaveBeenCalled();
    });

    it("should not create issue for existing plans", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [{ number: 42, labels: [{ name: "hachiko:plan:react-hooks" }] }],
      });

      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(issues.createMigrationIssue)).not.toHaveBeenCalled();
      expect(vi.mocked(issues.createPlanReviewPR)).not.toHaveBeenCalled();
    });

    it("should skip invalid plans", async () => {
      vi.mocked(plans.parsePlanFile).mockResolvedValue({
        isValid: false,
        plan: null,
        errors: ["Missing required field: id"],
      });

      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(issues.createMigrationIssue)).not.toHaveBeenCalled();
    });

    it("should handle multiple changed plans", async () => {
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue([
        "migrations/react-hooks.md",
        "migrations/typescript-strict.md",
      ]);

      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(issues.createMigrationIssue)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(issues.createPlanReviewPR)).toHaveBeenCalledTimes(2);
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue(["migrations/test.md"]);
    });

    it("should throw when config loading fails", async () => {
      vi.mocked(config.loadHachikoConfig).mockRejectedValue(new Error("Config not found"));

      await expect(handlePush(mockContext as Context<"push">, logger)).rejects.toThrow(
        "Config not found"
      );
    });

    it("should throw when getting file content fails", async () => {
      mockContext.octokit!.repos.getContent = vi
        .fn()
        .mockRejectedValue(new Error("File not found"));

      await expect(handlePush(mockContext as Context<"push">, logger)).rejects.toThrow(
        "File not found"
      );
    });

    it("should handle HachikoError when content is not a file", async () => {
      mockContext.octokit!.repos.getContent = vi.fn().mockResolvedValue({
        data: {
          type: "dir",
        },
      });

      // Should not throw - HachikoErrors are caught and logged
      await expect(handlePush(mockContext as Context<"push">, logger)).resolves.toBeUndefined();

      // Should not create issue for invalid content
      expect(vi.mocked(issues.createMigrationIssue)).not.toHaveBeenCalled();
    });

    it("should handle HachikoError when content is an array", async () => {
      mockContext.octokit!.repos.getContent = vi.fn().mockResolvedValue({
        data: [{ type: "file", name: "test.md" }],
      });

      // Should not throw - HachikoErrors are caught and logged
      await expect(handlePush(mockContext as Context<"push">, logger)).resolves.toBeUndefined();

      // Should not create issue for invalid content
      expect(vi.mocked(issues.createMigrationIssue)).not.toHaveBeenCalled();
    });

    it("should throw when plan parsing fails", async () => {
      vi.mocked(plans.parsePlanFile).mockRejectedValue(new Error("Parse error"));

      await expect(handlePush(mockContext as Context<"push">, logger)).rejects.toThrow(
        "Parse error"
      );
    });

    it("should throw when issue creation fails", async () => {
      vi.mocked(issues.createMigrationIssue).mockRejectedValue(new Error("GitHub API error"));

      await expect(handlePush(mockContext as Context<"push">, logger)).rejects.toThrow(
        "GitHub API error"
      );
    });

    it("should continue processing other plans when one fails with HachikoError", async () => {
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue([
        "migrations/plan1.md",
        "migrations/plan2.md",
      ]);

      // First plan succeeds, second fails with HachikoError
      mockContext.octokit!.repos.getContent = vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            type: "file",
            content: Buffer.from("---\nid: plan1\n---").toString("base64"),
          },
        })
        .mockResolvedValueOnce({
          data: { type: "dir" }, // Will cause HachikoError
        });

      // Should not throw, should continue
      await expect(handlePush(mockContext as Context<"push">, logger)).resolves.toBeUndefined();

      // Should still process first plan
      expect(vi.mocked(issues.createMigrationIssue)).toHaveBeenCalledTimes(1);
    });

    it("should check for existing issues when determining if plan is new", async () => {
      await handlePush(mockContext as Context<"push">, logger);

      expect(mockContext.octokit!.issues.listForRepo).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        labels: "hachiko:plan:react-hooks",
        state: "all",
      });
    });

    it("should assume plan is new when issue list fails", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockRejectedValue(new Error("API error"));

      // Should not throw, should assume new plan
      await expect(handlePush(mockContext as Context<"push">, logger)).resolves.toBeUndefined();

      expect(vi.mocked(issues.createMigrationIssue)).toHaveBeenCalled();
    });
  });

  describe("configuration handling", () => {
    it("should respect custom plan directory", async () => {
      mockConfig.plans.directory = "custom-migrations/";
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue([
        "custom-migrations/plan.md",
        "migrations/ignored.md", // Should be ignored
      ]);

      await handlePush(mockContext as Context<"push">, logger);

      // Should only process the file in the custom directory
      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalledTimes(1);
      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        path: "custom-migrations/plan.md",
        ref: "abc123",
      });
    });

    it("should only process .md files", async () => {
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue([
        "migrations/plan.md",
        "migrations/plan.txt", // Should be ignored
        "migrations/README", // Should be ignored
      ]);

      await handlePush(mockContext as Context<"push">, logger);

      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalledTimes(1);
      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        path: "migrations/plan.md",
        ref: "abc123",
      });
    });
  });

  describe("file content handling", () => {
    beforeEach(() => {
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue(["migrations/test.md"]);
    });

    it("should decode base64 file content", async () => {
      const content = "---\nid: test\ntitle: Test\n---\n# Test Plan";
      mockContext.octokit!.repos.getContent = vi.fn().mockResolvedValue({
        data: {
          type: "file",
          content: Buffer.from(content).toString("base64"),
          encoding: "base64",
        },
      });

      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(plans.parsePlanFile)).toHaveBeenCalled();
    });

    it("should use head_commit id when available", async () => {
      mockContext.payload!.head_commit = { id: "commit-abc" } as any;

      await handlePush(mockContext as Context<"push">, logger);

      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        path: "migrations/test.md",
        ref: "commit-abc",
      });
    });

    it("should fall back to after when head_commit is missing", async () => {
      mockContext.payload!.head_commit = undefined;
      mockContext.payload!.after = "after-xyz";

      await handlePush(mockContext as Context<"push">, logger);

      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        path: "migrations/test.md",
        ref: "after-xyz",
      });
    });
  });
});
