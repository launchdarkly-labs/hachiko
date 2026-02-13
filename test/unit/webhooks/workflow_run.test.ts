import type { Context } from "probot";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as checks from "../../../src/services/checks.js";
import * as migrations from "../../../src/services/migrations.js";
import { createLogger } from "../../../src/utils/logger.js";
import * as workflow from "../../../src/utils/workflow.js";
import { handleWorkflowRun } from "../../../src/webhooks/workflow_run.js";

// Mock all dependencies
vi.mock("../../../src/services/checks.js", () => ({
  updateChecksStatus: vi.fn(),
}));

vi.mock("../../../src/services/migrations.js", () => ({
  updateMigrationProgress: vi.fn(),
}));

vi.mock("../../../src/utils/workflow.js", () => ({
  isHachikoWorkflow: vi.fn(),
  extractHachikoWorkflowData: vi.fn(),
}));

describe("handleWorkflowRun", () => {
  let mockContext: Partial<Context<"workflow_run.completed">>;
  let logger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    logger = createLogger("test");

    mockContext = {
      payload: {
        workflow_run: {
          id: 12345,
          name: "Hachiko Agent Runner",
          conclusion: "success",
          html_url: "https://github.com/owner/repo/actions/runs/12345",
          head_sha: "abc123",
          head_branch: "hachi/plan-id/step-1",
          head_commit: {
            message: "Hachiko: plan-id - step-1",
          },
        },
        repository: {
          name: "test-repo",
          owner: { login: "test-owner" },
        },
      } as any,
      octokit: {
        actions: {
          listJobsForWorkflowRun: vi.fn().mockResolvedValue({
            data: {
              jobs: [],
            },
          }),
        },
        issues: {
          listForRepo: vi.fn().mockResolvedValue({
            data: [
              {
                number: 42,
                labels: [{ name: "hachiko:plan:plan-id" }],
              },
            ],
          }),
          createComment: vi.fn().mockResolvedValue({ data: { id: 999 } }),
        },
      } as any,
    };

    vi.clearAllMocks();
  });

  describe("workflow filtering", () => {
    it("should ignore non-Hachiko workflows", async () => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(false);

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(workflow.extractHachikoWorkflowData)).not.toHaveBeenCalled();
      expect(vi.mocked(checks.updateChecksStatus)).not.toHaveBeenCalled();
    });

    it("should process Hachiko workflows", async () => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "plan-id",
        stepId: "step-1",
        chunk: undefined,
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(workflow.extractHachikoWorkflowData)).toHaveBeenCalled();
      expect(vi.mocked(checks.updateChecksStatus)).toHaveBeenCalled();
    });
  });

  describe("workflow data extraction", () => {
    it("should handle workflows with valid data", async () => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "plan-id",
        stepId: "step-1",
        chunk: undefined,
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(workflow.extractHachikoWorkflowData)).toHaveBeenCalledWith(
        mockContext.payload!.workflow_run
      );
    });

    it("should handle workflows with chunk data", async () => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "plan-id",
        stepId: "step-1",
        chunk: "chunk-a",
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(checks.updateChecksStatus)).toHaveBeenCalledWith(
        mockContext,
        mockContext.payload!.workflow_run,
        {
          planId: "plan-id",
          stepId: "step-1",
          chunk: "chunk-a",
        },
        logger
      );
    });

    it("should return early when workflow data cannot be extracted", async () => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue(null);

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(checks.updateChecksStatus)).not.toHaveBeenCalled();
      expect(vi.mocked(migrations.updateMigrationProgress)).not.toHaveBeenCalled();
    });
  });

  describe("successful workflow runs", () => {
    beforeEach(() => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "plan-id",
        stepId: "step-1",
        chunk: undefined,
      });
      mockContext.payload!.workflow_run.conclusion = "success";
    });

    it("should update checks status for successful runs", async () => {
      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(checks.updateChecksStatus)).toHaveBeenCalledWith(
        mockContext,
        mockContext.payload!.workflow_run,
        {
          planId: "plan-id",
          stepId: "step-1",
          chunk: undefined,
        },
        logger
      );
    });

    it("should update migration progress to awaiting-review", async () => {
      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "plan-id",
        "step-1",
        "awaiting-review",
        {
          workflowRunId: 12345,
          chunk: undefined,
          conclusion: "success",
        },
        logger
      );
    });

    it("should handle successful runs with chunk data", async () => {
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "plan-id",
        stepId: "step-1",
        chunk: "chunk-a",
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "plan-id",
        "step-1",
        "awaiting-review",
        {
          workflowRunId: 12345,
          chunk: "chunk-a",
          conclusion: "success",
        },
        logger
      );
    });
  });

  describe("failed workflow runs", () => {
    beforeEach(() => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "plan-id",
        stepId: "step-1",
        chunk: undefined,
      });
      mockContext.payload!.workflow_run.conclusion = "failure";
    });

    it("should update checks status for failed runs", async () => {
      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(checks.updateChecksStatus)).toHaveBeenCalledWith(
        mockContext,
        mockContext.payload!.workflow_run,
        {
          planId: "plan-id",
          stepId: "step-1",
          chunk: undefined,
        },
        logger
      );
    });

    it("should update migration progress to failed", async () => {
      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "plan-id",
        "step-1",
        "failed",
        expect.objectContaining({
          workflowRunId: 12345,
          chunk: undefined,
          conclusion: "failure",
        }),
        logger
      );
    });

    it("should extract failure reason from failed jobs", async () => {
      mockContext.octokit!.actions.listJobsForWorkflowRun = vi.fn().mockResolvedValue({
        data: {
          jobs: [
            {
              name: "build",
              conclusion: "failure",
              html_url: "https://github.com/owner/repo/actions/runs/12345/jobs/1",
            },
          ],
        },
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(mockContext.octokit!.actions.listJobsForWorkflowRun).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        run_id: 12345,
      });

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "plan-id",
        "step-1",
        "failed",
        expect.objectContaining({
          failureReason: expect.stringContaining('Job "build" failed'),
        }),
        logger
      );
    });

    it("should add failure comment to Migration Issue", async () => {
      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(mockContext.octokit!.issues.listForRepo).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        labels: "hachiko:plan:plan-id",
        state: "open",
      });

      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 42,
        body: expect.stringContaining("❌ **Step Failed**: `step-1`"),
      });
    });

    it("should include chunk in failure comment when present", async () => {
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "plan-id",
        stepId: "step-1",
        chunk: "chunk-a",
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 42,
        body: expect.stringContaining("❌ **Step Failed**: `step-1` (chunk-a)"),
      });
    });

    it("should handle missing Migration Issue gracefully", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [],
      });

      // Should not throw
      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).resolves.toBeUndefined();

      // Should not attempt to create comment
      expect(mockContext.octokit!.issues.createComment).not.toHaveBeenCalled();
    });

    it("should handle different failure conclusions", async () => {
      mockContext.payload!.workflow_run.conclusion = "timed_out";

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "plan-id",
        "step-1",
        "failed",
        expect.objectContaining({
          conclusion: "timed_out",
        }),
        logger
      );
    });

    it("should handle cancelled workflows", async () => {
      mockContext.payload!.workflow_run.conclusion = "cancelled";

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "plan-id",
        "step-1",
        "failed",
        expect.objectContaining({
          conclusion: "cancelled",
        }),
        logger
      );
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "plan-id",
        stepId: "step-1",
        chunk: undefined,
      });
      // Ensure checks service is working by default
      vi.mocked(checks.updateChecksStatus).mockResolvedValue(undefined);
      vi.mocked(migrations.updateMigrationProgress).mockResolvedValue(undefined);
    });

    it("should throw when checks update fails", async () => {
      vi.mocked(checks.updateChecksStatus).mockRejectedValueOnce(new Error("Checks API error"));

      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).rejects.toThrow("Checks API error");
    });

    it("should throw when migration progress update fails for successful runs", async () => {
      vi.mocked(migrations.updateMigrationProgress).mockRejectedValueOnce(
        new Error("Migration update error")
      );

      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).rejects.toThrow("Migration update error");
    });

    it("should throw when migration progress update fails for failed runs", async () => {
      mockContext.payload!.workflow_run.conclusion = "failure";
      vi.mocked(migrations.updateMigrationProgress).mockRejectedValueOnce(
        new Error("Migration update error")
      );

      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).rejects.toThrow("Migration update error");
    });

    it("should handle failure reason extraction errors gracefully", async () => {
      mockContext.payload!.workflow_run.conclusion = "failure";
      mockContext.octokit!.actions.listJobsForWorkflowRun = vi
        .fn()
        .mockRejectedValue(new Error("API error"));

      // Should not throw - uses default failure reason
      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).resolves.toBeUndefined();

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "plan-id",
        "step-1",
        "failed",
        expect.objectContaining({
          failureReason: "Workflow failed with conclusion: failure",
        }),
        logger
      );
    });

    it("should handle failure comment errors gracefully", async () => {
      mockContext.payload!.workflow_run.conclusion = "failure";
      mockContext.octokit!.issues.createComment = vi
        .fn()
        .mockRejectedValue(new Error("Comment API error"));

      // Should not throw - failure comment is not critical
      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).resolves.toBeUndefined();
    });

    it("should handle errors when listing issues for failure comment", async () => {
      mockContext.payload!.workflow_run.conclusion = "failure";
      mockContext.octokit!.issues.listForRepo = vi
        .fn()
        .mockRejectedValue(new Error("List issues error"));

      // Should not throw - failure comment is not critical
      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).resolves.toBeUndefined();
    });
  });

  describe("workflow run details", () => {
    beforeEach(() => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "plan-id",
        stepId: "step-1",
        chunk: undefined,
      });
      // Ensure services are working by default
      vi.mocked(checks.updateChecksStatus).mockResolvedValue(undefined);
      vi.mocked(migrations.updateMigrationProgress).mockResolvedValue(undefined);
    });

    it("should include workflow run URL in failure comments", async () => {
      mockContext.payload!.workflow_run.conclusion = "failure";

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 42,
        body: expect.stringContaining("https://github.com/owner/repo/actions/runs/12345"),
      });
    });

    it("should include retry instructions in failure comments", async () => {
      mockContext.payload!.workflow_run.conclusion = "failure";

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 42,
        body: expect.stringContaining("/hachi retry step-1"),
      });
    });

    it("should include skip instructions in failure comments", async () => {
      mockContext.payload!.workflow_run.conclusion = "failure";

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 42,
        body: expect.stringContaining("/hachi skip step-1"),
      });
    });
  });
});
