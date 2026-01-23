import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMigrationState, getMultipleMigrationStates } from "../../../src/services/state-inference.js";
import * as prDetection from "../../../src/services/pr-detection.js";
import type { HachikoPR } from "../../../src/services/pr-detection.js";

// Mock only the API-calling functions, not the pure functions
vi.mock("../../../src/services/pr-detection.js", async () => {
  const actual = await vi.importActual("../../../src/services/pr-detection.js") as any;
  return {
    ...actual,
    getOpenHachikoPRs: vi.fn(),
    getClosedHachikoPRs: vi.fn(),
    getHachikoPRs: vi.fn(),
    getAllOpenHachikoPRs: vi.fn(),
  };
});

describe("State Inference Bug Fix - Migration State Tracking", () => {
  const mockContext = {
    repo: { owner: "test-org", repo: "test-repo" },
    octokit: {
      repos: {
        getContent: vi.fn().mockRejectedValue({ status: 404 }) // Migration document not found
      }
    } as any,
    payload: { repository: { name: "test-repo", owner: { login: "test-org" } } },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Bug fix verification", () => {
    it("should correctly identify migration as active when it has open PRs", async () => {
      // Simulate the exact scenario mentioned in issue #47
      const openPRs: HachikoPR[] = [
        {
          number: 123,
          title: "[add-jsdoc-comments] Add JSDoc comments to utility functions",
          state: "open",
          migrationId: "add-jsdoc-comments",
          branch: "hachiko/add-jsdoc-comments-step-1",
          labels: ["hachiko:migration"],
          url: "https://github.com/test-org/test-repo/pull/123",
          merged: false,
        },
      ];

      const closedPRs: HachikoPR[] = [];

      vi.mocked(prDetection.getOpenHachikoPRs).mockResolvedValue(openPRs);
      vi.mocked(prDetection.getClosedHachikoPRs).mockResolvedValue(closedPRs);

      const result = await getMigrationState(mockContext, "add-jsdoc-comments");

      // This should be "active" because it has open PRs
      expect(result.state).toBe("active");
      expect(result.openPRs).toHaveLength(1);
      expect(result.closedPRs).toHaveLength(0);
      expect(result.currentStep).toBe(1);
    });

    it("should handle document fetch errors gracefully by falling back to PR-only inference", async () => {
      // Create a context that will cause getMigrationStateWithDocument to throw
      const failingMockContext = {
        repo: { owner: "test-org", repo: "test-repo" },
        octokit: {
          repos: {
            getContent: vi.fn().mockRejectedValue(new Error("Network error"))
          }
        } as any,
        payload: { repository: { name: "test-repo", owner: { login: "test-org" } } },
      };

      // Mock PR detection to return open PRs for add-jsdoc-comments
      vi.mocked(prDetection.getOpenHachikoPRs)
        .mockImplementation(async (context, migrationId) => {
          if (migrationId === "add-jsdoc-comments") {
            return [
              {
                number: 123,
                title: "[add-jsdoc-comments] Add JSDoc comments to utility functions", 
                state: "open",
                migrationId: "add-jsdoc-comments", 
                branch: "hachiko/add-jsdoc-comments-step-1",
                labels: ["hachiko:migration"],
                url: "https://github.com/test-org/test-repo/pull/123",
                merged: false,
              },
            ];
          }
          return [];
        });

      vi.mocked(prDetection.getClosedHachikoPRs).mockResolvedValue([]);

      // After the fix, it should fall back to PR-only inference
      const results = await getMultipleMigrationStates(
        failingMockContext,
        ["add-jsdoc-comments"],
        "main"
      );

      const addJsDocState = results.get("add-jsdoc-comments");

      // FIXED: Should now infer "active" from PR activity even when document fetch fails
      expect(addJsDocState?.state).toBe("active");
      expect(addJsDocState?.openPRs).toHaveLength(1);
      expect(addJsDocState?.openPRs[0]?.migrationId).toBe("add-jsdoc-comments");
    });

    it("should handle multiple migrations correctly when one has open PRs", async () => {
      // Mock responses for add-jsdoc-comments (has open PR)
      vi.mocked(prDetection.getOpenHachikoPRs)
        .mockImplementation(async (context, migrationId) => {
          if (migrationId === "add-jsdoc-comments") {
            return [
              {
                number: 123,
                title: "[add-jsdoc-comments] Add JSDoc comments to utility functions", 
                state: "open",
                migrationId: "add-jsdoc-comments",
                branch: "hachiko/add-jsdoc-comments-step-1",
                labels: ["hachiko:migration"],
                url: "https://github.com/test-org/test-repo/pull/123",
                merged: false,
              },
            ];
          }
          return [];
        });

      vi.mocked(prDetection.getClosedHachikoPRs)
        .mockImplementation(async (_context, _migrationId) => {
          return []; // No closed PRs for any migration
        });

      const results = await getMultipleMigrationStates(
        mockContext,
        ["add-jsdoc-comments", "another-migration"],
        "main"
      );

      const addJsDocState = results.get("add-jsdoc-comments");
      const anotherMigrationState = results.get("another-migration");

      expect(addJsDocState?.state).toBe("active");
      expect(anotherMigrationState?.state).toBe("pending");
    });

    it("should prioritize open PRs over closed merged PRs", async () => {
      // Scenario: migration has both open PRs and previously merged PRs
      const openPRs: HachikoPR[] = [
        {
          number: 125,
          title: "[add-jsdoc-comments] Step 2 implementation",
          state: "open",
          migrationId: "add-jsdoc-comments",
          branch: "hachiko/add-jsdoc-comments-step-2", 
          labels: ["hachiko:migration"],
          url: "https://github.com/test-org/test-repo/pull/125",
          merged: false,
        },
      ];

      const closedPRs: HachikoPR[] = [
        {
          number: 124,
          title: "[add-jsdoc-comments] Step 1 implementation",
          state: "closed",
          migrationId: "add-jsdoc-comments",
          branch: "hachiko/add-jsdoc-comments-step-1",
          labels: ["hachiko:migration"],
          url: "https://github.com/test-org/test-repo/pull/124",
          merged: true, // Previously merged step
        },
      ];

      vi.mocked(prDetection.getOpenHachikoPRs).mockResolvedValue(openPRs);
      vi.mocked(prDetection.getClosedHachikoPRs).mockResolvedValue(closedPRs);

      const result = await getMigrationState(mockContext, "add-jsdoc-comments");

      expect(result.state).toBe("active");
      expect(result.currentStep).toBe(2); // Should be working on step 2
    });

    it("should correctly determine state when recent PR was closed without merging", async () => {
      // Scenario: agent gave up on most recent attempt
      const openPRs: HachikoPR[] = [];

      const closedPRs: HachikoPR[] = [
        {
          number: 126, // Higher number = more recent
          title: "[add-jsdoc-comments] Step 2 failed attempt",
          state: "closed",
          migrationId: "add-jsdoc-comments",
          branch: "hachiko/add-jsdoc-comments-step-2",
          labels: ["hachiko:migration"],
          url: "https://github.com/test-org/test-repo/pull/126",
          merged: false, // Agent gave up
        },
        {
          number: 124, // Lower number = older
          title: "[add-jsdoc-comments] Step 1 successful",
          state: "closed", 
          migrationId: "add-jsdoc-comments",
          branch: "hachiko/add-jsdoc-comments-step-1",
          labels: ["hachiko:migration"],
          url: "https://github.com/test-org/test-repo/pull/124",
          merged: true, // Previously successful step
        },
      ];

      vi.mocked(prDetection.getOpenHachikoPRs).mockResolvedValue(openPRs);
      vi.mocked(prDetection.getClosedHachikoPRs).mockResolvedValue(closedPRs);

      const result = await getMigrationState(mockContext, "add-jsdoc-comments");

      expect(result.state).toBe("paused"); // Should be paused because most recent PR failed
      expect(result.currentStep).toBe(2); // Should retry step 2
    });
  });
});