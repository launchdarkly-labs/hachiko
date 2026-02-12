import type { Context } from "probot";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../../../src/utils/logger.js";
import { handleWorkflowRun } from "../../../src/webhooks/workflow_run.js";
import * as checks from "../../../src/services/checks.js";
import * as migrations from "../../../src/services/migrations.js";
import * as workflow from "../../../src/utils/workflow.js";

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
          id: 123456,
          name: "Hachiko Agent Runner",
          conclusion: "success",
          html_url: "https://github.com/test-owner/test-repo/actions/runs/123456",
          head_sha: "abc123def456",
          head_commit: {
            message: "Hachiko: react-hooks - step-1",
          },
        },
        repository: {
          name: "test-repo",
          owner: { login: "test-owner" },
        },
      } as any,
      octokit: {
        checks: {
          create: vi.fn().mockResolvedValue({ data: { id: 999 } }),
        },
        issues: {
          listForRepo: vi.fn().mockResolvedValue({
            data: [
              {
                number: 42,
                labels: [{ name: "hachiko:plan:react-hooks" }],
              },
            ],
          }),
          createComment: vi.fn().mockResolvedValue({ data: { id: 888 } }),
          update: vi.fn().mockResolvedValue({ data: {} }),
        },
        actions: {
          listJobsForWorkflowRun: vi.fn().mockResolvedValue({
            data: {
              jobs: [
                {
                  name: "run-migration",
                  conclusion: "failure",
                },
              ],
            },
          }),
        },
      } as any,
    };

    vi.clearAllMocks();
  });

  describe("workflow filtering", () => {
    it("should ignore non-Hachiko workflows", async () => {
      mockContext.payload!.workflow_run.name = "CI Build";
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(false);

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(workflow.extractHachikoWorkflowData)).not.toHaveBeenCalled();
      expect(vi.mocked(checks.updateChecksStatus)).not.toHaveBeenCalled();
    });

    it("should process Hachiko workflows", async () => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: undefined,
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(workflow.extractHachikoWorkflowData)).toHaveBeenCalledWith(
        mockContext.payload!.workflow_run
      );
    });

    it("should handle workflow names with 'hachiko' in them", async () => {
      mockContext.payload!.workflow_run.name = "Run hachiko migration";
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: undefined,
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(workflow.isHachikoWorkflow)).toHaveBeenCalledWith(
        mockContext.payload!.workflow_run
      );
    });
  });

  describe("workflow data extraction", () => {
    it("should exit early when workflow data cannot be extracted", async () => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue(null);

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(checks.updateChecksStatus)).not.toHaveBeenCalled();
      expect(vi.mocked(migrations.updateMigrationProgress)).not.toHaveBeenCalled();
    });

    it("should extract workflow data with chunk information", async () => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: "components",
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(checks.updateChecksStatus)).toHaveBeenCalledWith(
        mockContext,
        mockContext.payload!.workflow_run,
        {
          planId: "react-hooks",
          stepId: "step-1",
          chunk: "components",
        },
        logger
      );
    });

    it("should extract workflow data without chunk information", async () => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "typescript-strict",
        stepId: "step-2",
        chunk: undefined,
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(checks.updateChecksStatus)).toHaveBeenCalledWith(
        mockContext,
        mockContext.payload!.workflow_run,
        {
          planId: "typescript-strict",
          stepId: "step-2",
          chunk: undefined,
        },
        logger
      );
    });
  });

  describe("successful workflow runs", () => {
    beforeEach(() => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: undefined,
      });
      mockContext.payload!.workflow_run.conclusion = "success";
    });

    it("should update checks status on successful run", async () => {
      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(checks.updateChecksStatus)).toHaveBeenCalledWith(
        mockContext,
        mockContext.payload!.workflow_run,
        {
          planId: "react-hooks",
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
        "react-hooks",
        "step-1",
        "awaiting-review",
        {
          workflowRunId: 123456,
          chunk: undefined,
          conclusion: "success",
        },
        logger
      );
    });

    it("should include chunk in metadata when present", async () => {
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: "components",
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "react-hooks",
        "step-1",
        "awaiting-review",
        {
          workflowRunId: 123456,
          chunk: "components",
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
        planId: "react-hooks",
        stepId: "step-1",
        chunk: undefined,
      });
      mockContext.payload!.workflow_run.conclusion = "failure";
    });

    it("should update checks status on failed run", async () => {
      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(checks.updateChecksStatus)).toHaveBeenCalledWith(
        mockContext,
        mockContext.payload!.workflow_run,
        {
          planId: "react-hooks",
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
        "react-hooks",
        "step-1",
        "failed",
        expect.objectContaining({
          workflowRunId: 123456,
          chunk: undefined,
          conclusion: "failure",
          failureReason: expect.any(String),
        }),
        logger
      );
    });

    it("should extract failure reason from job logs", async () => {
      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(mockContext.octokit!.actions.listJobsForWorkflowRun).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        run_id: 123456,
      });

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "react-hooks",
        "step-1",
        "failed",
        expect.objectContaining({
          failureReason: expect.stringContaining('Job "run-migration" failed'),
        }),
        logger
      );
    });

    it("should add failure comment to migration issue", async () => {
      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(mockContext.octokit!.issues.listForRepo).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        labels: "hachiko:plan:react-hooks",
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
        planId: "react-hooks",
        stepId: "step-1",
        chunk: "components",
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 42,
        body: expect.stringContaining("❌ **Step Failed**: `step-1` (components)"),
      });
    });

    it("should handle missing migration issue gracefully", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [],
      });

      // Should not throw
      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).resolves.toBeUndefined();

      // Should still update migration progress
      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalled();

      // Should not try to create comment
      expect(mockContext.octokit!.issues.createComment).not.toHaveBeenCalled();
    });

    it("should handle failure reason extraction errors", async () => {
      mockContext.octokit!.actions.listJobsForWorkflowRun = vi
        .fn()
        .mockRejectedValue(new Error("API error"));

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      // Should still update migration progress with default failure reason
      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "react-hooks",
        "step-1",
        "failed",
        expect.objectContaining({
          failureReason: "Workflow failed with conclusion: failure",
        }),
        logger
      );
    });

    it("should use default failure message when no failed jobs found", async () => {
      mockContext.octokit!.actions.listJobsForWorkflowRun = vi.fn().mockResolvedValue({
        data: {
          jobs: [], // No jobs
        },
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "react-hooks",
        "step-1",
        "failed",
        expect.objectContaining({
          failureReason: "Workflow failed with conclusion: failure",
        }),
        logger
      );
    });
  });

  describe("different workflow conclusions", () => {
    beforeEach(() => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: undefined,
      });
    });

    it("should handle cancelled workflows", async () => {
      mockContext.payload!.workflow_run.conclusion = "cancelled";

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "react-hooks",
        "step-1",
        "failed",
        expect.objectContaining({
          conclusion: "cancelled",
        }),
        logger
      );
    });

    it("should handle timed_out workflows", async () => {
      mockContext.payload!.workflow_run.conclusion = "timed_out";

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "react-hooks",
        "step-1",
        "failed",
        expect.objectContaining({
          conclusion: "timed_out",
        }),
        logger
      );
    });

    it("should handle action_required workflows", async () => {
      mockContext.payload!.workflow_run.conclusion = "action_required";

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "react-hooks",
        "step-1",
        "failed",
        expect.objectContaining({
          conclusion: "action_required",
        }),
        logger
      );
    });

    it("should handle neutral workflows", async () => {
      mockContext.payload!.workflow_run.conclusion = "neutral";

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "react-hooks",
        "step-1",
        "failed",
        expect.objectContaining({
          conclusion: "neutral",
        }),
        logger
      );
    });
  });

  describe("error handling", () => {
    beforeEach(() => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: undefined,
      });
      // Reset check status mock to resolved
      vi.mocked(checks.updateChecksStatus).mockResolvedValue(undefined);
      // Reset migration progress mock to resolved
      vi.mocked(migrations.updateMigrationProgress).mockResolvedValue(undefined);
    });

    it("should throw when checks update fails", async () => {
      vi.mocked(checks.updateChecksStatus).mockRejectedValue(new Error("Checks API error"));

      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).rejects.toThrow("Checks API error");
    });

    it("should throw when migration progress update fails for successful run", async () => {
      mockContext.payload!.workflow_run.conclusion = "success";
      vi.mocked(migrations.updateMigrationProgress).mockRejectedValue(
        new Error("Migration update error")
      );

      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).rejects.toThrow("Migration update error");
    });

    it("should throw when migration progress update fails for failed run", async () => {
      mockContext.payload!.workflow_run.conclusion = "failure";
      vi.mocked(migrations.updateMigrationProgress).mockRejectedValue(
        new Error("Migration update error")
      );

      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).rejects.toThrow("Migration update error");
    });

    it("should not throw when failure comment creation fails", async () => {
      mockContext.payload!.workflow_run.conclusion = "failure";
      mockContext.octokit!.issues.createComment = vi
        .fn()
        .mockRejectedValue(new Error("Comment creation failed"));

      // Should not throw - comment creation is not critical
      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).resolves.toBeUndefined();

      // But should still update migration progress
      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalled();
    });
  });

  describe("integration scenarios", () => {
    beforeEach(() => {
      // Reset mocks for integration tests
      vi.mocked(checks.updateChecksStatus).mockResolvedValue(undefined);
      vi.mocked(migrations.updateMigrationProgress).mockResolvedValue(undefined);
    });

    it("should handle complete successful workflow lifecycle", async () => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: "components",
      });
      mockContext.payload!.workflow_run.conclusion = "success";

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      // Should update checks
      expect(vi.mocked(checks.updateChecksStatus)).toHaveBeenCalledTimes(1);

      // Should update migration progress
      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "react-hooks",
        "step-1",
        "awaiting-review",
        {
          workflowRunId: 123456,
          chunk: "components",
          conclusion: "success",
        },
        logger
      );

      // Should not create failure comment
      expect(mockContext.octokit!.issues.createComment).not.toHaveBeenCalled();
    });

    it("should handle complete failed workflow lifecycle", async () => {
      vi.mocked(workflow.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflow.extractHachikoWorkflowData).mockReturnValue({
        planId: "typescript-strict",
        stepId: "step-2",
        chunk: "services",
      });
      mockContext.payload!.workflow_run.conclusion = "failure";

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      // Should update checks
      expect(vi.mocked(checks.updateChecksStatus)).toHaveBeenCalledTimes(1);

      // Should update migration progress
      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "typescript-strict",
        "step-2",
        "failed",
        expect.objectContaining({
          workflowRunId: 123456,
          chunk: "services",
          conclusion: "failure",
        }),
        logger
      );

      // Should create failure comment
      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 42,
        body: expect.stringContaining("❌ **Step Failed**: `step-2` (services)"),
      });
    });
  });
});
