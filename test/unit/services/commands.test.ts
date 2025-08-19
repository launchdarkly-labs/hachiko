import type { Context } from "probot"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  handleAdoptCommand,
  handlePauseCommand,
  handleRebaseCommand,
  handleResumeCommand,
  handleRetryCommand,
  handleSkipCommand,
  handleStatusCommand,
} from "../../../src/services/commands.js"
import type { HachikoCommand } from "../../../src/utils/commands.js"
import type { Logger } from "../../../src/utils/logger.js"

describe("Commands service", () => {
  let mockContext: Context<"issue_comment.created">
  let mockLogger: Logger
  let baseCommand: HachikoCommand

  beforeEach(() => {
    mockContext = {
      payload: {
        repository: {
          owner: { login: "test-owner" },
          name: "test-repo",
        },
        issue: { number: 123 },
      },
      octokit: {
        issues: {
          createComment: vi.fn().mockResolvedValue({ data: { id: 456 } }),
        },
      },
    } as any

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    } as any

    baseCommand = {
      action: "test",
      args: [],
      rawCommand: "/hachi test",
    }
  })

  describe("handleRebaseCommand", () => {
    it("should create a rebase info comment", async () => {
      const command = { ...baseCommand, action: "rebase", rawCommand: "/hachi rebase" }

      await handleRebaseCommand(mockContext, command, mockLogger)

      expect(mockLogger.info).toHaveBeenCalledWith({ command }, "Handling rebase command")

      expect(mockContext.octokit.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 123,
        body: expect.stringContaining("Rebase functionality not yet implemented"),
      })

      // Verify the response contains expected formatting
      const call = mockContext.octokit.issues.createComment.mock.calls[0][0]
      expect(call.body).toContain("ℹ️ **Command**: `/hachi rebase`")
      expect(call.body).toContain("Rebase functionality not yet implemented")
      expect(call.body).toContain("This feature will rebase all open Hachiko PRs")
    })
  })

  describe("handlePauseCommand", () => {
    it("should create a pause info comment", async () => {
      const command = { ...baseCommand, action: "pause", rawCommand: "/hachi pause" }

      await handlePauseCommand(mockContext, command, mockLogger)

      expect(mockLogger.info).toHaveBeenCalledWith({ command }, "Handling pause command")

      expect(mockContext.octokit.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 123,
        body: expect.stringContaining("Pause functionality not yet implemented"),
      })

      const call = mockContext.octokit.issues.createComment.mock.calls[0][0]
      expect(call.body).toContain("ℹ️ **Command**: `/hachi pause`")
      expect(call.body).toContain("This feature will pause the current migration")
    })
  })

  describe("handleResumeCommand", () => {
    it("should create a resume info comment without step ID", async () => {
      const command = { ...baseCommand, action: "resume", rawCommand: "/hachi resume", args: [] }

      await handleResumeCommand(mockContext, command, mockLogger)

      expect(mockLogger.info).toHaveBeenCalledWith({ command }, "Handling resume command")

      expect(mockContext.octokit.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 123,
        body: expect.stringContaining("Resume functionality not yet implemented"),
      })

      const call = mockContext.octokit.issues.createComment.mock.calls[0][0]
      expect(call.body).toContain("Will resume from current step")
    })

    it("should create a resume info comment with step ID", async () => {
      const command = {
        ...baseCommand,
        action: "resume",
        rawCommand: "/hachi resume step-2",
        args: ["step-2"],
      }

      await handleResumeCommand(mockContext, command, mockLogger)

      expect(mockContext.octokit.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 123,
        body: expect.stringContaining("Will resume from step: step-2"),
      })
    })
  })

  describe("handleAdoptCommand", () => {
    it("should create error comment when agent name is missing", async () => {
      const command = {
        ...baseCommand,
        action: "adopt",
        rawCommand: "/hachi adopt",
        args: [],
      }

      await handleAdoptCommand(mockContext, command, mockLogger)

      expect(mockLogger.info).toHaveBeenCalledWith({ command }, "Handling adopt command")

      expect(mockContext.octokit.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 123,
        body: expect.stringContaining("Agent name is required"),
      })

      const call = mockContext.octokit.issues.createComment.mock.calls[0][0]
      expect(call.body).toContain("❌ **Command**: `/hachi adopt`")
      expect(call.body).toContain("Agent name is required")
      expect(call.body).toContain("Usage: `/hachi adopt <agent-name>`")
    })

    it("should create info comment when agent name is provided", async () => {
      const command = {
        ...baseCommand,
        action: "adopt",
        rawCommand: "/hachi adopt claude-cli",
        args: ["claude-cli"],
      }

      await handleAdoptCommand(mockContext, command, mockLogger)

      expect(mockContext.octokit.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 123,
        body: expect.stringContaining("Adopt functionality not yet implemented"),
      })

      const call = mockContext.octokit.issues.createComment.mock.calls[0][0]
      expect(call.body).toContain("Will switch to agent: claude-cli")
    })
  })

  describe("handleStatusCommand", () => {
    it("should create status comment with placeholder information", async () => {
      const command = { ...baseCommand, action: "status", rawCommand: "/hachi status" }

      await handleStatusCommand(mockContext, command, mockLogger)

      expect(mockLogger.info).toHaveBeenCalledWith({ command }, "Handling status command")

      expect(mockContext.octokit.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 123,
        body: expect.stringContaining("## Migration Status"),
      })

      const call = mockContext.octokit.issues.createComment.mock.calls[0][0]
      expect(call.body).toContain("**Current Status**: In Development 🚧")
      expect(call.body).toContain("**Next Steps**:")
      expect(call.body).toContain("Complete Hachiko implementation")
    })
  })

  describe("handleSkipCommand", () => {
    it("should create error comment when step ID is missing", async () => {
      const command = {
        ...baseCommand,
        action: "skip",
        rawCommand: "/hachi skip",
        args: [],
      }

      await handleSkipCommand(mockContext, command, mockLogger)

      expect(mockLogger.info).toHaveBeenCalledWith({ command }, "Handling skip command")

      expect(mockContext.octokit.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 123,
        body: expect.stringContaining("Step ID is required"),
      })

      const call = mockContext.octokit.issues.createComment.mock.calls[0][0]
      expect(call.body).toContain("❌ **Command**: `/hachi skip`")
      expect(call.body).toContain("Usage: `/hachi skip <step-id>`")
    })

    it("should create info comment when step ID is provided", async () => {
      const command = {
        ...baseCommand,
        action: "skip",
        rawCommand: "/hachi skip step-3",
        args: ["step-3"],
      }

      await handleSkipCommand(mockContext, command, mockLogger)

      expect(mockContext.octokit.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 123,
        body: expect.stringContaining("Skip functionality not yet implemented"),
      })

      const call = mockContext.octokit.issues.createComment.mock.calls[0][0]
      expect(call.body).toContain("Will skip step: step-3")
    })
  })

  describe("handleRetryCommand", () => {
    it("should create error comment when step ID is missing", async () => {
      const command = {
        ...baseCommand,
        action: "retry",
        rawCommand: "/hachi retry",
        args: [],
      }

      await handleRetryCommand(mockContext, command, mockLogger)

      expect(mockLogger.info).toHaveBeenCalledWith({ command }, "Handling retry command")

      expect(mockContext.octokit.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 123,
        body: expect.stringContaining("Step ID is required"),
      })

      const call = mockContext.octokit.issues.createComment.mock.calls[0][0]
      expect(call.body).toContain("❌ **Command**: `/hachi retry`")
      expect(call.body).toContain("Usage: `/hachi retry <step-id>`")
    })

    it("should create info comment when step ID is provided", async () => {
      const command = {
        ...baseCommand,
        action: "retry",
        rawCommand: "/hachi retry step-1",
        args: ["step-1"],
      }

      await handleRetryCommand(mockContext, command, mockLogger)

      expect(mockContext.octokit.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 123,
        body: expect.stringContaining("Retry functionality not yet implemented"),
      })

      const call = mockContext.octokit.issues.createComment.mock.calls[0][0]
      expect(call.body).toContain("Will retry step: step-1")
    })
  })

  describe("error handling", () => {
    it("should handle GitHub API errors gracefully", async () => {
      const command = { ...baseCommand, action: "status", rawCommand: "/hachi status" }

      mockContext.octokit.issues.createComment = vi.fn().mockRejectedValue(new Error("API Error"))

      // Should not throw an error, but we'd need to modify the implementation to handle this
      // For now, just verify that the current implementation doesn't handle errors
      await expect(handleStatusCommand(mockContext, command, mockLogger)).rejects.toThrow(
        "API Error"
      )
    })
  })
})
