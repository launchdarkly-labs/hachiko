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
  type MigrationStateInfo,
} from "../../../src/services/state-inference.js";
import { getOpenHachikoPRs, getClosedHachikoPRs, type HachikoPR } from "../../../src/services/pr-detection.js";

describe("Step Validation Bug", () => {
  const mockGetOpenHachikoPRs = vi.mocked(getOpenHachikoPRs);
  const mockGetClosedHachikoPRs = vi.mocked(getClosedHachikoPRs);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Step Validation Edge Case", () => {
    const mockContext = {
      octokit: {},
      payload: {
        repository: {
          owner: { login: "test-owner" },
          name: "test-repo",
        },
      },
    } as any;

    it("should calculate correct step and state after step 3 is merged", async () => {
      // Scenario that reproduces the bug:
      // - Steps 1, 2, 3 are merged (closed and merged = true)  
      // - No open PRs (step 4 hasn't started yet)
      // - This should be "active" state with currentStep = 4
      // - But the validation logic should allow executing step 4
      
      const closedPRs: HachikoPR[] = [
        {
          number: 101,
          title: "Migration step 1: Initial setup",
          state: "closed",
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-1",
          labels: [],
          url: "https://github.com/test-owner/test-repo/pull/101",
          merged: true,
        },
        {
          number: 102,
          title: "Migration step 2: Core changes",
          state: "closed",
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-2",
          labels: [],
          url: "https://github.com/test-owner/test-repo/pull/102",
          merged: true,
        },
        {
          number: 103,
          title: "Migration step 3: Final updates",
          state: "closed",
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-3",
          labels: [],
          url: "https://github.com/test-owner/test-repo/pull/103",
          merged: true,
        },
      ];

      const openPRs: HachikoPR[] = [];

      mockGetOpenHachikoPRs.mockResolvedValue(openPRs);
      mockGetClosedHachikoPRs.mockResolvedValue(closedPRs);

      const result = await getMigrationState(mockContext, "test-migration");

      // Assertions that should pass
      expect(result.state).toBe("active"); // Should be active because there are merged PRs
      expect(result.currentStep).toBe(4); // Next step after highest merged step (3)
      expect(result.openPRs).toHaveLength(0);
      expect(result.closedPRs).toHaveLength(3);

      // This is the key assertion that would trigger the validation bug:
      // When requesting step 4, it should be allowed since currentStep = 4
      // But the current validation logic might reject it because:
      // - Migration is "active" 
      // - Requested step (4) != current step (4) AND != next step (5)
      // - This logic error causes the validation to fail

      console.log("Migration state:", result.state);
      console.log("Current step:", result.currentStep);
      console.log("This should allow executing step 4, but validation currently rejects it");
    });

    it("should reproduce the In-Progress checkbox bug", async () => {
      // This test simulates the exact scenario from your error:
      // 1. Steps 1, 2, 3 are merged
      // 2. User clicks checkbox in In-Progress section 
      // 3. Dashboard workflow calculates current step and triggers NEXT step
      // 4. Execute workflow calculates current step again and validates

      const closedPRs: HachikoPR[] = [
        {
          number: 101,
          title: "Migration step 1",
          state: "closed",
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-1",
          labels: [],
          url: "https://github.com/test-owner/test-repo/pull/101",
          merged: true,
        },
        {
          number: 102,
          title: "Migration step 2",
          state: "closed",
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-2",
          labels: [],
          url: "https://github.com/test-owner/test-repo/pull/102",
          merged: true,
        },
        {
          number: 103,
          title: "Migration step 3",  
          state: "closed",
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-3",
          labels: [],
          url: "https://github.com/test-owner/test-repo/pull/103",
          merged: true,
        },
      ];

      mockGetOpenHachikoPRs.mockResolvedValue([]);
      mockGetClosedHachikoPRs.mockResolvedValue(closedPRs);

      // First call - Dashboard workflow calculating step
      const dashboardResult = await getMigrationState(mockContext, "test-migration");
      console.log("Dashboard workflow calculation:", dashboardResult);
      
      // Dashboard workflow logic for In-Progress section:
      const DASHBOARD_CURRENT_STEP = dashboardResult.currentStep; 
      const REQUESTED_STEP = DASHBOARD_CURRENT_STEP + 1; // Dashboard sends NEXT step for In-Progress
      console.log("Dashboard triggers execution with REQUESTED_STEP:", REQUESTED_STEP);

      // Second call - Execute workflow validating step
      const executeResult = await getMigrationState(mockContext, "test-migration");
      console.log("Execute workflow calculation:", executeResult);
      
      // Execute workflow validation:
      const EXECUTE_CURRENT_STEP = executeResult.currentStep;
      const MIGRATION_STATUS = executeResult.state;
      const NEXT_STEP = EXECUTE_CURRENT_STEP + 1;

      console.log("Execute workflow validation:");
      console.log("- MIGRATION_STATUS:", MIGRATION_STATUS);
      console.log("- EXECUTE_CURRENT_STEP:", EXECUTE_CURRENT_STEP);
      console.log("- REQUESTED_STEP:", REQUESTED_STEP);
      console.log("- NEXT_STEP:", NEXT_STEP);

      // This is where the bug might be: 
      // If dashboard and execute workflows calculate different current steps
      if (DASHBOARD_CURRENT_STEP !== EXECUTE_CURRENT_STEP) {
        console.log("🐛 BUG FOUND: Dashboard and Execute workflows calculated different current steps!");
        console.log("Dashboard calculated:", DASHBOARD_CURRENT_STEP);
        console.log("Execute calculated:", EXECUTE_CURRENT_STEP);
      }

      // Simulate the validation 
      if (MIGRATION_STATUS === "active" || MIGRATION_STATUS === "paused") {
        const shouldReject = (REQUESTED_STEP !== EXECUTE_CURRENT_STEP) && (REQUESTED_STEP !== NEXT_STEP);
        
        if (shouldReject) {
          console.log(`❌ Migration ${MIGRATION_STATUS}. Can only re-execute current step (${EXECUTE_CURRENT_STEP}) or advance to next step (${NEXT_STEP}). Use force=true to override.`);
          console.log("This would cause the error you saw!");
        } else {
          console.log("✅ Validation would pass");
        }
      }
    });

    it("should test state consistency between separate calls", async () => {
      // The real bug might be that the state calculation isn't deterministic
      // Let's test if multiple calls return the same result

      const closedPRs: HachikoPR[] = [
        {
          number: 101,
          title: "Migration step 1",
          state: "closed",
          migrationId: "test-migration", 
          branch: "hachiko/test-migration-step-1",
          labels: [],
          url: "https://github.com/test-owner/test-repo/pull/101",
          merged: true,
        },
        {
          number: 102,
          title: "Migration step 2",
          state: "closed", 
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-2",
          labels: [],
          url: "https://github.com/test-owner/test-repo/pull/102",
          merged: true,
        },
        {
          number: 103,
          title: "Migration step 3",
          state: "closed",
          migrationId: "test-migration",
          branch: "hachiko/test-migration-step-3", 
          labels: [],
          url: "https://github.com/test-owner/test-repo/pull/103",
          merged: true,
        },
      ];

      mockGetOpenHachikoPRs.mockResolvedValue([]);
      mockGetClosedHachikoPRs.mockResolvedValue(closedPRs);

      // Call the function multiple times
      const call1 = await getMigrationState(mockContext, "test-migration");
      const call2 = await getMigrationState(mockContext, "test-migration");
      const call3 = await getMigrationState(mockContext, "test-migration");

      console.log("Call 1 - currentStep:", call1.currentStep, "state:", call1.state);
      console.log("Call 2 - currentStep:", call2.currentStep, "state:", call2.state);
      console.log("Call 3 - currentStep:", call3.currentStep, "state:", call3.state);

      // These should all be the same
      expect(call1.currentStep).toBe(call2.currentStep);
      expect(call2.currentStep).toBe(call3.currentStep);
      expect(call1.state).toBe(call2.state);
      expect(call2.state).toBe(call3.state);
    });
  });
});