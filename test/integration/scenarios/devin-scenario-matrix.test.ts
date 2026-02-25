/**
 * Devin agent scenario test matrix.
 *
 * Every test uses sim.createDevinPR() and a 2-step migration (total_steps: 2)
 * with agent: devin.  Devin PRs use COMMIT tracking tokens
 * (hachiko-track:{id}:{step} in the first commit message), detected via
 * Method 3 in pr-detection.ts (commit-based detection).
 */
import { describe, expect, it, vi } from "vitest";

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

import { GitHubSimulator } from "../../../src/testing/github-simulator.js";
import { getMigrationState } from "../../../src/services/state-inference.js";
import { getOpenHachikoPRs } from "../../../src/services/pr-detection.js";
import {
  simulateIssueEditHandler,
  simulatePRClosedHandler,
} from "../../helpers/scenario-helpers.js";

// ---------------------------------------------------------------------------
// Shared migration doc template (2-step Devin migration)
// ---------------------------------------------------------------------------

function migrationDoc(opts: { status?: string; currentStep?: number } = {}): string {
  return `---
schema_version: 1
id: devin-test
title: Devin Test Migration
agent: devin
status: ${opts.status ?? "pending"}
current_step: ${opts.currentStep ?? 1}
total_steps: 2
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Devin Test Migration
`;
}

// ===========================================================================
// 1  Pending → Step 1 dispatch
// ===========================================================================

describe("Devin: Pending to Step 1 dispatch", () => {
  it("clicking checkbox for pending migration dispatches step 1", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/devin-test.md", migrationDoc());

    const dashboard = sim.createDashboardIssue(`# 📊 Hachiko Migration Dashboard

## 🟡 Pending Migrations
- [x] \`devin-test\` - Devin Test Migration

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
✨ *No paused migrations*

---
`);

    const result = await simulateIssueEditHandler(sim, dashboard.number);

    expect(result.dispatches).toHaveLength(1);
    expect(result.dispatches[0]).toEqual({ migrationId: "devin-test", stepId: 1 });
  });
});

// ===========================================================================
// 2-5  Step 1 PR lifecycle
// ===========================================================================

describe("Devin: Step 1 PR lifecycle", () => {
  it("Devin PR for step 1 detected results in state active", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/devin-test.md", migrationDoc());

    sim.createDevinPR({ migrationId: "devin-test", step: 1, hash: "a1b1" });

    const ctx = sim.context();
    const state = await getMigrationState(ctx, "devin-test");

    expect(state.state).toBe("active");
    expect(state.openPRs).toHaveLength(1);
  });

  it("step 1 PR closed without merge results in state paused", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/devin-test.md", migrationDoc());

    const pr1 = sim.createDevinPR({ migrationId: "devin-test", step: 1, hash: "a2b2" });
    sim.closePR(pr1.number);

    const result = await simulatePRClosedHandler(
      sim, pr1.number, pr1.branch, false, "devin-test"
    );

    expect(result.nextAction).toBe("pause");

    const file = sim.getFile("migrations/devin-test.md")!;
    expect(file).toContain("status: paused");
  });

  it("checkbox for migration paused at step 1 dispatches step 1", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/devin-test.md", migrationDoc());

    // Step 1 PR closed without merge → pause applied via simulatePRClosedHandler
    const pr1 = sim.createDevinPR({ migrationId: "devin-test", step: 1, hash: "a3b3" });
    sim.closePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, false, "devin-test");

    // User checks paused checkbox on dashboard
    const dashboard = sim.createDashboardIssue(`## 🟡 Pending Migrations
✨ *No pending migrations*

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
- [x] \`devin-test\` - Devin Test Migration

---
`);

    const result = await simulateIssueEditHandler(sim, dashboard.number);

    expect(result.dispatches).toHaveLength(1);
    expect(result.dispatches[0]!.migrationId).toBe("devin-test");
    expect(result.dispatches[0]!.stepId).toBe(1); // retries step 1, NOT step 2
  });

  it("step 1 PR merged results in dashboard updated and step 2 dispatched", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/devin-test.md", migrationDoc());

    const pr1 = sim.createDevinPR({ migrationId: "devin-test", step: 1, hash: "a4b4" });
    sim.mergePR(pr1.number);

    const result = await simulatePRClosedHandler(
      sim, pr1.number, pr1.branch, true, "devin-test"
    );

    expect(result.nextAction).toBe("advance");
    expect(result.nextStep).toBe(2);

    // Frontmatter updated
    const file = sim.getFile("migrations/devin-test.md")!;
    expect(file).toContain("current_step: 2");

    // Workflow dispatch fired for step 2
    expect(sim.workflowDispatches).toHaveLength(1);
    expect(sim.workflowDispatches[0]!.inputs.step_id).toBe("2");
  });
});

