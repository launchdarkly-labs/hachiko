import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type MigrationProgress,
  MigrationState,
  StateManager,
  type StepProgress,
  StepState,
  createStateManager,
} from "../../../src/services/state.js";
import type { ContextWithRepository } from "../../../src/types/context.js";
import { MigrationStateError } from "../../../src/utils/errors.js";

describe("State service", () => {
  let mockContext: ContextWithRepository;
  let stateManager: StateManager;

  beforeEach(() => {
    // Reset singleton state between tests
    (StateManager as any).instance = null;

    mockContext = {
      payload: {
        repository: {
          owner: { login: "test-owner" },
          name: "test-repo",
          default_branch: "main",
        },
      },
      octokit: {
        issues: {
          listForRepo: vi.fn(),
          update: vi.fn(),
        },
      },
    } as any;

    stateManager = StateManager.getInstance();
  });

  describe("StateManager singleton", () => {
    it("should return the same instance", () => {
      const instance1 = StateManager.getInstance();
      const instance2 = StateManager.getInstance();
      expect(instance1).toBe(instance2);
    });

    it("should return the same instance from createStateManager", () => {
      const instance1 = createStateManager();
      const instance2 = StateManager.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe("createMigrationState", () => {
    it("should create a new migration state with correct initial values", async () => {
      const planId = "test-migration";
      const issueNumber = 123;
      const totalSteps = 3;
      const stepIds = ["step-1", "step-2", "step-3"];

      vi.mocked(mockContext.octokit.issues.update).mockResolvedValue({} as any);

      const progress = await stateManager.createMigrationState(
        mockContext,
        planId,
        issueNumber,
        totalSteps,
        stepIds
      );

      expect(progress).toEqual({
        planId,
        state: MigrationState.DRAFT,
        issueNumber,
        totalSteps,
        completedSteps: 0,
        failedSteps: 0,
        skippedSteps: 0,
        lastUpdatedAt: expect.any(String),
        steps: {
          "step-1": {
            stepId: "step-1",
            state: StepState.PENDING,
            retryCount: 0,
          },
          "step-2": {
            stepId: "step-2",
            state: StepState.PENDING,
            retryCount: 0,
          },
          "step-3": {
            stepId: "step-3",
            state: StepState.PENDING,
            retryCount: 0,
          },
        },
        metadata: {
          owner: "test-owner",
          repository: "test-repo",
          baseBranch: "main",
        },
      });

      expect(mockContext.octokit.issues.update).toHaveBeenCalledWith({
        owner: "test-owner",
        repo: "test-repo",
        issue_number: 123,
        body: expect.stringContaining("Migration Progress: test-migration"),
      });
    });
  });

  describe("loadMigrationState", () => {
    it("should return null when no issue found", async () => {
      vi.mocked(mockContext.octokit.issues.listForRepo).mockResolvedValue({
        data: [],
      } as any);

      const result = await stateManager.loadMigrationState(mockContext, "test-migration");
      expect(result).toBeNull();
    });

    it("should parse and return migration state from issue body", async () => {
      const mockState: MigrationProgress = {
        planId: "test-migration",
        state: MigrationState.RUNNING,
        issueNumber: 123,
        totalSteps: 2,
        completedSteps: 1,
        failedSteps: 0,
        skippedSteps: 0,
        lastUpdatedAt: "2023-01-01T00:00:00.000Z",
        steps: {
          "step-1": {
            stepId: "step-1",
            state: StepState.COMPLETED,
            retryCount: 0,
            startedAt: "2023-01-01T00:00:00.000Z",
            completedAt: "2023-01-01T00:01:00.000Z",
          },
          "step-2": {
            stepId: "step-2",
            state: StepState.RUNNING,
            retryCount: 0,
            startedAt: "2023-01-01T00:01:00.000Z",
          },
        },
        metadata: {
          owner: "test-owner",
          repository: "test-repo",
          baseBranch: "main",
        },
      };

      const issueBody = `# Migration Progress
      
\`\`\`json
${JSON.stringify(mockState, null, 2)}
\`\`\``;

      vi.mocked(mockContext.octokit.issues.listForRepo).mockResolvedValue({
        data: [{ body: issueBody }],
      } as any);

      const result = await stateManager.loadMigrationState(mockContext, "test-migration");
      expect(result).toEqual(mockState);
    });

    it("should throw MigrationStateError on API error", async () => {
      vi.mocked(mockContext.octokit.issues.listForRepo).mockRejectedValue(new Error("API Error"));

      await expect(stateManager.loadMigrationState(mockContext, "test-migration")).rejects.toThrow(
        MigrationStateError
      );
    });
  });

  describe("updateMigrationState", () => {
    const mockProgress: MigrationProgress = {
      planId: "test-migration",
      state: MigrationState.DRAFT,
      issueNumber: 123,
      totalSteps: 2,
      completedSteps: 0,
      failedSteps: 0,
      skippedSteps: 0,
      lastUpdatedAt: "2023-01-01T00:00:00.000Z",
      steps: {},
      metadata: {
        owner: "test-owner",
        repository: "test-repo",
        baseBranch: "main",
      },
    };

    it("should successfully update to valid state", async () => {
      const issueBody = `\`\`\`json\n${JSON.stringify(mockProgress)}\n\`\`\``;
      vi.mocked(mockContext.octokit.issues.listForRepo).mockResolvedValue({
        data: [{ body: issueBody }],
      } as any);
      vi.mocked(mockContext.octokit.issues.update).mockResolvedValue({} as any);

      const result = await stateManager.updateMigrationState(
        mockContext,
        "test-migration",
        MigrationState.PLAN_APPROVED
      );

      expect(result.state).toBe(MigrationState.PLAN_APPROVED);
      expect(result.lastUpdatedAt).not.toBe(mockProgress.lastUpdatedAt);
    });

    it("should set startedAt when transitioning to RUNNING", async () => {
      const queuedProgress = { ...mockProgress, state: MigrationState.QUEUED };
      const issueBody = `\`\`\`json\n${JSON.stringify(queuedProgress)}\n\`\`\``;

      vi.mocked(mockContext.octokit.issues.listForRepo).mockResolvedValue({
        data: [{ body: issueBody }],
      } as any);
      vi.mocked(mockContext.octokit.issues.update).mockResolvedValue({} as any);

      const result = await stateManager.updateMigrationState(
        mockContext,
        "test-migration",
        MigrationState.RUNNING
      );

      expect(result.startedAt).toBeDefined();
      expect(result.state).toBe(MigrationState.RUNNING);
    });

    it("should set completedAt for terminal states", async () => {
      const runningProgress = { ...mockProgress, state: MigrationState.RUNNING };
      const issueBody = `\`\`\`json\n${JSON.stringify(runningProgress)}\n\`\`\``;

      vi.mocked(mockContext.octokit.issues.listForRepo).mockResolvedValue({
        data: [{ body: issueBody }],
      } as any);
      vi.mocked(mockContext.octokit.issues.update).mockResolvedValue({} as any);

      const result = await stateManager.updateMigrationState(
        mockContext,
        "test-migration",
        MigrationState.COMPLETED
      );

      expect(result.completedAt).toBeDefined();
      expect(result.state).toBe(MigrationState.COMPLETED);
    });

    it("should throw MigrationStateError for invalid state transition", async () => {
      const issueBody = `\`\`\`json\n${JSON.stringify(mockProgress)}\n\`\`\``;
      vi.mocked(mockContext.octokit.issues.listForRepo).mockResolvedValue({
        data: [{ body: issueBody }],
      } as any);

      await expect(
        stateManager.updateMigrationState(mockContext, "test-migration", MigrationState.COMPLETED)
      ).rejects.toThrow(MigrationStateError);
    });

    it("should throw MigrationStateError when migration not found", async () => {
      vi.mocked(mockContext.octokit.issues.listForRepo).mockResolvedValue({
        data: [],
      } as any);

      await expect(
        stateManager.updateMigrationState(
          mockContext,
          "test-migration",
          MigrationState.PLAN_APPROVED
        )
      ).rejects.toThrow(MigrationStateError);
    });
  });

  describe("updateStepState", () => {
    const mockProgress: MigrationProgress = {
      planId: "test-migration",
      state: MigrationState.RUNNING,
      issueNumber: 123,
      totalSteps: 2,
      completedSteps: 0,
      failedSteps: 0,
      skippedSteps: 0,
      lastUpdatedAt: "2023-01-01T00:00:00.000Z",
      steps: {
        "step-1": {
          stepId: "step-1",
          state: StepState.PENDING,
          retryCount: 0,
        },
        "step-2": {
          stepId: "step-2",
          state: StepState.PENDING,
          retryCount: 0,
        },
      },
      metadata: {
        owner: "test-owner",
        repository: "test-repo",
        baseBranch: "main",
      },
    };

    it("should successfully update step state", async () => {
      const issueBody = `\`\`\`json\n${JSON.stringify(mockProgress)}\n\`\`\``;
      vi.mocked(mockContext.octokit.issues.listForRepo).mockResolvedValue({
        data: [{ body: issueBody }],
      } as any);
      vi.mocked(mockContext.octokit.issues.update).mockResolvedValue({} as any);

      const result = await stateManager.updateStepState(
        mockContext,
        "test-migration",
        "step-1",
        StepState.RUNNING
      );

      expect(result.steps["step-1"]!.state).toBe(StepState.RUNNING);
      expect(result.steps["step-1"]!.startedAt).toBeDefined();
    });

    it("should set completedAt for terminal step states", async () => {
      const runningStepProgress = {
        ...mockProgress,
        steps: {
          ...mockProgress.steps,
          "step-1": {
            stepId: "step-1",
            state: StepState.RUNNING,
            retryCount: 0,
            startedAt: "2023-01-01T00:01:00.000Z",
          },
        },
      };
      const issueBody = `\`\`\`json\n${JSON.stringify(runningStepProgress)}\n\`\`\``;

      vi.mocked(mockContext.octokit.issues.listForRepo).mockResolvedValue({
        data: [{ body: issueBody }],
      } as any);
      vi.mocked(mockContext.octokit.issues.update).mockResolvedValue({} as any);

      const result = await stateManager.updateStepState(
        mockContext,
        "test-migration",
        "step-1",
        StepState.COMPLETED
      );

      expect(result.steps["step-1"]!.completedAt).toBeDefined();
      expect(result.completedSteps).toBe(1);
    });

    it("should apply metadata updates", async () => {
      const issueBody = `\`\`\`json\n${JSON.stringify(mockProgress)}\n\`\`\``;
      vi.mocked(mockContext.octokit.issues.listForRepo).mockResolvedValue({
        data: [{ body: issueBody }],
      } as any);
      vi.mocked(mockContext.octokit.issues.update).mockResolvedValue({} as any);

      const metadata: Partial<StepProgress> = {
        pullRequest: {
          number: 456,
          url: "https://github.com/test-owner/test-repo/pull/456",
          merged: false,
        },
        agent: "claude-cli",
      };

      const result = await stateManager.updateStepState(
        mockContext,
        "test-migration",
        "step-1",
        StepState.RUNNING,
        metadata
      );

      expect(result.steps["step-1"]!.pullRequest).toEqual(metadata.pullRequest);
      expect(result.steps["step-1"]!.agent).toBe("claude-cli");
    });

    it("should throw MigrationStateError for invalid step state transition", async () => {
      const completedStepProgress = {
        ...mockProgress,
        steps: {
          ...mockProgress.steps,
          "step-1": {
            stepId: "step-1",
            state: StepState.COMPLETED,
            retryCount: 0,
            completedAt: "2023-01-01T00:02:00.000Z",
          },
        },
      };
      const issueBody = `\`\`\`json\n${JSON.stringify(completedStepProgress)}\n\`\`\``;

      vi.mocked(mockContext.octokit.issues.listForRepo).mockResolvedValue({
        data: [{ body: issueBody }],
      } as any);

      await expect(
        stateManager.updateStepState(mockContext, "test-migration", "step-1", StepState.RUNNING)
      ).rejects.toThrow(MigrationStateError);
    });

    it("should throw MigrationStateError when step not found", async () => {
      const issueBody = `\`\`\`json\n${JSON.stringify(mockProgress)}\n\`\`\``;
      vi.mocked(mockContext.octokit.issues.listForRepo).mockResolvedValue({
        data: [{ body: issueBody }],
      } as any);

      await expect(
        stateManager.updateStepState(
          mockContext,
          "test-migration",
          "nonexistent-step",
          StepState.RUNNING
        )
      ).rejects.toThrow(MigrationStateError);
    });

    it("should recalculate progress counters correctly", async () => {
      const mixedStepsProgress = {
        ...mockProgress,
        totalSteps: 4,
        steps: {
          "step-1": { stepId: "step-1", state: StepState.COMPLETED, retryCount: 0 },
          "step-2": { stepId: "step-2", state: StepState.FAILED, retryCount: 1 },
          "step-3": { stepId: "step-3", state: StepState.SKIPPED, retryCount: 0 },
          "step-4": { stepId: "step-4", state: StepState.PENDING, retryCount: 0 },
        },
      };
      const issueBody = `\`\`\`json\n${JSON.stringify(mixedStepsProgress)}\n\`\`\``;

      vi.mocked(mockContext.octokit.issues.listForRepo).mockResolvedValue({
        data: [{ body: issueBody }],
      } as any);
      vi.mocked(mockContext.octokit.issues.update).mockResolvedValue({} as any);

      const result = await stateManager.updateStepState(
        mockContext,
        "test-migration",
        "step-2",
        StepState.RUNNING
      );

      expect(result.completedSteps).toBe(1);
      expect(result.failedSteps).toBe(0);
      expect(result.skippedSteps).toBe(1);
      expect(result.currentStep).toBe("step-2"); // Now step-2 is the only RUNNING step
    });
  });

  describe("listActiveMigrations", () => {
    it("should return empty array when no issues found", async () => {
      vi.mocked(mockContext.octokit.issues.listForRepo).mockResolvedValue({
        data: [],
      } as any);

      const result = await stateManager.listActiveMigrations(mockContext);
      expect(result).toEqual([]);
    });

    it("should parse and return all valid migration states", async () => {
      const mockState1: MigrationProgress = {
        planId: "migration-1",
        state: MigrationState.RUNNING,
        issueNumber: 123,
        totalSteps: 2,
        completedSteps: 1,
        failedSteps: 0,
        skippedSteps: 0,
        lastUpdatedAt: "2023-01-01T00:00:00.000Z",
        steps: {},
        metadata: { owner: "test-owner", repository: "test-repo", baseBranch: "main" },
      };

      const mockState2: MigrationProgress = {
        planId: "migration-2",
        state: MigrationState.QUEUED,
        issueNumber: 124,
        totalSteps: 3,
        completedSteps: 0,
        failedSteps: 0,
        skippedSteps: 0,
        lastUpdatedAt: "2023-01-01T00:00:00.000Z",
        steps: {},
        metadata: { owner: "test-owner", repository: "test-repo", baseBranch: "main" },
      };

      vi.mocked(mockContext.octokit.issues.listForRepo).mockResolvedValue({
        data: [
          { number: 123, body: `\`\`\`json\n${JSON.stringify(mockState1)}\n\`\`\`` },
          { number: 124, body: `\`\`\`json\n${JSON.stringify(mockState2)}\n\`\`\`` },
          { number: 125, body: "Invalid issue body" }, // Should be skipped
        ],
      } as any);

      const result = await stateManager.listActiveMigrations(mockContext);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockState1);
      expect(result[1]).toEqual(mockState2);
    });

    it("should return empty array on API error", async () => {
      vi.mocked(mockContext.octokit.issues.listForRepo).mockRejectedValue(new Error("API Error"));

      const result = await stateManager.listActiveMigrations(mockContext);
      expect(result).toEqual([]);
    });
  });

  describe("getMigrationState", () => {
    it("should delegate to loadMigrationState", async () => {
      const mockState: MigrationProgress = {
        planId: "test-migration",
        state: MigrationState.RUNNING,
        issueNumber: 123,
        totalSteps: 2,
        completedSteps: 1,
        failedSteps: 0,
        skippedSteps: 0,
        lastUpdatedAt: "2023-01-01T00:00:00.000Z",
        steps: {},
        metadata: { owner: "test-owner", repository: "test-repo", baseBranch: "main" },
      };

      const issueBody = `\`\`\`json\n${JSON.stringify(mockState)}\n\`\`\``;
      vi.mocked(mockContext.octokit.issues.listForRepo).mockResolvedValue({
        data: [{ body: issueBody }],
      } as any);

      const result = await stateManager.getMigrationState(mockContext, "test-migration");
      expect(result).toEqual(mockState);
    });
  });
});
