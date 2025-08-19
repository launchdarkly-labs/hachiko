import type { Context } from "probot"
import { beforeEach, describe, expect, it, vi } from "vitest"
import * as commands from "../../../src/services/commands.js"
import * as commandUtils from "../../../src/utils/commands.js"
import { createLogger } from "../../../src/utils/logger.js"
import { handleIssueComment } from "../../../src/webhooks/issue_comment.js"

// Mock all command handlers
vi.mock("../../../src/services/commands.js", () => ({
  handleAdoptCommand: vi.fn(),
  handlePauseCommand: vi.fn(),
  handleRebaseCommand: vi.fn(),
  handleResumeCommand: vi.fn(),
  handleRetryCommand: vi.fn(),
  handleSkipCommand: vi.fn(),
  handleStatusCommand: vi.fn(),
}))

vi.mock("../../../src/utils/commands.js", () => ({
  parseHachikoCommand: vi.fn(),
}))

describe("handleIssueComment", () => {
  let mockContext: Partial<Context<"issue_comment.created">>
  let logger: ReturnType<typeof createLogger>

  beforeEach(() => {
    logger = createLogger("test")

    mockContext = {
      payload: {
        comment: {
          id: 123,
          body: "/hachi status",
          user: { login: "testuser" },
        },
        issue: {
          number: 456,
          id: 789,
          title: "Test Issue",
          state: "open" as const,
          user: { login: "testuser" },
        },
        repository: {
          name: "test-repo",
          owner: { login: "test-owner" },
        },
      } as any,
      octokit: {
        issues: {
          createComment: vi.fn().mockResolvedValue({ data: { id: 999 } }),
        },
      } as any,
    }

    vi.clearAllMocks()
  })

  describe("command filtering", () => {
    it("should ignore comments that don't start with /hachi", async () => {
      mockContext.payload!.comment.body = "This is just a regular comment"

      await handleIssueComment(mockContext as Context<"issue_comment.created">, logger)

      expect(vi.mocked(commandUtils.parseHachikoCommand)).not.toHaveBeenCalled()
    })

    it("should process comments that start with /hachi", async () => {
      vi.mocked(commandUtils.parseHachikoCommand).mockReturnValue({
        action: "status",
        args: [],
      })

      await handleIssueComment(mockContext as Context<"issue_comment.created">, logger)

      expect(vi.mocked(commandUtils.parseHachikoCommand)).toHaveBeenCalledWith("/hachi status")
    })

    it("should handle comments with only whitespace before /hachi", async () => {
      mockContext.payload!.comment.body = "  \n  /hachi status  "
      vi.mocked(commandUtils.parseHachikoCommand).mockReturnValue({
        action: "status",
        args: [],
      })

      await handleIssueComment(mockContext as Context<"issue_comment.created">, logger)

      expect(vi.mocked(commandUtils.parseHachikoCommand)).toHaveBeenCalled()
    })
  })

  describe("command parsing", () => {
    it("should reply with usage when command parsing fails", async () => {
      vi.mocked(commandUtils.parseHachikoCommand).mockReturnValue(null)

      await handleIssueComment(mockContext as Context<"issue_comment.created">, logger)

      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 456,
        body: expect.stringContaining("## Available Hachiko Commands"),
      })
    })
  })

  describe("command dispatch", () => {
    it("should dispatch rebase commands", async () => {
      const command = { action: "rebase" as const, args: ["main"] }
      vi.mocked(commandUtils.parseHachikoCommand).mockReturnValue(command)

      await handleIssueComment(mockContext as Context<"issue_comment.created">, logger)

      expect(vi.mocked(commands.handleRebaseCommand)).toHaveBeenCalledWith(
        mockContext,
        command,
        logger
      )
    })

    it("should dispatch pause commands", async () => {
      const command = { action: "pause" as const, args: [] }
      vi.mocked(commandUtils.parseHachikoCommand).mockReturnValue(command)

      await handleIssueComment(mockContext as Context<"issue_comment.created">, logger)

      expect(vi.mocked(commands.handlePauseCommand)).toHaveBeenCalledWith(
        mockContext,
        command,
        logger
      )
    })

    it("should dispatch resume commands", async () => {
      const command = { action: "resume" as const, args: [] }
      vi.mocked(commandUtils.parseHachikoCommand).mockReturnValue(command)

      await handleIssueComment(mockContext as Context<"issue_comment.created">, logger)

      expect(vi.mocked(commands.handleResumeCommand)).toHaveBeenCalledWith(
        mockContext,
        command,
        logger
      )
    })

    it("should dispatch adopt commands", async () => {
      const command = { action: "adopt" as const, args: ["claude-cli"] }
      vi.mocked(commandUtils.parseHachikoCommand).mockReturnValue(command)

      await handleIssueComment(mockContext as Context<"issue_comment.created">, logger)

      expect(vi.mocked(commands.handleAdoptCommand)).toHaveBeenCalledWith(
        mockContext,
        command,
        logger
      )
    })

    it("should dispatch status commands", async () => {
      const command = { action: "status" as const, args: [] }
      vi.mocked(commandUtils.parseHachikoCommand).mockReturnValue(command)

      await handleIssueComment(mockContext as Context<"issue_comment.created">, logger)

      expect(vi.mocked(commands.handleStatusCommand)).toHaveBeenCalledWith(
        mockContext,
        command,
        logger
      )
    })

    it("should dispatch skip commands", async () => {
      const command = { action: "skip" as const, args: ["step-1"] }
      vi.mocked(commandUtils.parseHachikoCommand).mockReturnValue(command)

      await handleIssueComment(mockContext as Context<"issue_comment.created">, logger)

      expect(vi.mocked(commands.handleSkipCommand)).toHaveBeenCalledWith(
        mockContext,
        command,
        logger
      )
    })

    it("should dispatch retry commands", async () => {
      const command = { action: "retry" as const, args: ["step-2"] }
      vi.mocked(commandUtils.parseHachikoCommand).mockReturnValue(command)

      await handleIssueComment(mockContext as Context<"issue_comment.created">, logger)

      expect(vi.mocked(commands.handleRetryCommand)).toHaveBeenCalledWith(
        mockContext,
        command,
        logger
      )
    })

    it("should handle unknown commands gracefully", async () => {
      const command = { action: "unknown" as any, args: [] }
      vi.mocked(commandUtils.parseHachikoCommand).mockReturnValue(command)

      await handleIssueComment(mockContext as Context<"issue_comment.created">, logger)

      // Should not call any specific command handler
      expect(vi.mocked(commands.handleStatusCommand)).not.toHaveBeenCalled()
      expect(vi.mocked(commands.handleRebaseCommand)).not.toHaveBeenCalled()

      // Should reply with usage
      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 456,
        body: expect.stringContaining("## Available Hachiko Commands"),
      })
    })
  })

  describe("error handling", () => {
    it("should handle command handler errors gracefully", async () => {
      const command = { action: "status" as const, args: [] }
      vi.mocked(commandUtils.parseHachikoCommand).mockReturnValue(command)
      vi.mocked(commands.handleStatusCommand).mockRejectedValue(new Error("Command failed"))

      // Should not throw, should reply with error message
      await expect(
        handleIssueComment(mockContext as Context<"issue_comment.created">, logger)
      ).resolves.toBeUndefined()

      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 456,
        body: expect.stringContaining("❌ **Error processing command**: Command failed"),
      })
    })

    it("should handle parsing errors gracefully", async () => {
      vi.mocked(commandUtils.parseHachikoCommand).mockImplementation(() => {
        throw new Error("Parse error")
      })

      // Should not throw, should reply with error message
      await expect(
        handleIssueComment(mockContext as Context<"issue_comment.created">, logger)
      ).resolves.toBeUndefined()

      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 456,
        body: expect.stringContaining("❌ **Error processing command**: Parse error"),
      })
    })
  })
})
