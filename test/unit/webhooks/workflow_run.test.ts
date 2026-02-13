import type { Context } from "probot";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as checks from "../../../src/services/checks.js";
import * as migrations from "../../../src/services/migrations.js";
import { createLogger } from "../../../src/utils/logger.js";
import * as workflowUtils from "../../../src/utils/workflow.js";
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
          head_commit: {
            message: "Hachiko: test-plan - step-1",
          },
          head_branch: "hachiko/test-plan-step-1",
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
            data: [],
          }),
          createComment: vi.fn().mockResolvedValue({ data: { id: 999 } }),
        },
        checks: {
          create: vi.fn().mockResolvedValue({ data: { id: 888 } }),
        },
      } as any,
    };

    vi.clearAllMocks();

    // Reset mocks to default successful behavior
    vi.mocked(checks.updateChecksStatus).mockResolvedValue(undefined);
    vi.mocked(migrations.updateMigrationProgress).mockResolvedValue(undefined);
  });

  describe("workflow filtering", () => {
    it("should ignore non-Hachiko workflows", async () => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(false);

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(workflowUtils.extractHachikoWorkflowData)).not.toHaveBeenCalled();
      expect(vi.mocked(checks.updateChecksStatus)).not.toHaveBeenCalled();
      expect(vi.mocked(migrations.updateMigrationProgress)).not.toHaveBeenCalled();
    });

    it("should process Hachiko workflows", async () => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "test-plan",
        stepId: "step-1",
        chunk: undefined,
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(workflowUtils.isHachikoWorkflow)).toHaveBeenCalledWith(
        mockContext.payload!.workflow_run
      );
      expect(vi.mocked(workflowUtils.extractHachikoWorkflowData)).toHaveBeenCalledWith(
        mockContext.payload!.workflow_run
      );
    });

    it("should handle workflows with different Hachiko name variations", async () => {
      mockContext.payload!.workflow_run.name = "Hachiko: Migration Runner";
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "test-plan",
        stepId: "step-1",
        chunk: undefined,
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(workflowUtils.extractHachikoWorkflowData)).toHaveBeenCalled();
    });
  });

  describe("workflow data extraction", () => {
    it("should warn and return when workflow data cannot be extracted", async () => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue(null);

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(checks.updateChecksStatus)).not.toHaveBeenCalled();
      expect(vi.mocked(migrations.updateMigrationProgress)).not.toHaveBeenCalled();
    });

    it("should extract workflow data with chunk", async () => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "test-plan",
        stepId: "step-1",
        chunk: "chunk-a",
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(checks.updateChecksStatus)).toHaveBeenCalledWith(
        mockContext,
        mockContext.payload!.workflow_run,
        { planId: "test-plan", stepId: "step-1", chunk: "chunk-a" },
        logger
      );
    });

    it("should extract workflow data without chunk", async () => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "test-plan",
        stepId: "step-1",
        chunk: undefined,
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(checks.updateChecksStatus)).toHaveBeenCalledWith(
        mockContext,
        mockContext.payload!.workflow_run,
        { planId: "test-plan", stepId: "step-1", chunk: undefined },
        logger
      );
    });
  });

  describe("successful workflow runs", () => {
    beforeEach(() => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "test-plan",
        stepId: "step-1",
        chunk: undefined,
      });
      mockContext.payload!.workflow_run.conclusion = "success";
    });

    it("should update checks status for successful run", async () => {
      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(checks.updateChecksStatus)).toHaveBeenCalledWith(
        mockContext,
        mockContext.payload!.workflow_run,
        { planId: "test-plan", stepId: "step-1", chunk: undefined },
        logger
      );
    });

    it("should update migration progress to awaiting-review", async () => {
      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "test-plan",
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

    it("should include chunk in migration progress update", async () => {
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "test-plan",
        stepId: "step-1",
        chunk: "chunk-a",
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "test-plan",
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

    it("should handle errors during successful run processing", async () => {
      vi.mocked(migrations.updateMigrationProgress).mockRejectedValue(new Error("Update failed"));

      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).rejects.toThrow("Update failed");
    });
  });

  describe("failed workflow runs", () => {
    beforeEach(() => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "test-plan",
        stepId: "step-1",
        chunk: undefined,
      });
      mockContext.payload!.workflow_run.conclusion = "failure";
    });

    it("should update checks status for failed run", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [{ number: 42, labels: [] }],
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(checks.updateChecksStatus)).toHaveBeenCalled();
    });

    it("should update migration progress to failed", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [{ number: 42, labels: [] }],
      });
      mockContext.octokit!.actions.listJobsForWorkflowRun = vi.fn().mockResolvedValue({
        data: {
          jobs: [
            {
              name: "test-job",
              conclusion: "failure",
            },
          ],
        },
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "test-plan",
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

    it("should add failure comment to migration issue", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [{ number: 42, labels: [] }],
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 42,
        body: expect.stringContaining("❌ **Step Failed**: `step-1`"),
      });
    });

    it("should include chunk in failure comment", async () => {
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "test-plan",
        stepId: "step-1",
        chunk: "chunk-a",
      });
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [{ number: 42, labels: [] }],
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 42,
        body: expect.stringContaining("(chunk-a)"),
      });
    });

    it("should include workflow run URL in failure comment", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [{ number: 42, labels: [] }],
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 42,
        body: expect.stringContaining("https://github.com/owner/repo/actions/runs/12345"),
      });
    });

    it("should include retry and skip commands in failure comment", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [{ number: 42, labels: [] }],
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 42,
        body: expect.stringMatching(/\/hachi retry step-1/),
      });
      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 42,
        body: expect.stringMatching(/\/hachi skip step-1/),
      });
    });

    it("should handle case when no migration issue found", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [],
      });

      // Should not throw, should just log warning
      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).resolves.toBeUndefined();

      expect(mockContext.octokit!.issues.createComment).not.toHaveBeenCalled();
    });

    it("should handle errors during failed run processing", async () => {
      vi.mocked(migrations.updateMigrationProgress).mockRejectedValue(new Error("Update failed"));

      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).rejects.toThrow("Update failed");
    });

    it("should not throw if failure comment creation fails", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [{ number: 42, labels: [] }],
      });
      mockContext.octokit!.issues.createComment = vi
        .fn()
        .mockRejectedValue(new Error("Comment failed"));

      // Should not throw
      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).resolves.toBeUndefined();
    });
  });

  describe("failure reason extraction", () => {
    beforeEach(() => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "test-plan",
        stepId: "step-1",
        chunk: undefined,
      });
      mockContext.payload!.workflow_run.conclusion = "failure";
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [{ number: 42, labels: [] }],
      });
    });

    it("should extract failure reason from failed job", async () => {
      mockContext.octokit!.actions.listJobsForWorkflowRun = vi.fn().mockResolvedValue({
        data: {
          jobs: [
            {
              name: "test-job",
              conclusion: "failure",
            },
          ],
        },
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "test-plan",
        "step-1",
        "failed",
        expect.objectContaining({
          failureReason: expect.stringContaining('Job "test-job" failed'),
        }),
        logger
      );
    });

    it("should use generic message when no failed jobs found", async () => {
      mockContext.octokit!.actions.listJobsForWorkflowRun = vi.fn().mockResolvedValue({
        data: {
          jobs: [
            {
              name: "test-job",
              conclusion: "success",
            },
          ],
        },
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "test-plan",
        "step-1",
        "failed",
        expect.objectContaining({
          failureReason: "Workflow failed with conclusion: failure",
        }),
        logger
      );
    });

    it("should use generic message when job listing fails", async () => {
      mockContext.octokit!.actions.listJobsForWorkflowRun = vi
        .fn()
        .mockRejectedValue(new Error("API error"));

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "test-plan",
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
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "test-plan",
        stepId: "step-1",
        chunk: undefined,
      });
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [{ number: 42, labels: [] }],
      });
    });

    it("should handle cancelled workflows", async () => {
      mockContext.payload!.workflow_run.conclusion = "cancelled";

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "test-plan",
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
        "test-plan",
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
        "test-plan",
        "step-1",
        "failed",
        expect.objectContaining({
          conclusion: "action_required",
        }),
        logger
      );
    });

    it("should handle skipped workflows", async () => {
      mockContext.payload!.workflow_run.conclusion = "skipped";

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "test-plan",
        "step-1",
        "failed",
        expect.objectContaining({
          conclusion: "skipped",
        }),
        logger
      );
    });
  });

  describe("error handling", () => {
    it("should throw error from top-level try-catch", async () => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockImplementation(() => {
        throw new Error("Extraction failed");
      });

      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).rejects.toThrow("Extraction failed");
    });

    it("should handle checks update errors by propagating them", async () => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "test-plan",
        stepId: "step-1",
        chunk: undefined,
      });
      vi.mocked(checks.updateChecksStatus).mockRejectedValue(new Error("Checks failed"));

      // If checks update throws, the error should propagate
      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).rejects.toThrow("Checks failed");
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete successful workflow lifecycle", async () => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "migrate-to-react-hooks",
        stepId: "convert-components",
        chunk: "chunk-1",
      });
      mockContext.payload!.workflow_run.conclusion = "success";

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      // Should update checks
      expect(vi.mocked(checks.updateChecksStatus)).toHaveBeenCalledWith(
        mockContext,
        mockContext.payload!.workflow_run,
        {
          planId: "migrate-to-react-hooks",
          stepId: "convert-components",
          chunk: "chunk-1",
        },
        logger
      );

      // Should update migration progress
      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "migrate-to-react-hooks",
        "convert-components",
        "awaiting-review",
        {
          workflowRunId: 12345,
          chunk: "chunk-1",
          conclusion: "success",
        },
        logger
      );
    });

    it("should handle complete failed workflow lifecycle", async () => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "migrate-to-react-hooks",
        stepId: "convert-components",
        chunk: "chunk-2",
      });
      mockContext.payload!.workflow_run.conclusion = "failure";
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [{ number: 100, labels: [] }],
      });
      mockContext.octokit!.actions.listJobsForWorkflowRun = vi.fn().mockResolvedValue({
        data: {
          jobs: [
            {
              name: "agent-execution",
              conclusion: "failure",
            },
          ],
        },
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      // Should update checks
      expect(vi.mocked(checks.updateChecksStatus)).toHaveBeenCalled();

      // Should update migration progress to failed
      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "migrate-to-react-hooks",
        "convert-components",
        "failed",
        expect.objectContaining({
          workflowRunId: 12345,
          chunk: "chunk-2",
          conclusion: "failure",
          failureReason: expect.stringContaining('Job "agent-execution" failed'),
        }),
        logger
      );

      // Should add failure comment
      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 100,
        body: expect.stringContaining("convert-components"),
      });
    });
  });
});
