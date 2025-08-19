import { beforeEach, describe, expect, it, vi } from "vitest"
import { updateChecksStatus } from "../../../src/services/checks.js"

describe("Checks service", () => {
  let mockContext: any
  let mockLogger: any
  let mockWorkflowRun: any

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
    }

    mockWorkflowRun = {
      conclusion: "success",
      html_url: "https://github.com/owner/repo/actions/runs/123",
      head_sha: "abc123def456",
    }

    mockContext = {
      payload: {
        repository: {
          owner: { login: "test-owner" },
          name: "test-repo",
        },
      },
      octokit: {
        checks: {
          create: vi.fn().mockResolvedValue({}),
        },
      },
    }
  })

  describe("updateChecksStatus", () => {
    it("should create success check for successful workflow", async () => {
      const workflowData = {
        planId: "upgrade-junit",
        stepId: "update-deps",
        chunk: undefined,
      }

      await updateChecksStatus(mockContext, mockWorkflowRun, workflowData, mockLogger)

      expect(mockContext.octokit.checks.create).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        name: "Hachiko: upgrade-junit - update-deps",
        head_sha: "abc123def456",
        status: "completed",
        conclusion: "success",
        output: {
          title: "Migration step completed successfully",
          summary: expect.stringContaining("**Plan**: upgrade-junit\n**Step**: update-deps"),
        },
      })

      expect(mockLogger.info).toHaveBeenCalledWith({ workflowData }, "Updating checks status")
      expect(mockLogger.info).toHaveBeenCalledWith(
        { planId: "upgrade-junit", stepId: "update-deps", conclusion: "success" },
        "Updated checks status"
      )
    })

    it("should create failure check for failed workflow", async () => {
      const failedWorkflowRun = {
        ...mockWorkflowRun,
        conclusion: "failure",
      }

      const workflowData = {
        planId: "upgrade-junit",
        stepId: "update-deps",
        chunk: undefined,
      }

      await updateChecksStatus(mockContext, failedWorkflowRun, workflowData, mockLogger)

      expect(mockContext.octokit.checks.create).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        name: "Hachiko: upgrade-junit - update-deps",
        head_sha: "abc123def456",
        status: "completed",
        conclusion: "failure",
        output: {
          title: "Migration step failed",
          summary: expect.stringContaining("**Plan**: upgrade-junit\n**Step**: update-deps"),
        },
      })
    })

    it("should include chunk in check name and summary when provided", async () => {
      const workflowData = {
        planId: "upgrade-junit",
        stepId: "update-tests",
        chunk: "src/test/java",
      }

      await updateChecksStatus(mockContext, mockWorkflowRun, workflowData, mockLogger)

      expect(mockContext.octokit.checks.create).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        name: "Hachiko: upgrade-junit - update-tests (src/test/java)",
        head_sha: "abc123def456",
        status: "completed",
        conclusion: "success",
        output: {
          title: "Migration step completed successfully",
          summary: expect.stringContaining("**Chunk**: src/test/java"),
        },
      })
    })

    it("should include workflow run URL in summary", async () => {
      const workflowData = {
        planId: "upgrade-junit",
        stepId: "update-deps",
        chunk: undefined,
      }

      await updateChecksStatus(mockContext, mockWorkflowRun, workflowData, mockLogger)

      const call = mockContext.octokit.checks.create.mock.calls[0][0]
      expect(call.output.summary).toContain(
        "[View workflow run](https://github.com/owner/repo/actions/runs/123)"
      )
    })

    it("should handle API errors gracefully", async () => {
      mockContext.octokit.checks.create.mockRejectedValue(new Error("API Error"))

      const workflowData = {
        planId: "upgrade-junit",
        stepId: "update-deps",
        chunk: undefined,
      }

      // Should not throw an error
      await expect(
        updateChecksStatus(mockContext, mockWorkflowRun, workflowData, mockLogger)
      ).resolves.not.toThrow()

      expect(mockLogger.error).toHaveBeenCalledWith(
        { error: expect.any(Error), workflowData },
        "Failed to update checks status"
      )
    })

    it("should map non-success conclusions to failure", async () => {
      const cancelledWorkflowRun = {
        ...mockWorkflowRun,
        conclusion: "cancelled",
      }

      const workflowData = {
        planId: "upgrade-junit",
        stepId: "update-deps",
        chunk: undefined,
      }

      await updateChecksStatus(mockContext, cancelledWorkflowRun, workflowData, mockLogger)

      expect(mockContext.octokit.checks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          conclusion: "failure",
          output: {
            title: "Migration step failed",
            summary: expect.any(String),
          },
        })
      )
    })
  })
})
