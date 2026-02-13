import type { Context } from "probot";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../../../src/utils/logger.js";
import { handleWorkflowRun } from "../../../src/webhooks/workflow_run.js";
import * as checks from "../../../src/services/checks.js";
import * as migrations from "../../../src/services/migrations.js";
import * as workflowUtils from "../../../src/utils/workflow.js";

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
          html_url: "https://github.com/test/repo/actions/runs/12345",
          head_sha: "abc123",
          head_commit: {
            message: "Hachiko: react-hooks - step-1",
          },
          head_branch: "hachi/react-hooks/step-1",
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
      } as any,
    };

    vi.clearAllMocks();
  });

  describe("workflow filtering", () => {
    it("should ignore non-Hachiko workflows", async () => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(false);

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(workflowUtils.extractHachikoWorkflowData)).not.toHaveBeenCalled();
      expect(vi.mocked(checks.updateChecksStatus)).not.toHaveBeenCalled();
    });

    it("should process Hachiko workflows", async () => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: undefined,
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(workflowUtils.extractHachikoWorkflowData)).toHaveBeenCalledWith(
        mockContext.payload!.workflow_run
      );
    });

    it("should log and return when workflow data cannot be extracted", async () => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue(null);

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(checks.updateChecksStatus)).not.toHaveBeenCalled();
      expect(vi.mocked(migrations.updateMigrationProgress)).not.toHaveBeenCalled();
    });
  });

  describe("checks status update", () => {
    beforeEach(() => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: undefined,
      });
    });

    it("should update checks status for all workflows", async () => {
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
  });

  describe("successful workflow handling", () => {
    beforeEach(() => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: undefined,
      });
      mockContext.payload!.workflow_run.conclusion = "success";
    });

    it("should update migration progress to awaiting-review", async () => {
      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "react-hooks",
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

    it("should handle workflows with chunks", async () => {
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: "chunk-a",
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "react-hooks",
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

  describe("failed workflow handling", () => {
    beforeEach(() => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: undefined,
      });
      mockContext.payload!.workflow_run.conclusion = "failure";
    });

    it("should update migration progress to failed", async () => {
      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "react-hooks",
        "step-1",
        "failed",
        expect.objectContaining({
          workflowRunId: 12345,
          chunk: undefined,
          conclusion: "failure",
          failureReason: expect.any(String),
        }),
        logger
      );
    });

    it("should extract failure reason from failed jobs", async () => {
      mockContext.octokit!.actions.listJobsForWorkflowRun = vi.fn().mockResolvedValue({
        data: {
          jobs: [
            {
              name: "run-agent",
              conclusion: "failure",
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
        "react-hooks",
        "step-1",
        "failed",
        expect.objectContaining({
          failureReason: expect.stringContaining('Job "run-agent" failed'),
        }),
        logger
      );
    });

    it("should handle failure reason extraction errors", async () => {
      mockContext.octokit!.actions.listJobsForWorkflowRun = vi
        .fn()
        .mockRejectedValue(new Error("API error"));

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

    it("should add failure comment to migration issue", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [
          {
            number: 42,
            title: "Migration: React Hooks",
          },
        ],
      });

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

    it("should include chunk in failure comment", async () => {
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: "chunk-a",
      });

      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [{ number: 42 }],
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 42,
        body: expect.stringContaining("❌ **Step Failed**: `step-1` (chunk-a)"),
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

      // Should not attempt to create comment
      expect(mockContext.octokit!.issues.createComment).not.toHaveBeenCalled();
    });

    it("should handle comment creation errors gracefully", async () => {
      mockContext.octokit!.issues.listForRepo = vi.fn().mockResolvedValue({
        data: [{ number: 42 }],
      });

      mockContext.octokit!.issues.createComment = vi
        .fn()
        .mockRejectedValue(new Error("API error"));

      // Should not throw even if comment fails
      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).resolves.toBeUndefined();
    });
  });

  describe("workflow conclusions", () => {
    beforeEach(() => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
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
  });

  describe("error handling", () => {
    beforeEach(() => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: undefined,
      });
      // Reset checks mock to default resolved state
      vi.mocked(checks.updateChecksStatus).mockResolvedValue(undefined);
    });

    it("should propagate errors from updateMigrationProgress", async () => {
      vi.mocked(migrations.updateMigrationProgress).mockRejectedValue(
        new Error("Migration update failed")
      );

      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).rejects.toThrow("Migration update failed");
    });

    it("should log errors appropriately", async () => {
      const error = new Error("Test error");
      vi.mocked(migrations.updateMigrationProgress).mockRejectedValue(error);

      await expect(
        handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger)
      ).rejects.toThrow("Test error");
    });
  });

  describe("edge cases", () => {
    beforeEach(() => {
      // Reset all mocks to default resolved state
      vi.mocked(checks.updateChecksStatus).mockResolvedValue(undefined);
      vi.mocked(migrations.updateMigrationProgress).mockResolvedValue(undefined);
    });

    it("should handle workflow with no head_commit", async () => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      delete mockContext.payload!.workflow_run.head_commit;

      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: undefined,
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(workflowUtils.extractHachikoWorkflowData)).toHaveBeenCalledWith(
        mockContext.payload!.workflow_run
      );
    });

    it("should handle workflow with no head_branch", async () => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      delete mockContext.payload!.workflow_run.head_branch;

      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks",
        stepId: "step-1",
        chunk: undefined,
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalled();
    });

    it("should handle workflows with special characters in IDs", async () => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "react-hooks-2024",
        stepId: "step-1.2",
        chunk: "chunk_a-1",
      });

      await handleWorkflowRun(mockContext as Context<"workflow_run.completed">, logger);

      expect(vi.mocked(migrations.updateMigrationProgress)).toHaveBeenCalledWith(
        mockContext,
        "react-hooks-2024",
        "step-1.2",
        "awaiting-review",
        expect.objectContaining({
          chunk: "chunk_a-1",
        }),
        logger
      );
    });
  });
});