// ===========================================================================
// 6-9  Step 2 PR lifecycle
// ===========================================================================

describe("Devin: Step 2 PR lifecycle", () => {
  it("Devin PR for step 2 detected results in state active", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/devin-test.md", migrationDoc());

    // Step 1 merged
    const pr1 = sim.createDevinPR({ migrationId: "devin-test", step: 1, hash: "b1c1" });
    sim.mergePR(pr1.number);

    // Step 2 PR opened
    sim.createDevinPR({ migrationId: "devin-test", step: 2, hash: "b2c2" });

    const ctx = sim.context();
    const state = await getMigrationState(ctx, "devin-test");

    expect(state.state).toBe("active");
    expect(state.openPRs).toHaveLength(1);
  });

  it("step 2 (of 2) merged triggers cleanup", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/devin-test.md", migrationDoc());

    // Step 1 merged
    const pr1 = sim.createDevinPR({ migrationId: "devin-test", step: 1, hash: "b3c3" });
    sim.mergePR(pr1.number);

    // Step 2 merged
    const pr2 = sim.createDevinPR({ migrationId: "devin-test", step: 2, hash: "b4c4" });
    sim.mergePR(pr2.number);

    const result = await simulatePRClosedHandler(
      sim, pr2.number, pr2.branch, true, "devin-test"
    );

    expect(result.nextAction).toBe("cleanup");

    const file = sim.getFile("migrations/devin-test.md")!;
    expect(file).toContain("status: completed");
  });

  it("step 2 PR closed without merge results in state paused", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/devin-test.md", migrationDoc());

    // Step 1 merged
    const pr1 = sim.createDevinPR({ migrationId: "devin-test", step: 1, hash: "b5c5" });
    sim.mergePR(pr1.number);

    // Step 2 closed without merge
    const pr2 = sim.createDevinPR({ migrationId: "devin-test", step: 2, hash: "b6c6" });
    sim.closePR(pr2.number);

    const result = await simulatePRClosedHandler(
      sim, pr2.number, pr2.branch, false, "devin-test"
    );

    expect(result.nextAction).toBe("pause");

    const file = sim.getFile("migrations/devin-test.md")!;
    expect(file).toContain("status: paused");
  });

  it("checkbox for migration paused at step 2 dispatches step 2", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/devin-test.md", migrationDoc());

    // Step 1 merged
    const pr1 = sim.createDevinPR({ migrationId: "devin-test", step: 1, hash: "b7c7" });
    sim.mergePR(pr1.number);

    // Step 2 closed without merge → pause
    const pr2 = sim.createDevinPR({ migrationId: "devin-test", step: 2, hash: "b8c8" });
    sim.closePR(pr2.number);
    await simulatePRClosedHandler(sim, pr2.number, pr2.branch, false, "devin-test");

    // User checks paused checkbox
    const dashboard = sim.createDashboardIssue(`## 🟡 Pending Migrations
✨ *No pending migrations*

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
- [x] \`devin-test\` - Devin Test Migration

---
`);

    const result = await simulateIssueEditHandler(sim, dashboard.number);

    expect(result.dispatches).toHaveLength(1);
    expect(result.dispatches[0]!.stepId).toBe(2);
  });
});

// ===========================================================================
// 10-12  Cleanup PR lifecycle
// ===========================================================================

