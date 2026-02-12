import type { Context } from "probot";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as checks from "../../../src/services/checks.js";
import * as migrations from "../../../src/services/migrations.js";
import { createLogger } from "../../../src/utils/logger.js";
import * as workflowUtils from "../../../src/utils/workflow.js";
import { handleWorkflowRun } from "../../../src/webhooks/workflow_run.js";

vi.mock("../../../src/services/checks.js", () => ({
  updateChecksStatus: vi.fn(),
}));

vi.mock("../../../src/services/migrations.js", () => ({
  updateMigrationProgress: vi.fn(),
}));

vi.mock("../../../src/utils/workflow.js", () => ({
  extractHachikoWorkflowData: vi.fn(),
  isHachikoWorkflow: vi.fn(),
}));

describe("handleWorkflowRun", () => {
  let mockContext: Partial<Context<"workflow_run.completed">>;
  let logger: ReturnType<typeof createLogger>;

  const createWorkflowRunPayload = (overrides: Record<string, unknown> = {}) => ({
    workflow_run: {
      id: 789,
      name: "Hachiko Agent Runner",
      conclusion: "success",
      html_url: "https://github.com/test-owner/test-repo/actions/runs/789",
      head_sha: "def456",
      head_branch: "hachi/test-migration/step-1",
      head_commit: {
        message: "Hachiko: test-migration - step-1",
      },
      ...overrides,
    },
    repository: {
      name: "test-repo",
      owner: { login: "test-owner" },
    },
  });

  beforeEach(() => {
    logger = createLogger("test");

    mockContext = {
      payload: createWorkflowRunPayload(),
      octokit: {
        checks: {
          create: vi.fn().mockResolvedValue({ data: { id: 1 } }),
        },
        issues: {
          listForRepo: vi.fn().mockResolvedValue({
            data: [
              {
                number: 123,
                labels: [
                  { name: "hachiko:plan:test-migration" },
                  { name: "hachiko:status:running" },
                ],
              },
            ],
          }),
          createComment: vi.fn().mockResolvedValue({ data: { id: 999 } }),
          update: vi.fn().mockResolvedValue({ data: {} }),
        },
        actions: {
          listJobsForWorkflowRun: vi.fn().mockResolvedValue({
            data: {
              jobs: [{ name: "test-job", conclusion: "failure" }],
            },
          }),
        },
      } as any,
    };

    vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(true);
    vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
      planId: "test-migration",
      stepId: "step-1",
      chunk: undefined,
    });
    vi.mocked(checks.updateChecksStatus).mockResolvedValue(undefined);
    vi.mocked(migrations.updateMigrationProgress).mockResolvedValue(undefined);

    vi.clearAllMocks();
  });

  describe("workflow filtering", () => {
    it("should ignore non-Hachiko workflows", async () => {
      vi.mocked(workflowUtils.isHachikoWorkflow).mockReturnValue(false);

      await handleWorkflowRun(
        mockContext as Context<"workflow_run.completed">,
        logger
      );

      expect(workflowUtils.extractHachikoWorkflowData).not.toHaveBeenCalled();
      expect(checks.updateChecksStatus).not.toHaveBeenCalled();
      expect(migrations.updateMigrationProgress).not.toHaveBeenCalled();
    });

    it("should process Hachiko workflows", async () => {
      await handleWorkflowRun(
        mockContext as Context<"workflow_run.completed">,
        logger
      );

      expect(workflowUtils.extractHachikoWorkflowData).toHaveBeenCalledWith(
        mockContext.payload!.workflow_run
      );
    });
  });

  describe("workflow data extraction", () => {
    it("should return early when workflow data cannot be extracted", async () => {
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue(null);

      await handleWorkflowRun(
        mockContext as Context<"workflow_run.completed">,
        logger
      );

      expect(checks.updateChecksStatus).not.toHaveBeenCalled();
      expect(migrations.updateMigrationProgress).not.toHaveBeenCalled();
    });
  });

  describe("successful workflow run", () => {
    it("should update checks status and migration progress on success", async () => {
      await handleWorkflowRun(
        mockContext as Context<"workflow_run.completed">,
        logger
      );

      expect(checks.updateChecksStatus).toHaveBeenCalledWith(
        mockContext,
        mockContext.payload!.workflow_run,
        { planId: "test-migration", stepId: "step-1", chunk: undefined },
        logger
      );

      expect(migrations.updateMigrationProgress).toHaveBeenCalledWith(
        mockContext,
        "test-migration",
        "step-1",
        "awaiting-review",
        expect.objectContaining({
          workflowRunId: 789,
          chunk: undefined,
          conclusion: "success",
        }),
        logger
      );
    });

    it("should include chunk in metadata when workflow has chunk", async () => {
      vi.mocked(workflowUtils.extractHachikoWorkflowData).mockReturnValue({
        planId: "test-migration",
        stepId: "step-1",
        chunk: "chunk-a",
      });

      await handleWorkflowRun(
        mockContext as Context<"workflow_run.completed">,
        logger
      );

      expect(migrations.updateMigrationProgress).toHaveBeenCalledWith(
        mockContext,
        "test-migration",
        "step-1",
        "awaiting-review",
        expect.objectContaining({
          workflowRunId: 789,
          chunk: "chunk-a",
          conclusion: "success",
        }),
        logger
      );
    });
  });

  describe("failed workflow run", () => {
    beforeEach(() => {
      mockContext.payload = createWorkflowRunPayload({
        conclusion: "failure",
      }) as any;
    });

    it("should update migration progress to failed and add failure comment", async () => {
      await handleWorkflowRun(
        mockContext as Context<"workflow_run.completed">,
        logger
      );

      expect(checks.updateChecksStatus).toHaveBeenCalled();
      expect(migrations.updateMigrationProgress).toHaveBeenCalledWith(
        mockContext,
        "test-migration",
        "step-1",
        "failed",
        expect.objectContaining({
          workflowRunId: 789,
          chunk: undefined,
          conclusion: "failure",
          failureReason: expect.stringContaining('Job "test-job" failed'),
        }),
        logger
      );

      expect(mockContext.octokit!.issues.createComment).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 123,
        body: expect.stringContaining("Step Failed"),
      });
    });

    it("should extract failure reason from workflow jobs", async () => {
      await handleWorkflowRun(
        mockContext as Context<"workflow_run.completed">,
        logger
      );

      expect(mockContext.octokit!.actions.listJobsForWorkflowRun).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        run_id: 789,
      });

      const updateCall = vi.mocked(migrations.updateMigrationProgress).mock
        .calls[0];
      expect(updateCall[4].failureReason).toContain('Job "test-job" failed');
      expect(updateCall[4].failureReason).toContain("workflow run");
    });

    it("should use fallback failure reason when listJobsForWorkflowRun fails", async () => {
      vi.mocked(mockContext.octokit!.actions.listJobsForWorkflowRun).mockRejectedValue(
        new Error("API error")
      );

      await handleWorkflowRun(
        mockContext as Context<"workflow_run.completed">,
        logger
      );

      const updateCall = vi.mocked(migrations.updateMigrationProgress).mock
        .calls[0];
      expect(updateCall[4].failureReason).toBe(
        "Workflow failed with conclusion: failure"
      );
    });

    it("should use fallback failure reason when no failed jobs in workflow run", async () => {
      vi.mocked(mockContext.octokit!.actions.listJobsForWorkflowRun).mockResolvedValue(
        {
          data: {
            jobs: [
              { name: "setup", conclusion: "success" },
              { name: "build", conclusion: "cancelled" },
            ],
          },
        } as any
      );

      await handleWorkflowRun(
        mockContext as Context<"workflow_run.completed">,
        logger
      );

      const updateCall = vi.mocked(migrations.updateMigrationProgress).mock
        .calls[0];
      expect(updateCall[4].failureReason).toBe(
        "Workflow failed with conclusion: failure"
      );
    });

    it("should handle addFailureComment errors gracefully without throwing", async () => {
      vi.mocked(mockContext.octokit!.issues.createComment).mockRejectedValue(
        new Error("Comment API failed")
      );

      await expect(
        handleWorkflowRun(
          mockContext as Context<"workflow_run.completed">,
          logger
        )
      ).resolves.toBeUndefined();
    });

    it("should handle no migration issue found for failure comment", async () => {
      vi.mocked(mockContext.octokit!.issues.listForRepo).mockResolvedValue({
        data: [],
      } as any);

      await handleWorkflowRun(
        mockContext as Context<"workflow_run.completed">,
        logger
      );

      // updateMigrationProgress will be called but may fail - addFailureComment
      // handles no migration issue gracefully (doesn't throw)
      expect(migrations.updateMigrationProgress).toHaveBeenCalled();
    });
  });

  describe("error handling", () => {
    it("should propagate errors from updateMigrationProgress on success", async () => {
      vi.mocked(migrations.updateMigrationProgress).mockRejectedValue(
        new Error("Migration update failed")
      );

      await expect(
        handleWorkflowRun(
          mockContext as Context<"workflow_run.completed">,
          logger
        )
      ).rejects.toThrow("Migration update failed");
    });

    it("should propagate errors from handleFailedRun", async () => {
      mockContext.payload = createWorkflowRunPayload({
        conclusion: "failure",
      }) as any;
      vi.mocked(migrations.updateMigrationProgress).mockRejectedValue(
        new Error("Update failed")
      );

      await expect(
        handleWorkflowRun(
          mockContext as Context<"workflow_run.completed">,
          logger
        )
      ).rejects.toThrow("Update failed");
    });
  });
});
