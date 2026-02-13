import type { Context } from "probot";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as config from "../../../src/services/config.js";
import * as issues from "../../../src/services/issues.js";
import * as plans from "../../../src/services/plans.js";
import { HachikoError } from "../../../src/utils/errors.js";
import * as git from "../../../src/utils/git.js";
import { createLogger } from "../../../src/utils/logger.js";
import { handlePush } from "../../../src/webhooks/push.js";

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
  isDefaultBranch: vi.fn(),
  extractChangedFiles: vi.fn(),
}));

vi.mock("node:fs", () => ({
  promises: {
    writeFile: vi.fn(),
  },
}));

describe("handlePush", () => {
  let mockContext: Partial<Context<"push">>;
  let logger: ReturnType<typeof createLogger>;
  const mockConfig = {
    plans: {
      directory: "migrations",
    },
    defaults: {
      requirePlanReview: false,
    },
  };

  beforeEach(() => {
    logger = createLogger("test");

    mockContext = {
      payload: {
        ref: "refs/heads/main",
        repository: {
          name: "test-repo",
          owner: { login: "test-owner" },
          default_branch: "main",
        },
        commits: [
          {
            id: "abc123",
            added: ["migrations/new-plan.md"],
            modified: [],
            removed: [],
          },
        ],
        head_commit: {
          id: "abc123",
        },
        after: "abc123",
        pusher: {
          name: "testuser",
        },
      } as any,
      octokit: {
        repos: {
          getContent: vi.fn().mockResolvedValue({
            data: {
              type: "file",
              content: Buffer.from("# Test Plan").toString("base64"),
            },
          }),
        },
        issues: {
          listForRepo: vi.fn().mockResolvedValue({
            data: [],
          }),
        },
      } as any,
    };

    vi.clearAllMocks();

    // Reset mocks to default successful behavior
    vi.mocked(config.loadHachikoConfig).mockResolvedValue(mockConfig as any);
    vi.mocked(git.isDefaultBranch).mockReturnValue(true);
    vi.mocked(git.extractChangedFiles).mockReturnValue(["migrations/new-plan.md"]);
    vi.mocked(plans.parsePlanFile).mockResolvedValue({
      isValid: true,
      plan: {
        id: "test-plan",
        title: "Test Plan",
        steps: [],
      },
      errors: [],
    } as any);
    vi.mocked(issues.createMigrationIssue).mockResolvedValue(undefined);
    vi.mocked(issues.createPlanReviewPR).mockResolvedValue(undefined);
  });

  describe("branch filtering", () => {
    it("should ignore pushes to non-default branches", async () => {
      vi.mocked(git.isDefaultBranch).mockReturnValue(false);

      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(config.loadHachikoConfig)).not.toHaveBeenCalled();
      expect(vi.mocked(git.extractChangedFiles)).not.toHaveBeenCalled();
    });

    it("should process pushes to default branch", async () => {
      vi.mocked(git.isDefaultBranch).mockReturnValue(true);

      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(git.isDefaultBranch)).toHaveBeenCalledWith("refs/heads/main", "main");
      expect(vi.mocked(config.loadHachikoConfig)).toHaveBeenCalled();
    });

    it("should handle different default branch names", async () => {
      mockContext.payload!.repository.default_branch = "develop";
      vi.mocked(git.isDefaultBranch).mockReturnValue(true);

      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(git.isDefaultBranch)).toHaveBeenCalledWith("refs/heads/main", "develop");
    });
  });

  describe("configuration loading", () => {
    it("should load Hachiko config", async () => {
      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(config.loadHachikoConfig)).toHaveBeenCalledWith(mockContext);
    });

    it("should handle config loading errors", async () => {
      vi.mocked(config.loadHachikoConfig).mockRejectedValue(new Error("Config not found"));

      await expect(handlePush(mockContext as Context<"push">, logger)).rejects.toThrow(
        "Config not found"
      );
    });
  });

  describe("changed files detection", () => {
    it("should extract changed files from commits", async () => {
      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(git.extractChangedFiles)).toHaveBeenCalledWith(
        mockContext.payload!.commits
      );
    });

    it("should filter for migration plan files", async () => {
      vi.mocked(git.extractChangedFiles).mockReturnValue([
        "migrations/plan1.md",
        "src/index.ts",
        "migrations/plan2.md",
        "README.md",
      ]);

      await handlePush(mockContext as Context<"push">, logger);

      // Should only process .md files in migrations directory
      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalledTimes(2);
    });

    it("should return early when no plan files changed", async () => {
      vi.mocked(git.extractChangedFiles).mockReturnValue([
        "src/index.ts",
        "README.md",
        "package.json",
      ]);

      await handlePush(mockContext as Context<"push">, logger);

      expect(mockContext.octokit!.repos.getContent).not.toHaveBeenCalled();
      expect(vi.mocked(plans.parsePlanFile)).not.toHaveBeenCalled();
    });

    it("should use custom plans directory from config", async () => {
      const customConfig = {
        plans: {
          directory: "custom-migrations",
        },
        defaults: {
          requirePlanReview: false,
        },
      };
      vi.mocked(config.loadHachikoConfig).mockResolvedValue(customConfig as any);
      vi.mocked(git.extractChangedFiles).mockReturnValue([
        "custom-migrations/plan.md",
        "migrations/plan.md",
      ]);

      await handlePush(mockContext as Context<"push">, logger);

      // Should only process plan in custom directory
      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalledTimes(1);
      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        path: "custom-migrations/plan.md",
        ref: "abc123",
      });
    });
  });

  describe("plan file processing", () => {
    it("should fetch plan file content from repository", async () => {
      await handlePush(mockContext as Context<"push">, logger);

      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        path: "migrations/new-plan.md",
        ref: "abc123",
      });
    });

    it("should use head_commit id as ref", async () => {
      mockContext.payload!.head_commit = { id: "def456" } as any;

      await handlePush(mockContext as Context<"push">, logger);

      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalledWith(
        expect.objectContaining({
          ref: "def456",
        })
      );
    });

    it("should fall back to after ref when head_commit is missing", async () => {
      mockContext.payload!.head_commit = null as any;
      mockContext.payload!.after = "ghi789";

      await handlePush(mockContext as Context<"push">, logger);

      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalledWith(
        expect.objectContaining({
          ref: "ghi789",
        })
      );
    });

    it("should handle directory response gracefully", async () => {
      mockContext.octokit!.repos.getContent = vi.fn().mockResolvedValue({
        data: [{ type: "file", name: "file1.md" }],
      });

      // HachikoErrors are caught and logged, not thrown
      await expect(handlePush(mockContext as Context<"push">, logger)).resolves.toBeUndefined();

      // Should not create migration issue
      expect(vi.mocked(issues.createMigrationIssue)).not.toHaveBeenCalled();
    });

    it("should handle non-file response gracefully", async () => {
      mockContext.octokit!.repos.getContent = vi.fn().mockResolvedValue({
        data: { type: "symlink", content: "" },
      });

      // HachikoErrors are caught and logged, not thrown
      await expect(handlePush(mockContext as Context<"push">, logger)).resolves.toBeUndefined();

      // Should not create migration issue
      expect(vi.mocked(issues.createMigrationIssue)).not.toHaveBeenCalled();
    });

    it("should decode base64 content correctly", async () => {
      const content = "# Migration Plan\nThis is a test";
      mockContext.octokit!.repos.getContent = vi.fn().mockResolvedValue({
        data: {
          type: "file",
          content: Buffer.from(content).toString("base64"),
        },
      });

      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(plans.parsePlanFile)).toHaveBeenCalled();
    });

    it("should handle invalid plan files", async () => {
      vi.mocked(plans.parsePlanFile).mockResolvedValue({
        isValid: false,
        plan: null,
        errors: ["Missing required field: id"],
      } as any);

      // Should not throw, just log warning
      await expect(handlePush(mockContext as Context<"push">, logger)).resolves.toBeUndefined();

      expect(vi.mocked(issues.createMigrationIssue)).not.toHaveBeenCalled();
    });
  });

  describe("new migration plan detection", () => {
    it("should detect new migration plans", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [],
      });

      await handlePush(mockContext as Context<"push">, logger);

      expect(mockContext.octokit!.issues.listForRepo).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        labels: "hachiko:plan:test-plan",
        state: "all",
      });
    });

    it("should detect existing migration plans", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [{ number: 42, title: "Migration: test-plan" }],
      });

      await handlePush(mockContext as Context<"push">, logger);

      // Should not create new issue for existing plan
      expect(vi.mocked(issues.createMigrationIssue)).not.toHaveBeenCalled();
    });

    it("should handle errors checking for existing plans gracefully", async () => {
      mockContext.octokit!.issues.listForRepo = vi
        .fn()
        .mockRejectedValue(new Error("API error"));

      // Should assume it's a new plan and continue
      await expect(handlePush(mockContext as Context<"push">, logger)).resolves.toBeUndefined();

      expect(vi.mocked(issues.createMigrationIssue)).toHaveBeenCalled();
    });
  });

  describe("migration issue creation", () => {
    it("should create migration issue for new plans", async () => {
      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(issues.createMigrationIssue)).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          id: "test-plan",
          title: "Test Plan",
        }),
        mockConfig,
        logger
      );
    });

    it("should not create migration issue for existing plans", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [{ number: 42 }],
      });

      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(issues.createMigrationIssue)).not.toHaveBeenCalled();
    });

    it("should handle errors creating migration issue", async () => {
      vi.mocked(issues.createMigrationIssue).mockRejectedValue(new Error("Issue creation failed"));

      await expect(handlePush(mockContext as Context<"push">, logger)).rejects.toThrow(
        "Issue creation failed"
      );
    });
  });

  describe("plan review PR creation", () => {
    it("should create plan review PR when required by config", async () => {
      const reviewConfig = {
        ...mockConfig,
        defaults: {
          requirePlanReview: true,
        },
      };
      vi.mocked(config.loadHachikoConfig).mockResolvedValue(reviewConfig as any);

      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(issues.createPlanReviewPR)).toHaveBeenCalledWith(
        mockContext,
        expect.objectContaining({
          id: "test-plan",
        }),
        reviewConfig,
        logger
      );
    });

    it("should not create plan review PR when not required", async () => {
      await handlePush(mockContext as Context<"push">, logger);

      expect(vi.mocked(issues.createPlanReviewPR)).not.toHaveBeenCalled();
    });

    it("should handle errors creating plan review PR", async () => {
      const reviewConfig = {
        ...mockConfig,
        defaults: {
          requirePlanReview: true,
        },
      };
      vi.mocked(config.loadHachikoConfig).mockResolvedValue(reviewConfig as any);
      vi.mocked(issues.createPlanReviewPR).mockRejectedValue(new Error("PR creation failed"));

      await expect(handlePush(mockContext as Context<"push">, logger)).rejects.toThrow(
        "PR creation failed"
      );
    });
  });

  describe("multiple plan processing", () => {
    it("should process multiple changed plans", async () => {
      vi.mocked(git.extractChangedFiles).mockReturnValue([
        "migrations/plan1.md",
        "migrations/plan2.md",
        "migrations/plan3.md",
      ]);

      await handlePush(mockContext as Context<"push">, logger);

      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalledTimes(3);
      expect(vi.mocked(plans.parsePlanFile)).toHaveBeenCalledTimes(3);
    });

    it("should continue processing other plans if one fails with HachikoError", async () => {
      vi.mocked(git.extractChangedFiles).mockReturnValue([
        "migrations/plan1.md",
        "migrations/plan2.md",
        "migrations/plan3.md",
      ]);

      let callCount = 0;
      vi.mocked(plans.parsePlanFile).mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new HachikoError("Invalid plan", "INVALID_PLAN");
        }
        return {
          isValid: true,
          plan: { id: `plan${callCount}`, title: `Plan ${callCount}`, steps: [] },
          errors: [],
        } as any;
      });

      // Should not throw, should continue processing
      await expect(handlePush(mockContext as Context<"push">, logger)).resolves.toBeUndefined();

      expect(vi.mocked(plans.parsePlanFile)).toHaveBeenCalledTimes(3);
    });

    it("should stop processing if a plan fails with non-HachikoError", async () => {
      vi.mocked(git.extractChangedFiles).mockReturnValue([
        "migrations/plan1.md",
        "migrations/plan2.md",
        "migrations/plan3.md",
      ]);

      let callCount = 0;
      vi.mocked(plans.parsePlanFile).mockImplementation(async () => {
        callCount++;
        if (callCount === 2) {
          throw new Error("Unexpected error");
        }
        return {
          isValid: true,
          plan: { id: `plan${callCount}`, title: `Plan ${callCount}`, steps: [] },
          errors: [],
        } as any;
      });

      await expect(handlePush(mockContext as Context<"push">, logger)).rejects.toThrow(
        "Unexpected error"
      );
    });
  });

  describe("error handling", () => {
    it("should propagate errors from top-level try-catch", async () => {
      vi.mocked(git.extractChangedFiles).mockImplementation(() => {
        throw new Error("Fatal error");
      });

      await expect(handlePush(mockContext as Context<"push">, logger)).rejects.toThrow(
        "Fatal error"
      );
    });

    it("should handle errors in plan processing", async () => {
      mockContext.octokit!.repos.getContent = vi.fn().mockRejectedValue(new Error("GitHub API"));

      await expect(handlePush(mockContext as Context<"push">, logger)).rejects.toThrow(
        "GitHub API"
      );
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete new plan workflow", async () => {
      const reviewConfig = {
        plans: {
          directory: "migrations",
        },
        defaults: {
          requirePlanReview: true,
        },
      };
      vi.mocked(config.loadHachikoConfig).mockResolvedValue(reviewConfig as any);

      const planData = {
        id: "migrate-to-typescript",
        title: "Migrate codebase to TypeScript",
        steps: [{ id: "step1", title: "Convert files" }],
      };

      vi.mocked(plans.parsePlanFile).mockResolvedValue({
        isValid: true,
        plan: planData,
        errors: [],
      } as any);

      await handlePush(mockContext as Context<"push">, logger);

      // Should load config
      expect(vi.mocked(config.loadHachikoConfig)).toHaveBeenCalled();

      // Should fetch file content
      expect(mockContext.octokit!.repos.getContent).toHaveBeenCalled();

      // Should parse plan
      expect(vi.mocked(plans.parsePlanFile)).toHaveBeenCalled();

      // Should check for existing issues
      expect(mockContext.octokit!.issues.listForRepo).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        labels: "hachiko:plan:migrate-to-typescript",
        state: "all",
      });

      // Should create migration issue
      expect(vi.mocked(issues.createMigrationIssue)).toHaveBeenCalledWith(
        mockContext,
        planData,
        reviewConfig,
        logger
      );

      // Should create plan review PR
      expect(vi.mocked(issues.createPlanReviewPR)).toHaveBeenCalledWith(
        mockContext,
        planData,
        reviewConfig,
        logger
      );
    });

    it("should handle existing plan update workflow", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [{ number: 100, title: "Migration: test-plan" }],
      });

      await handlePush(mockContext as Context<"push">, logger);

      // Should not create new issue
      expect(vi.mocked(issues.createMigrationIssue)).not.toHaveBeenCalled();

      // Should not create plan review PR
      expect(vi.mocked(issues.createPlanReviewPR)).not.toHaveBeenCalled();
    });

    it("should handle push with no relevant changes", async () => {
      vi.mocked(git.extractChangedFiles).mockReturnValue([
        "src/index.ts",
        "package.json",
        "README.md",
      ]);

      await handlePush(mockContext as Context<"push">, logger);

      // Should not process any files
      expect(mockContext.octokit!.repos.getContent).not.toHaveBeenCalled();
      expect(vi.mocked(plans.parsePlanFile)).not.toHaveBeenCalled();
      expect(vi.mocked(issues.createMigrationIssue)).not.toHaveBeenCalled();
    });
  });
});