describe("Devin: Cleanup PR lifecycle", () => {
  it("cleanup PR detected results in state updated", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/devin-test.md", migrationDoc());

    // Both steps merged
    const pr1 = sim.createDevinPR({ migrationId: "devin-test", step: 1, hash: "c1d1" });
    sim.mergePR(pr1.number);
    const pr2 = sim.createDevinPR({ migrationId: "devin-test", step: 2, hash: "c2d2" });
    sim.mergePR(pr2.number);

    // Cleanup PR (step > total_steps) — still detectable via commit tracking token
    sim.createDevinPR({ migrationId: "devin-test", step: 3, hash: "c3d3" });

    const ctx = sim.context();

    const openPRs = await getOpenHachikoPRs(ctx, "devin-test");
    expect(openPRs.length).toBeGreaterThanOrEqual(1);

    const state = await getMigrationState(ctx, "devin-test");
    expect(state.openPRs.length).toBeGreaterThanOrEqual(1);
  });

  it("cleanup PR merged results in dashboard showing completed", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/devin-test.md", migrationDoc());

    // Both steps merged
    const pr1 = sim.createDevinPR({ migrationId: "devin-test", step: 1, hash: "c4d4" });
    sim.mergePR(pr1.number);
    const pr2 = sim.createDevinPR({ migrationId: "devin-test", step: 2, hash: "c5d5" });
    sim.mergePR(pr2.number);

    // Cleanup PR merged
    const cleanupPR = sim.createDevinPR({ migrationId: "devin-test", step: 3, hash: "c6d6" });
    sim.mergePR(cleanupPR.number);

    const result = await simulatePRClosedHandler(
      sim, cleanupPR.number, cleanupPR.branch, true, "devin-test"
    );

    expect(result.nextAction).toBe("cleanup");

    const file = sim.getFile("migrations/devin-test.md")!;
    expect(file).toContain("status: completed");
  });

  it("cleanup PR closed without merge results in state paused", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/devin-test.md", migrationDoc());

    // Both steps merged
    const pr1 = sim.createDevinPR({ migrationId: "devin-test", step: 1, hash: "c7d7" });
    sim.mergePR(pr1.number);
    const pr2 = sim.createDevinPR({ migrationId: "devin-test", step: 2, hash: "c8d8" });
    sim.mergePR(pr2.number);

    // Cleanup PR closed without merge
    const cleanupPR = sim.createDevinPR({ migrationId: "devin-test", step: 3, hash: "c9d9" });
    sim.closePR(cleanupPR.number);

    const result = await simulatePRClosedHandler(
      sim, cleanupPR.number, cleanupPR.branch, false, "devin-test"
    );

    expect(result.nextAction).toBe("pause");
  });
});

// ===========================================================================
// 13  Paused at final step triggers cleanup dispatch
// ===========================================================================

describe("Devin: Paused at final step triggers cleanup dispatch", () => {
  it("checkbox for migration paused after all steps done dispatches cleanup", async () => {
    const sim = new GitHubSimulator();
    // currentStep 3 > totalSteps 2 — all migration steps already completed
    sim.setFile("migrations/devin-test.md", migrationDoc({ status: "paused", currentStep: 3 }));

    // Both steps merged (so state inference computes currentStep = 3)
    const pr1 = sim.createDevinPR({ migrationId: "devin-test", step: 1, hash: "d1e1" });
    sim.mergePR(pr1.number);
    const pr2 = sim.createDevinPR({ migrationId: "devin-test", step: 2, hash: "d2e2" });
    sim.mergePR(pr2.number);

    // Dashboard with checked paused checkbox
    const dashboard = sim.createDashboardIssue(`## 🟡 Pending Migrations
✨ *No pending migrations*

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
- [x] \`devin-test\` - Devin Test Migration

---
`);

    const result = await simulateIssueEditHandler(sim, dashboard.number);

    expect(result.dispatches).toHaveLength(1);
    expect(result.dispatches[0]!.migrationId).toBe("devin-test");
    expect(result.dispatches[0]!.stepId).toBe("cleanup");
  });
});
