import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the logger
vi.mock("../../../src/utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  }),
}));

// Mock PR detection service
vi.mock("../../../src/services/pr-detection.js", () => ({
  getOpenHachikoPRs: vi.fn(),
  getClosedHachikoPRs: vi.fn(),
}));

import {
  getMigrationState,
  getTaskCompletionInfo,
  getMigrationStateSummary,
  type MigrationStateInfo,
} from "../../../src/services/state-inference.js";
import { getOpenHachikoPRs, getClosedHachikoPRs } from "../../../src/services/pr-detection.js";

describe("State Inference Service", () => {
  const mockGetOpenHachikoPRs = vi.mocked(getOpenHachikoPRs);
  const mockGetClosedHachikoPRs = vi.mocked(getClosedHachikoPRs);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getMigrationState", () => {
    const mockContext = {
      octokit: {},
      payload: {
        repository: {
          owner: { login: "test-owner" },
          name: "test-repo",
        },
      },
    } as any;

    it("should return 'pending' state when no PRs exist", async () => {
      mockGetOpenHachikoPRs.mockResolvedValue([]);
      mockGetClosedHachikoPRs.mockResolvedValue([]);

      const result = await getMigrationState(mockContext, "test-migration");

      expect(result.state).toBe("pending");
      expect(result.openPRs).toEqual([]);
      expect(result.closedPRs).toEqual([]);
      expect(result.allTasksComplete).toBe(false);
    });

    it("should return 'active' state when open PRs exist", async () => {
      const openPRs = [
        {
          number: 123,
          title: "Test PR",
          state: "open" as const,
          migrationId: "test-migration",
          branch: "hachiko/test-migration",
          labels: [],
          url: "https://github.com/test/123",
          merged: false,
        },
      ];

      mockGetOpenHachikoPRs.mockResolvedValue(openPRs);
      mockGetClosedHachikoPRs.mockResolvedValue([]);

      const result = await getMigrationState(mockContext, "test-migration");

      expect(result.state).toBe("active");
      expect(result.openPRs).toEqual(openPRs);
    });

    it("should return 'paused' state when only closed PRs exist", async () => {
      const closedPRs = [
        {
          number: 123,
          title: "Test PR",
          state: "closed" as const,
          migrationId: "test-migration",
          branch: "hachiko/test-migration",
          labels: [],
          url: "https://github.com/test/123",
          merged: false,
        },
      ];

      mockGetOpenHachikoPRs.mockResolvedValue([]);
      mockGetClosedHachikoPRs.mockResolvedValue(closedPRs);

      const result = await getMigrationState(mockContext, "test-migration");

      expect(result.state).toBe("paused");
      expect(result.closedPRs).toEqual(closedPRs);
    });

    it("should return 'completed' state when all tasks are complete", async () => {
      const migrationDoc = `# Migration Document

## Tasks
- [x] Task 1
- [x] Task 2
- [x] Task 3

All tasks are complete.`;

      mockGetOpenHachikoPRs.mockResolvedValue([]);
      mockGetClosedHachikoPRs.mockResolvedValue([]);

      const result = await getMigrationState(mockContext, "test-migration", migrationDoc);

      expect(result.state).toBe("completed");
      expect(result.allTasksComplete).toBe(true);
      expect(result.totalTasks).toBe(3);
      expect(result.completedTasks).toBe(3);
    });

    it("should prioritize 'completed' over 'active' when all tasks are done", async () => {
      const migrationDoc = `## Tasks
- [x] Task 1
- [x] Task 2`;

      const openPRs = [
        {
          number: 123,
          title: "Test PR",
          state: "open" as const,
          migrationId: "test-migration",
          branch: "hachiko/test-migration",
          labels: [],
          url: "https://github.com/test/123",
          merged: false,
        },
      ];

      mockGetOpenHachikoPRs.mockResolvedValue(openPRs);
      mockGetClosedHachikoPRs.mockResolvedValue([]);

      const result = await getMigrationState(mockContext, "test-migration", migrationDoc);

      expect(result.state).toBe("completed");
      expect(result.allTasksComplete).toBe(true);
    });
  });

  describe("getTaskCompletionInfo", () => {
    it("should count tasks correctly with mixed completion states", () => {
      const content = `# Migration

## Tasks
- [x] Completed task 1
- [ ] Pending task 2
- [X] Completed task 3 (uppercase X)
- [ ] Pending task 4

Some other content.`;

      const result = getTaskCompletionInfo(content);

      expect(result.totalTasks).toBe(4);
      expect(result.completedTasks).toBe(2);
      expect(result.allTasksComplete).toBe(false);
      expect(result.tasks).toHaveLength(4);
      expect(result.tasks[0].completed).toBe(true);
      expect(result.tasks[1].completed).toBe(false);
      expect(result.tasks[2].completed).toBe(true); // Uppercase X
      expect(result.tasks[3].completed).toBe(false);
    });

    it("should return all tasks complete when all are checked", () => {
      const content = `## Tasks
- [x] Task 1
- [X] Task 2
- [x] Task 3`;

      const result = getTaskCompletionInfo(content);

      expect(result.totalTasks).toBe(3);
      expect(result.completedTasks).toBe(3);
      expect(result.allTasksComplete).toBe(true);
    });

    it("should handle content with no tasks", () => {
      const content = `# Migration Document

This migration has no checkbox tasks.

Some regular content here.`;

      const result = getTaskCompletionInfo(content);

      expect(result.totalTasks).toBe(0);
      expect(result.completedTasks).toBe(0);
      expect(result.allTasksComplete).toBe(false);
      expect(result.tasks).toEqual([]);
    });

    it("should handle tasks with complex descriptions", () => {
      const content = `## Migration Tasks
- [x] Update \`src/components/Button.tsx\` with new props interface
- [ ] Refactor \`UserProfile\` component to use hooks (see #123)
- [x] Add unit tests for \`useUserData\` hook in \`tests/hooks/\`
- [ ] Update documentation in \`README.md\` and \`CHANGELOG.md\``;

      const result = getTaskCompletionInfo(content);

      expect(result.totalTasks).toBe(4);
      expect(result.completedTasks).toBe(2);
      expect(result.allTasksComplete).toBe(false);

      expect(result.tasks[0].text).toBe(
        "Update `src/components/Button.tsx` with new props interface"
      );
      expect(result.tasks[1].text).toBe("Refactor `UserProfile` component to use hooks (see #123)");
    });

    it("should handle nested lists correctly (only top-level checkboxes)", () => {
      const content = `## Tasks
- [x] Main task 1
  - [ ] Subtask (should not be counted)
  - [x] Another subtask (should not be counted)
- [ ] Main task 2
- [x] Main task 3`;

      const result = getTaskCompletionInfo(content);

      expect(result.totalTasks).toBe(3); // Only top-level tasks
      expect(result.completedTasks).toBe(2);
    });
  });

  describe("getMigrationStateSummary", () => {
    it("should generate summary for pending state with tasks", () => {
      const stateInfo: MigrationStateInfo = {
        state: "pending",
        openPRs: [],
        closedPRs: [],
        allTasksComplete: false,
        totalTasks: 5,
        completedTasks: 0,
        currentStep: 1,
        lastUpdated: "2024-01-01T00:00:00Z",
      };

      const summary = getMigrationStateSummary(stateInfo);
      expect(summary).toBe("Pending (5 tasks planned, none started)");
    });

    it("should generate summary for pending state without tasks", () => {
      const stateInfo: MigrationStateInfo = {
        state: "pending",
        openPRs: [],
        closedPRs: [],
        allTasksComplete: false,
        totalTasks: 0,
        completedTasks: 0,
        currentStep: 1,
        lastUpdated: "2024-01-01T00:00:00Z",
      };

      const summary = getMigrationStateSummary(stateInfo);
      expect(summary).toBe("Pending (no PRs opened yet)");
    });

    it("should generate summary for active state with single PR", () => {
      const stateInfo: MigrationStateInfo = {
        state: "active",
        openPRs: [
          {
            number: 123,
            title: "Test PR",
            state: "open",
            migrationId: "test",
            branch: "hachiko/test",
            labels: [],
            url: "https://github.com/test/123",
            merged: false,
          },
        ],
        closedPRs: [],
        allTasksComplete: false,
        totalTasks: 5,
        completedTasks: 2,
        currentStep: 2,
        lastUpdated: "2024-01-01T00:00:00Z",
      };

      const summary = getMigrationStateSummary(stateInfo);
      expect(summary).toBe("Active (1 open PR • 2/5 tasks complete)");
    });

    it("should generate summary for active state with multiple PRs", () => {
      const stateInfo: MigrationStateInfo = {
        state: "active",
        openPRs: [
          {
            number: 123,
            title: "Test PR 1",
            state: "open",
            migrationId: "test",
            branch: "hachiko/test-1",
            labels: [],
            url: "https://github.com/test/123",
            merged: false,
          },
          {
            number: 124,
            title: "Test PR 2",
            state: "open",
            migrationId: "test",
            branch: "hachiko/test-2",
            labels: [],
            url: "https://github.com/test/124",
            merged: false,
          },
        ],
        closedPRs: [],
        allTasksComplete: false,
        totalTasks: 0,
        completedTasks: 0,
        currentStep: 1,
        lastUpdated: "2024-01-01T00:00:00Z",
      };

      const summary = getMigrationStateSummary(stateInfo);
      expect(summary).toBe("Active (2 open PRs)");
    });

    it("should generate summary for paused state", () => {
      const stateInfo: MigrationStateInfo = {
        state: "paused",
        openPRs: [],
        closedPRs: [
          {
            number: 123,
            title: "Closed PR",
            state: "closed",
            migrationId: "test",
            branch: "hachiko/test",
            labels: [],
            url: "https://github.com/test/123",
            merged: false,
          },
        ],
        allTasksComplete: false,
        totalTasks: 5,
        completedTasks: 3,
        currentStep: 1,
        lastUpdated: "2024-01-01T00:00:00Z",
      };

      const summary = getMigrationStateSummary(stateInfo);
      expect(summary).toBe("Paused (1 closed PR, no open PRs • 3/5 tasks complete)");
    });

    it("should generate summary for completed state", () => {
      const stateInfo: MigrationStateInfo = {
        state: "completed",
        openPRs: [],
        closedPRs: [],
        allTasksComplete: true,
        totalTasks: 5,
        completedTasks: 5,
        currentStep: 5,
        lastUpdated: "2024-01-01T00:00:00Z",
      };

      const summary = getMigrationStateSummary(stateInfo);
      expect(summary).toBe("Completed (all 5 tasks finished)");
    });
  });

  describe("calculateCurrentStep", () => {
    const mockContext = {
      octokit: {},
      payload: {
        repository: {
          owner: { login: "test-owner" },
          name: "test-repo",
        },
      },
    } as any;

    it("should return lowest open step when open PRs exist", async () => {
      const openPRs = [
        {
          number: 124,
          title: "Step 2",
          state: "open" as const,
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-2",
          labels: [],
          url: "https://github.com/test/124",
          merged: false,
        },
        {
          number: 123,
          title: "Step 1",
          state: "open" as const,
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-1",
          labels: [],
          url: "https://github.com/test/123",
          merged: false,
        },
      ];

      mockGetOpenHachikoPRs.mockResolvedValue(openPRs);
      mockGetClosedHachikoPRs.mockResolvedValue([]);

      const result = await getMigrationState(mockContext, "test-migration");

      expect(result.currentStep).toBe(1); // Should return lowest step
    });

    it("should return next step after highest merged step", async () => {
      const closedPRs = [
        {
          number: 123,
          title: "Step 1",
          state: "closed" as const,
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-1",
          labels: [],
          url: "https://github.com/test/123",
          merged: true,
        },
        {
          number: 124,
          title: "Step 2",
          state: "closed" as const,
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-2",
          labels: [],
          url: "https://github.com/test/124",
          merged: true,
        },
      ];

      mockGetOpenHachikoPRs.mockResolvedValue([]);
      mockGetClosedHachikoPRs.mockResolvedValue(closedPRs);

      const result = await getMigrationState(mockContext, "test-migration");

      expect(result.currentStep).toBe(3); // Next step after highest merged (2)
    });

    it("should return failed step when only non-merged closed PRs exist", async () => {
      const closedPRs = [
        {
          number: 125,
          title: "Step 3 (most recent failure)",
          state: "closed" as const,
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-3",
          labels: [],
          url: "https://github.com/test/125",
          merged: false,
        },
        {
          number: 123,
          title: "Step 1 (older failure)",
          state: "closed" as const,
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-1",
          labels: [],
          url: "https://github.com/test/123",
          merged: false,
        },
      ];

      mockGetOpenHachikoPRs.mockResolvedValue([]);
      mockGetClosedHachikoPRs.mockResolvedValue(closedPRs);

      const result = await getMigrationState(mockContext, "test-migration");

      expect(result.currentStep).toBe(3); // Most recent failed attempt
    });

    it("should default to step 1 when no PRs exist", async () => {
      mockGetOpenHachikoPRs.mockResolvedValue([]);
      mockGetClosedHachikoPRs.mockResolvedValue([]);

      const result = await getMigrationState(mockContext, "test-migration");

      expect(result.currentStep).toBe(1); // Default to step 1
    });

    it("should handle PRs with non-numeric step identifiers", async () => {
      const openPRs = [
        {
          number: 123,
          title: "Setup PR",
          state: "open" as const,
          migrationId: "test-migration",
          branch: "hachiko/test-migration-setup",
          labels: [],
          url: "https://github.com/test/123",
          merged: false,
        },
      ];

      mockGetOpenHachikoPRs.mockResolvedValue(openPRs);
      mockGetClosedHachikoPRs.mockResolvedValue([]);

      const result = await getMigrationState(mockContext, "test-migration");

      expect(result.currentStep).toBe(1); // Should default to 1 when no numeric steps found
    });

    it("should handle PRs without step identifiers in branch names", async () => {
      const openPRs = [
        {
          number: 123,
          title: "Migration PR",
          state: "open" as const,
          migrationId: "test-migration",
          branch: "hachiko/test-migration",
          labels: [],
          url: "https://github.com/test/123",
          merged: false,
        },
      ];

      mockGetOpenHachikoPRs.mockResolvedValue([]);
      mockGetClosedHachikoPRs.mockResolvedValue([]);

      const result = await getMigrationState(mockContext, "test-migration");

      expect(result.currentStep).toBe(1); // Should default to 1
    });

    it("should handle mixed merged and non-merged PRs correctly", async () => {
      const closedPRs = [
        {
          number: 123,
          title: "Step 1 (merged)",
          state: "closed" as const,
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-1",
          labels: [],
          url: "https://github.com/test/123",
          merged: true,
        },
        {
          number: 124,
          title: "Step 2 (failed)",
          state: "closed" as const,
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-2",
          labels: [],
          url: "https://github.com/test/124",
          merged: false,
        },
        {
          number: 125,
          title: "Step 3 (merged)",
          state: "closed" as const,
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-3",
          labels: [],
          url: "https://github.com/test/125",
          merged: true,
        },
      ];

      mockGetOpenHachikoPRs.mockResolvedValue([]);
      mockGetClosedHachikoPRs.mockResolvedValue(closedPRs);

      const result = await getMigrationState(mockContext, "test-migration");

      // Should return next step after highest merged (step 3), so step 4
      expect(result.currentStep).toBe(4);
    });
  });

  describe("edge cases", () => {
    it("should handle state inference when GitHub API fails", async () => {
      const mockContext = {
        octokit: {},
        payload: {
          repository: {
            owner: { login: "test-owner" },
            name: "test-repo",
          },
        },
      } as any;

      mockGetOpenHachikoPRs.mockRejectedValue(new Error("API Error"));
      mockGetClosedHachikoPRs.mockRejectedValue(new Error("API Error"));

      await expect(getMigrationState(mockContext, "test-migration")).rejects.toThrow("API Error");
    });

    it("should handle malformed migration document content", () => {
      const malformedContent = `# Migration
- This is not a proper checkbox
[ ] Missing dash
- [z] Invalid checkbox marker
- [x] Valid checkbox`;

      const result = getTaskCompletionInfo(malformedContent);

      expect(result.totalTasks).toBe(1); // Only the valid one
      expect(result.completedTasks).toBe(1);
      expect(result.allTasksComplete).toBe(true);
    });

    it("should handle empty migration document", () => {
      const result = getTaskCompletionInfo("");

      expect(result.totalTasks).toBe(0);
      expect(result.completedTasks).toBe(0);
      expect(result.allTasksComplete).toBe(false);
    });
  });
});
