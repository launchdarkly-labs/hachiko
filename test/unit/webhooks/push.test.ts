import { describe, expect, it, vi, beforeEach } from "vitest"
import type { Context } from "probot"
import { handlePush } from "../../../src/webhooks/push.js"
import { createLogger } from "../../../src/utils/logger.js"
import * as config from "../../../src/services/config.js"
import * as issues from "../../../src/services/issues.js"
import * as plans from "../../../src/services/plans.js"
import * as gitUtils from "../../../src/utils/git.js"
import { HachikoError } from "../../../src/utils/errors.js"

// Mock all dependencies
vi.mock("../../../src/services/config.js", () => ({
  loadHachikoConfig: vi.fn(),
}))

vi.mock("../../../src/services/issues.js", () => ({
  createMigrationIssue: vi.fn(),
  createPlanReviewPR: vi.fn(),
}))

vi.mock("../../../src/services/plans.js", () => ({
  parsePlanFile: vi.fn(),
}))

vi.mock("../../../src/utils/git.js", () => ({
  extractChangedFiles: vi.fn(),
  isDefaultBranch: vi.fn(),
}))

describe("handlePush", () => {
  let mockContext: Partial<Context<"push">>
  let logger: ReturnType<typeof createLogger>
  let mockConfig: any

  beforeEach(() => {
    logger = createLogger("test")

    mockConfig = {
      plans: {
        directory: "migrations/",
      },
      defaults: {
        requirePlanReview: true,
      },
    }

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
        pusher: { name: "testuser" },
      } as any,
      octokit: {
        repos: {
          getContent: vi.fn().mockResolvedValue({
            data: {
              content: Buffer.from("# Test Plan\n\nThis is a test plan").toString("base64"),
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
    }

    vi.clearAllMocks()
    vi.mocked(config.loadHachikoConfig).mockResolvedValue(mockConfig)
    vi.mocked(gitUtils.isDefaultBranch).mockReturnValue(true)
    // Don't set default for extractChangedFiles - let individual tests set it
  })

  describe("branch filtering", () => {
    it("should ignore pushes to non-default branches", async () => {
      vi.mocked(gitUtils.isDefaultBranch).mockReturnValue(false)

      await handlePush(mockContext as Context<"push">, logger)

      expect(vi.mocked(config.loadHachikoConfig)).not.toHaveBeenCalled()
    })

    it("should process pushes to the default branch", async () => {
      vi.mocked(gitUtils.isDefaultBranch).mockReturnValue(true)
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue([])

      await handlePush(mockContext as Context<"push">, logger)

      expect(vi.mocked(config.loadHachikoConfig)).toHaveBeenCalledWith(mockContext)
    })
  })

  describe("changed file detection", () => {
    it("should extract changed files from commits", async () => {
      await handlePush(mockContext as Context<"push">, logger)

      expect(vi.mocked(gitUtils.extractChangedFiles)).toHaveBeenCalledWith(
        mockContext.payload!.commits
      )
    })

    it("should exit early when no migration plans changed", async () => {
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue(["src/app.ts", "README.md"])

      await handlePush(mockContext as Context<"push">, logger)

      expect(vi.mocked(plans.parsePlanFile)).not.toHaveBeenCalled()
      expect(vi.mocked(issues.createMigrationIssue)).not.toHaveBeenCalled()
    })

    it("should process migration plan files", async () => {
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue([
        "migrations/react-hooks.md",
        "src/app.ts", // Should be filtered out
        "migrations/typescript-strict.md",
      ])

      const mockPlan = { id: "react-hooks", title: "React Hooks Migration" }
      vi.mocked(plans.parsePlanFile).mockResolvedValue(mockPlan)
      vi.mocked(issues.createMigrationIssue).mockResolvedValue(undefined)

      await handlePush(mockContext as Context<"push">, logger)

      expect(vi.mocked(plans.parsePlanFile)).toHaveBeenCalledTimes(2)
      expect(vi.mocked(plans.parsePlanFile)).toHaveBeenCalledWith(
        mockContext,
        "migrations/react-hooks.md"
      )
      expect(vi.mocked(plans.parsePlanFile)).toHaveBeenCalledWith(
        mockContext,
        "migrations/typescript-strict.md"
      )
    })
  })

  describe("plan processing", () => {
    it("should create migration issue for valid plans", async () => {
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue(["migrations/react-hooks.md"])

      const mockPlan = {
        id: "react-hooks",
        title: "React Hooks Migration",
        description: "Convert class components to hooks",
      }
      vi.mocked(plans.parsePlanFile).mockResolvedValue(mockPlan)
      vi.mocked(issues.createMigrationIssue).mockResolvedValue(undefined)

      await handlePush(mockContext as Context<"push">, logger)

      expect(vi.mocked(issues.createMigrationIssue)).toHaveBeenCalledWith(
        mockContext,
        mockPlan,
        mockConfig,
        logger
      )
    })

    it("should create plan review PR for valid plans", async () => {
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue(["migrations/react-hooks.md"])

      const mockPlan = { id: "react-hooks", title: "React Hooks Migration" }
      vi.mocked(plans.parsePlanFile).mockResolvedValue(mockPlan)
      vi.mocked(issues.createMigrationIssue).mockResolvedValue(undefined)
      vi.mocked(issues.createPlanReviewPR).mockResolvedValue(undefined)

      await handlePush(mockContext as Context<"push">, logger)

      expect(vi.mocked(issues.createPlanReviewPR)).toHaveBeenCalledWith(
        mockContext,
        mockPlan,
        mockConfig,
        logger
      )
    })

    it("should handle multiple changed plans", async () => {
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue([
        "migrations/react-hooks.md",
        "migrations/typescript-strict.md",
      ])

      const mockPlan1 = { id: "react-hooks", title: "React Hooks" }
      const mockPlan2 = { id: "typescript-strict", title: "TypeScript Strict" }

      vi.mocked(plans.parsePlanFile)
        .mockResolvedValueOnce(mockPlan1)
        .mockResolvedValueOnce(mockPlan2)

      vi.mocked(issues.createMigrationIssue)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)

      await handlePush(mockContext as Context<"push">, logger)

      expect(vi.mocked(issues.createMigrationIssue)).toHaveBeenCalledTimes(2)
      expect(vi.mocked(issues.createPlanReviewPR)).toHaveBeenCalledTimes(2)
    })
  })

  describe("error handling", () => {
    it("should handle config loading errors", async () => {
      vi.mocked(config.loadHachikoConfig).mockRejectedValue(new Error("Config not found"))

      await expect(handlePush(mockContext as Context<"push">, logger)).rejects.toThrow(
        "Config not found"
      )
    })

    it("should handle plan parsing errors gracefully", async () => {
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue(["migrations/invalid.md"])
      vi.mocked(plans.parsePlanFile).mockRejectedValue(
        new HachikoError("Invalid plan format", "PLAN_PARSE_ERROR")
      )

      await expect(handlePush(mockContext as Context<"push">, logger)).rejects.toThrow(
        "Invalid plan format"
      )

      expect(vi.mocked(issues.createMigrationIssue)).not.toHaveBeenCalled()
    })

    it("should handle issue creation errors gracefully", async () => {
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue(["migrations/react-hooks.md"])

      const mockPlan = { id: "react-hooks", title: "React Hooks" }
      vi.mocked(plans.parsePlanFile).mockResolvedValue(mockPlan)
      vi.mocked(issues.createMigrationIssue).mockRejectedValue(new Error("GitHub API error"))

      await expect(handlePush(mockContext as Context<"push">, logger)).rejects.toThrow(
        "GitHub API error"
      )

      expect(vi.mocked(issues.createPlanReviewPR)).not.toHaveBeenCalled()
    })

    it("should continue processing other plans when one fails", async () => {
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue([
        "migrations/valid.md",
        "migrations/invalid.md",
      ])

      const validPlan = { id: "valid", title: "Valid Plan" }

      vi.mocked(plans.parsePlanFile)
        .mockResolvedValueOnce(validPlan)
        .mockRejectedValueOnce(new Error("Invalid plan"))

      vi.mocked(issues.createMigrationIssue).mockResolvedValue(undefined)

      await handlePush(mockContext as Context<"push">, logger)

      // Should still create issue for valid plan
      expect(vi.mocked(issues.createMigrationIssue)).toHaveBeenCalledWith(
        mockContext,
        validPlan,
        mockConfig,
        logger
      )
    })
  })

  describe("configuration handling", () => {
    it("should respect custom plan directory", async () => {
      mockConfig.plans.directory = "custom-migrations/"
      vi.mocked(gitUtils.extractChangedFiles).mockReturnValue([
        "custom-migrations/plan.md",
        "migrations/ignored.md", // Should be ignored
      ])

      const mockPlan = { id: "custom", title: "Custom Plan" }
      vi.mocked(plans.parsePlanFile).mockResolvedValue(mockPlan)
      vi.mocked(issues.createMigrationIssue).mockResolvedValue(undefined)

      await handlePush(mockContext as Context<"push">, logger)

      expect(vi.mocked(plans.parsePlanFile)).toHaveBeenCalledTimes(1)
      expect(vi.mocked(plans.parsePlanFile)).toHaveBeenCalledWith(
        mockContext,
        "custom-migrations/plan.md"
      )
    })
  })
})
