/**
 * Cursor agent scenario matrix: comprehensive integration tests covering
 * every state transition for a Cursor-based migration lifecycle.
 *
 * Each test uses a fresh GitHubSimulator to ensure complete isolation.
 * Cursor PRs use body-based tracking tokens: <!-- hachiko-track:{id}:{step} -->
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
import { determineMigrationAction } from "../../../src/services/workflow-orchestration.js";
import { simulateIssueEditHandler, simulatePRClosedHandler } from "../../helpers/scenario-helpers.js";

// ---------------------------------------------------------------------------
// Helper: create the standard migration file for cursor-mig
// ---------------------------------------------------------------------------
function setupMigrationFile(
  sim: GitHubSimulator,
  overrides: { status?: string; currentStep?: number; totalSteps?: number } = {}
) {
  const status = overrides.status ?? "pending";
  const currentStep = overrides.currentStep ?? 1;
  const totalSteps = overrides.totalSteps ?? 2;

  sim.setFile(
    "migrations/cursor-mig.md",
    `---
schema_version: 1
id: cursor-mig
title: Cursor Migration
agent: cursor
status: ${status}
current_step: ${currentStep}
total_steps: ${totalSteps}
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Cursor Migration

## Step 1: First step
## Step 2: Second step
`
  );
}

// ============================================================================
// Pending → Step 1 dispatch
// ============================================================================

describe("Cursor scenario matrix: Pending → Step 1 dispatch", () => {
  it("clicking checkbox for pending migration dispatches step 1", async () => {
    const sim = new GitHubSimulator();
    setupMigrationFile(sim, { status: "pending", currentStep: 1, totalSteps: 2 });

    const dashboard = sim.createDashboardIssue(`## 🟡 Pending Migrations
- [x] \`cursor-mig\` - Cursor Migration

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
✨ *No paused migrations*

---
`);

    const { dispatches } = await simulateIssueEditHandler(sim, dashboard.number);

    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toEqual({ migrationId: "cursor-mig", stepId: 1 });
    expect(sim.workflowDispatches).toHaveLength(1);
  });
});

// ============================================================================
// Step 1 PR lifecycle
// ============================================================================

describe("Cursor scenario matrix: Step 1 PR lifecycle", () => {
  it("Cursor PR for step 1 detected with active state", async () => {
    const sim = new GitHubSimulator();
    setupMigrationFile(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    sim.createCursorPR({ migrationId: "cursor-mig", step: 1, description: "First step" });

    const ctx = sim.context();
    const state = await getMigrationState(ctx, "cursor-mig");
    expect(state.state).toBe("active");
    expect(state.openPRs).toHaveLength(1);
  });

  it("step 1 PR closed without merge pauses migration", async () => {
    const sim = new GitHubSimulator();
    setupMigrationFile(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    const pr = sim.createCursorPR({ migrationId: "cursor-mig", step: 1, description: "First step" });
    sim.closePR(pr.number);

    const result = await simulatePRClosedHandler(sim, pr.number, pr.branch, false, "cursor-mig");
    expect(result.nextAction).toBe("pause");

    const content = sim.getFile("migrations/cursor-mig.md")!;
    expect(content).toContain("status: paused");
    expect(content).toContain("error: Migration paused");
  });

  it("checkbox for paused migration at step 1 dispatches step 1", async () => {
    const sim = new GitHubSimulator();
    setupMigrationFile(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    // Create and close step 1 PR to trigger pause
    const pr = sim.createCursorPR({ migrationId: "cursor-mig", step: 1, description: "First step" });
    sim.closePR(pr.number);
    await simulatePRClosedHandler(sim, pr.number, pr.branch, false, "cursor-mig");

    // Now the migration doc is paused at step 1
    const dashboard = sim.createDashboardIssue(`## 🟡 Pending Migrations
✨ *No pending migrations*

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
- [x] \`cursor-mig\` - Cursor Migration

---
`);

    const { dispatches } = await simulateIssueEditHandler(sim, dashboard.number);
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]!.stepId).toBe(1);
  });

  it("step 1 PR merged advances to step 2", async () => {
    const sim = new GitHubSimulator();
    setupMigrationFile(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    const pr = sim.createCursorPR({ migrationId: "cursor-mig", step: 1, description: "First step" });
    sim.mergePR(pr.number);

    const result = await simulatePRClosedHandler(sim, pr.number, pr.branch, true, "cursor-mig");
    expect(result.nextAction).toBe("advance");
    expect(result.nextStep).toBe(2);

    const content = sim.getFile("migrations/cursor-mig.md")!;
    expect(content).toContain("current_step: 2");

    // A dispatch for step 2 should have been created
    const step2Dispatch = sim.workflowDispatches.find((d) => d.inputs.step_id === "2");
    expect(step2Dispatch).toBeDefined();
  });
});

// ============================================================================
// Step 2 PR lifecycle
// ============================================================================

describe("Cursor scenario matrix: Step 2 PR lifecycle", () => {
  it("Cursor PR for step 2 detected with active state", async () => {
    const sim = new GitHubSimulator();
    setupMigrationFile(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    // Merge step 1 via the full handler chain
    const pr1 = sim.createCursorPR({ migrationId: "cursor-mig", step: 1, description: "First step" });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "cursor-mig");

    // Open step 2 PR
    sim.createCursorPR({ migrationId: "cursor-mig", step: 2, description: "Second step" });

    const ctx = sim.context();
    const state = await getMigrationState(ctx, "cursor-mig");
    expect(state.state).toBe("active");
    expect(state.openPRs).toHaveLength(1);
  });

  it("step 2 (final) merged triggers cleanup", async () => {
    const sim = new GitHubSimulator();
    setupMigrationFile(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    // Merge step 1
    const pr1 = sim.createCursorPR({ migrationId: "cursor-mig", step: 1, description: "First step" });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "cursor-mig");

    // Merge step 2 (final)
    const pr2 = sim.createCursorPR({ migrationId: "cursor-mig", step: 2, description: "Second step" });
    sim.mergePR(pr2.number);
    const result = await simulatePRClosedHandler(sim, pr2.number, pr2.branch, true, "cursor-mig");

    expect(result.nextAction).toBe("cleanup");

    const content = sim.getFile("migrations/cursor-mig.md")!;
    expect(content).toContain("status: completed");
  });

  it("step 2 PR closed without merge pauses migration", async () => {
    const sim = new GitHubSimulator();
    setupMigrationFile(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    // Merge step 1
    const pr1 = sim.createCursorPR({ migrationId: "cursor-mig", step: 1, description: "First step" });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "cursor-mig");

    // Open and close step 2 without merge
    const pr2 = sim.createCursorPR({ migrationId: "cursor-mig", step: 2, description: "Second step" });
    sim.closePR(pr2.number);
    const result = await simulatePRClosedHandler(sim, pr2.number, pr2.branch, false, "cursor-mig");

    expect(result.nextAction).toBe("pause");

    const content = sim.getFile("migrations/cursor-mig.md")!;
    expect(content).toContain("status: paused");
  });

  it("checkbox for paused migration at step 2 dispatches step 2", async () => {
    const sim = new GitHubSimulator();
    setupMigrationFile(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    // Merge step 1
    const pr1 = sim.createCursorPR({ migrationId: "cursor-mig", step: 1, description: "First step" });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "cursor-mig");

    // Open and close step 2 without merge → pause
    const pr2 = sim.createCursorPR({ migrationId: "cursor-mig", step: 2, description: "Second step" });
    sim.closePR(pr2.number);
    await simulatePRClosedHandler(sim, pr2.number, pr2.branch, false, "cursor-mig");

    // Resume from dashboard
    const dashboard = sim.createDashboardIssue(`## 🟡 Pending Migrations
✨ *No pending migrations*

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
- [x] \`cursor-mig\` - Cursor Migration

---
`);

    const { dispatches } = await simulateIssueEditHandler(sim, dashboard.number);
    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]!.stepId).toBe(2);
  });
});

// ============================================================================
// Post-completion edge cases
// ============================================================================

describe("Cursor scenario matrix: Post-completion edge cases", () => {
  it("Cursor PR still detectable after all steps merged", async () => {
    const sim = new GitHubSimulator();
    setupMigrationFile(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    // Merge steps 1 and 2
    const pr1 = sim.createCursorPR({ migrationId: "cursor-mig", step: 1, description: "First step" });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "cursor-mig");

    const pr2 = sim.createCursorPR({ migrationId: "cursor-mig", step: 2, description: "Second step" });
    sim.mergePR(pr2.number);
    await simulatePRClosedHandler(sim, pr2.number, pr2.branch, true, "cursor-mig");

    // Create an extra PR after completion
    sim.createCursorPR({ migrationId: "cursor-mig", step: 3, description: "Extra step" });

    const ctx = sim.context();
    const detected = await getOpenHachikoPRs(ctx, "cursor-mig");
    expect(detected.length).toBeGreaterThanOrEqual(1);

    const state = await getMigrationState(ctx, "cursor-mig");
    expect(state.openPRs.length).toBeGreaterThanOrEqual(1);
  });

  it("extra PR merged after completion still triggers cleanup", async () => {
    const sim = new GitHubSimulator();
    setupMigrationFile(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    // Merge steps 1 and 2
    const pr1 = sim.createCursorPR({ migrationId: "cursor-mig", step: 1, description: "First step" });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "cursor-mig");

    const pr2 = sim.createCursorPR({ migrationId: "cursor-mig", step: 2, description: "Second step" });
    sim.mergePR(pr2.number);
    await simulatePRClosedHandler(sim, pr2.number, pr2.branch, true, "cursor-mig");

    // Create and merge an extra PR
    const pr3 = sim.createCursorPR({ migrationId: "cursor-mig", step: 3, description: "Extra step" });
    sim.mergePR(pr3.number);

    const result = await simulatePRClosedHandler(sim, pr3.number, pr3.branch, true, "cursor-mig");
    expect(result.nextAction).toBe("cleanup");
  });

  it("extra PR closed without merge after completion triggers pause", async () => {
    const sim = new GitHubSimulator();
    setupMigrationFile(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    // Merge steps 1 and 2
    const pr1 = sim.createCursorPR({ migrationId: "cursor-mig", step: 1, description: "First step" });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "cursor-mig");

    const pr2 = sim.createCursorPR({ migrationId: "cursor-mig", step: 2, description: "Second step" });
    sim.mergePR(pr2.number);
    await simulatePRClosedHandler(sim, pr2.number, pr2.branch, true, "cursor-mig");

    // Create and close extra PR without merge
    const pr3 = sim.createCursorPR({ migrationId: "cursor-mig", step: 3, description: "Extra step" });
    sim.closePR(pr3.number);

    const result = await simulatePRClosedHandler(sim, pr3.number, pr3.branch, false, "cursor-mig");
    expect(result.nextAction).toBe("pause");
  });
});

// ============================================================================
// Paused at final step → cleanup dispatch
// ============================================================================

describe("Cursor scenario matrix: Paused at final step → cleanup dispatch", () => {
  it("checkbox for migration paused after all steps dispatches cleanup", async () => {
    const sim = new GitHubSimulator();

    // Set up migration as paused with current_step past total_steps
    setupMigrationFile(sim, { status: "paused", currentStep: 3, totalSteps: 2 });

    // Create and merge Cursor PRs for steps 1 and 2 so state inference sees them
    const pr1 = sim.createCursorPR({ migrationId: "cursor-mig", step: 1, description: "First step" });
    sim.mergePR(pr1.number);

    const pr2 = sim.createCursorPR({ migrationId: "cursor-mig", step: 2, description: "Second step" });
    sim.mergePR(pr2.number);

    const ctx = sim.context();
    const stateInfo = await getMigrationState(ctx, "cursor-mig");

    const action = determineMigrationAction({
      migrationId: "cursor-mig",
      section: "paused",
      stateInfo,
      totalSteps: 2,
    });

    expect(action.action).toBe("cleanup");
    expect(action.stepId).toBe("cleanup");
  });
});
