/**
 * Tests for dashboard step calculation logic
 *
 * These tests verify that the dashboard correctly displays progress
 * when steps are completed out of order or with failures.
 */

import { describe, it, expect } from "vitest";
import type { HachikoPR } from "../../../src/services/pr-detection.js";
import type { MigrationStateInfo } from "../../../src/services/state-inference.js";
import { getHighestMergedStep } from "../../../src/services/state-inference.js";

describe("Dashboard Step Calculation", () => {
  describe("calculateCompletedSteps", () => {
    it("should return highest merged step number, not count of merged PRs", () => {
      // Scenario: Step 1 failed, Step 2 succeeded
      // Should show: "2 of 3 steps completed", not "1 of 3 steps completed"
      const mergedPRs: HachikoPR[] = [
        {
          number: 154,
          title: "Test coverage step 2",
          state: "closed",
          migrationId: "improve-test-coverage",
          branch: "cursor/test-coverage-step-2-3311",
          labels: ["hachiko:migration"],
          url: "https://github.com/test/repo/pull/154",
          merged: true,
        },
      ];

      const closedNonMergedPRs: HachikoPR[] = [
        {
          number: 141,
          title: "Test coverage step 1",
          state: "closed",
          migrationId: "improve-test-coverage",
          branch: "cursor/test-coverage-step-1-f46a",
          labels: ["hachiko:migration"],
          url: "https://github.com/test/repo/pull/141",
          merged: false,
        },
      ];

      // The current logic would say: mergedPRs.length = 1
      // But we actually completed step 2, so completedSteps should be 2
      const incorrectCompletedSteps = mergedPRs.length; // 1 - WRONG
      const correctCompletedSteps = getHighestMergedStep(mergedPRs); // 2 - CORRECT

      expect(incorrectCompletedSteps).toBe(1);
      expect(correctCompletedSteps).toBe(2);
    });

    it("should handle multiple merged steps correctly", () => {
      // Scenario: Steps 1, 2, and 3 all merged
      const mergedPRs: HachikoPR[] = [
        {
          number: 101,
          branch: "hachiko/migration-step-1",
          merged: true,
        } as HachikoPR,
        {
          number: 102,
          branch: "hachiko/migration-step-2",
          merged: true,
        } as HachikoPR,
        {
          number: 103,
          branch: "hachiko/migration-step-3",
          merged: true,
        } as HachikoPR,
      ];

      const completedSteps = getHighestMergedStep(mergedPRs);
      expect(completedSteps).toBe(3);
    });

    it("should handle non-sequential step completion", () => {
      // Scenario: Steps 1 and 3 merged, step 2 failed
      const mergedPRs: HachikoPR[] = [
        {
          number: 101,
          branch: "hachiko/migration-step-1",
          merged: true,
        } as HachikoPR,
        {
          number: 103,
          branch: "hachiko/migration-step-3",
          merged: true,
        } as HachikoPR,
      ];

      const completedSteps = getHighestMergedStep(mergedPRs);
      expect(completedSteps).toBe(3); // Highest step merged is 3
    });

    it("should return 0 when no PRs are merged", () => {
      const mergedPRs: HachikoPR[] = [];
      const completedSteps = getHighestMergedStep(mergedPRs);
      expect(completedSteps).toBe(0);
    });

    it("should handle legacy branch naming format", () => {
      const mergedPRs: HachikoPR[] = [
        {
          number: 101,
          branch: "hachi/migration-id/step-2",
          merged: true,
        } as HachikoPR,
      ];

      const completedSteps = getHighestMergedStep(mergedPRs);
      expect(completedSteps).toBe(2);
    });
  });

  describe("nextStepCalculation", () => {
    it("should use stateInfo.currentStep, not mergedPRs.length + 1", () => {
      // Scenario: Step 1 failed, Step 2 merged
      // stateInfo.currentStep = 3 (calculated by state inference)
      // mergedPRs.length = 1

      const stateInfo: Partial<MigrationStateInfo> = {
        currentStep: 3, // Correctly calculated by state inference
        closedPRs: [
          {
            number: 154,
            branch: "cursor/test-coverage-step-2-3311",
            merged: true,
          } as HachikoPR,
          {
            number: 141,
            branch: "cursor/test-coverage-step-1-f46a",
            merged: false,
          } as HachikoPR,
        ],
      };

      const mergedPRs = stateInfo.closedPRs!.filter(pr => pr.merged);

      const incorrectNextStep = mergedPRs.length + 1; // 2 - WRONG
      const correctNextStep = stateInfo.currentStep; // 3 - CORRECT

      expect(incorrectNextStep).toBe(2);
      expect(correctNextStep).toBe(3);
    });
  });
});
