/**
 * Devin agent scenario matrix tests.
 *
 * Exercises the full Devin agent lifecycle: pending → dispatch → PR lifecycle →
 * pause/resume → completion, using commit-based tracking tokens (Method 3).
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
import {
  simulateIssueEditHandler,
  simulatePRClosedHandler,
} from "../../helpers/scenario-helpers.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupMigrationDoc(
  sim: GitHubSimulator,
  overrides: {
    status?: string;
    currentStep?: number;
    totalSteps?: number;
  } = {}
) {
  const status = overrides.status ?? "pending";
  const currentStep = overrides.currentStep ?? 1;
  const totalSteps = overrides.totalSteps ?? 2;

  sim.setFile(
    "migrations/devin-mig.md",
    `---
schema_version: 1
id: devin-mig
title: Devin Migration
agent: devin
status: ${status}
current_step: ${currentStep}
total_steps: ${totalSteps}
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Devin Migration

## Step 1: First step
## Step 2: Second step
`
  );
}

function createPendingDashboard(sim: GitHubSimulator) {
  return sim.createDashboardIssue(`## 🟡 Pending Migrations
- [x] \`devin-mig\` - Devin Migration

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
✨ *No paused migrations*

---
`);
}

function createPausedDashboard(sim: GitHubSimulator) {
  return sim.createDashboardIssue(`## 🟡 Pending Migrations
✨ *No pending migrations*

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
- [x] \`devin-mig\` - Devin Migration

---
`);
}

// ---------------------------------------------------------------------------
// Pending → Step 1 dispatch
// ---------------------------------------------------------------------------

describe("Devin scenario matrix: Pending → Step 1 dispatch", () => {
  it("clicking checkbox for pending migration dispatches step 1", async () => {
    const sim = new GitHubSimulator();
    setupMigrationDoc(sim, { status: "pending", currentStep: 1, totalSteps: 2 });

    const dashboard = createPendingDashboard(sim);

    const { dispatches } = await simulateIssueEditHandler(sim, dashboard.number);

    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]).toEqual({ migrationId: "devin-mig", stepId: 1 });
    expect(sim.workflowDispatches).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Step 1 PR lifecycle
// ---------------------------------------------------------------------------

describe("Devin scenario matrix: Step 1 PR lifecycle", () => {
  it("Devin PR for step 1 detected with active state", async () => {
    const sim = new GitHubSimulator();
    setupMigrationDoc(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    sim.createDevinPR({ migrationId: "devin-mig", step: 1, description: "First step" });

    const ctx = sim.context();
    const state = await getMigrationState(ctx, "devin-mig");
    expect(state.state).toBe("active");
    expect(state.openPRs).toHaveLength(1);
  });

  it("step 1 PR closed without merge pauses migration", async () => {
    const sim = new GitHubSimulator();
    setupMigrationDoc(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    const pr = sim.createDevinPR({ migrationId: "devin-mig", step: 1, description: "First step" });
    sim.closePR(pr.number);

    const result = await simulatePRClosedHandler(
      sim,
      pr.number,
      pr.branch,
      false,
      "devin-mig"
    );

    expect(result.nextAction).toBe("pause");

    const content = sim.getFile("migrations/devin-mig.md")!;
    expect(content).toContain("status: paused");
    expect(content).toContain("error: Migration paused");
  });

  it("checkbox for paused migration at step 1 dispatches step 1", async () => {
    const sim = new GitHubSimulator();
    setupMigrationDoc(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    // Create and close step 1 PR to get into paused state
    const pr = sim.createDevinPR({ migrationId: "devin-mig", step: 1, description: "First step" });
    sim.closePR(pr.number);
    await simulatePRClosedHandler(sim, pr.number, pr.branch, false, "devin-mig");

    // Now create dashboard with paused checkbox checked
    const dashboard = createPausedDashboard(sim);
    const { dispatches } = await simulateIssueEditHandler(sim, dashboard.number);

    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]!.stepId).toBe(1);
  });

  it("step 1 PR merged advances to step 2", async () => {
    const sim = new GitHubSimulator();
    setupMigrationDoc(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    const pr = sim.createDevinPR({ migrationId: "devin-mig", step: 1, description: "First step" });
    sim.mergePR(pr.number);

    const result = await simulatePRClosedHandler(
      sim,
      pr.number,
      pr.branch,
      true,
      "devin-mig"
    );

    expect(result.nextAction).toBe("advance");
    expect(result.nextStep).toBe(2);

    const content = sim.getFile("migrations/devin-mig.md")!;
    expect(content).toContain("current_step: 2");

    // Verify workflow dispatch for step 2
    const step2Dispatches = sim.workflowDispatches.filter(
      (d) => d.inputs.step_id === "2"
    );
    expect(step2Dispatches).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Step 2 PR lifecycle
// ---------------------------------------------------------------------------

describe("Devin scenario matrix: Step 2 PR lifecycle", () => {
  it("Devin PR for step 2 detected with active state", async () => {
    const sim = new GitHubSimulator();
    setupMigrationDoc(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    // Complete step 1
    const pr1 = sim.createDevinPR({ migrationId: "devin-mig", step: 1, description: "First step" });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "devin-mig");

    // Create step 2 PR
    sim.createDevinPR({ migrationId: "devin-mig", step: 2, description: "Second step" });

    const ctx = sim.context();
    const state = await getMigrationState(ctx, "devin-mig");
    expect(state.state).toBe("active");
    expect(state.openPRs).toHaveLength(1);
  });

  it("step 2 (final) merged triggers cleanup", async () => {
    const sim = new GitHubSimulator();
    setupMigrationDoc(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    // Complete step 1
    const pr1 = sim.createDevinPR({ migrationId: "devin-mig", step: 1, description: "First step" });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "devin-mig");

    // Complete step 2 (final)
    const pr2 = sim.createDevinPR({ migrationId: "devin-mig", step: 2, description: "Second step" });
    sim.mergePR(pr2.number);

    const result = await simulatePRClosedHandler(
      sim,
      pr2.number,
      pr2.branch,
      true,
      "devin-mig"
    );

    expect(result.nextAction).toBe("cleanup");

    const content = sim.getFile("migrations/devin-mig.md")!;
    expect(content).toContain("status: completed");
  });

  it("step 2 PR closed without merge pauses migration", async () => {
    const sim = new GitHubSimulator();
    setupMigrationDoc(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    // Complete step 1
    const pr1 = sim.createDevinPR({ migrationId: "devin-mig", step: 1, description: "First step" });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "devin-mig");

    // Create and close step 2 PR without merge
    const pr2 = sim.createDevinPR({ migrationId: "devin-mig", step: 2, description: "Second step" });
    sim.closePR(pr2.number);

    const result = await simulatePRClosedHandler(
      sim,
      pr2.number,
      pr2.branch,
      false,
      "devin-mig"
    );

    expect(result.nextAction).toBe("pause");

    const content = sim.getFile("migrations/devin-mig.md")!;
    expect(content).toContain("status: paused");
  });

  it("checkbox for paused migration at step 2 dispatches step 2", async () => {
    const sim = new GitHubSimulator();
    setupMigrationDoc(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    // Complete step 1
    const pr1 = sim.createDevinPR({ migrationId: "devin-mig", step: 1, description: "First step" });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "devin-mig");

    // Create and close step 2 PR (pause)
    const pr2 = sim.createDevinPR({ migrationId: "devin-mig", step: 2, description: "Second step" });
    sim.closePR(pr2.number);
    await simulatePRClosedHandler(sim, pr2.number, pr2.branch, false, "devin-mig");

    // Resume from dashboard
    const dashboard = createPausedDashboard(sim);
    const { dispatches } = await simulateIssueEditHandler(sim, dashboard.number);

    expect(dispatches).toHaveLength(1);
    expect(dispatches[0]!.stepId).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Post-completion edge cases
// ---------------------------------------------------------------------------

describe("Devin scenario matrix: Post-completion edge cases", () => {
  it("Devin PR still detectable after all steps merged", async () => {
    const sim = new GitHubSimulator();
    setupMigrationDoc(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    // Complete steps 1 and 2
    const pr1 = sim.createDevinPR({ migrationId: "devin-mig", step: 1, description: "First step" });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "devin-mig");

    const pr2 = sim.createDevinPR({ migrationId: "devin-mig", step: 2, description: "Second step" });
    sim.mergePR(pr2.number);
    await simulatePRClosedHandler(sim, pr2.number, pr2.branch, true, "devin-mig");

    // Create an extra PR (step 3) after completion
    sim.createDevinPR({ migrationId: "devin-mig", step: 3, description: "Extra step" });

    const ctx = sim.context();
    const openPRs = await getOpenHachikoPRs(ctx, "devin-mig");
    expect(openPRs.length).toBeGreaterThanOrEqual(1);

    const state = await getMigrationState(ctx, "devin-mig");
    expect(state.openPRs.length).toBeGreaterThanOrEqual(1);
  });

  it("extra PR merged after completion still triggers cleanup", async () => {
    const sim = new GitHubSimulator();
    setupMigrationDoc(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    // Complete steps 1 and 2
    const pr1 = sim.createDevinPR({ migrationId: "devin-mig", step: 1, description: "First step" });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "devin-mig");

    const pr2 = sim.createDevinPR({ migrationId: "devin-mig", step: 2, description: "Second step" });
    sim.mergePR(pr2.number);
    await simulatePRClosedHandler(sim, pr2.number, pr2.branch, true, "devin-mig");

    // Extra PR after completion
    const pr3 = sim.createDevinPR({ migrationId: "devin-mig", step: 3, description: "Extra step" });
    sim.mergePR(pr3.number);

    const result = await simulatePRClosedHandler(
      sim,
      pr3.number,
      pr3.branch,
      true,
      "devin-mig"
    );

    expect(result.nextAction).toBe("cleanup");
  });

  it("extra PR closed without merge after completion triggers pause", async () => {
    const sim = new GitHubSimulator();
    setupMigrationDoc(sim, { status: "in_progress", currentStep: 1, totalSteps: 2 });

    // Complete steps 1 and 2
    const pr1 = sim.createDevinPR({ migrationId: "devin-mig", step: 1, description: "First step" });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "devin-mig");

    const pr2 = sim.createDevinPR({ migrationId: "devin-mig", step: 2, description: "Second step" });
    sim.mergePR(pr2.number);
    await simulatePRClosedHandler(sim, pr2.number, pr2.branch, true, "devin-mig");

    // Extra PR closed without merge
    const pr3 = sim.createDevinPR({ migrationId: "devin-mig", step: 3, description: "Extra step" });
    sim.closePR(pr3.number);

    const result = await simulatePRClosedHandler(
      sim,
      pr3.number,
      pr3.branch,
      false,
      "devin-mig"
    );

    expect(result.nextAction).toBe("pause");
  });
});

// ---------------------------------------------------------------------------
// Paused at final step → cleanup dispatch
// ---------------------------------------------------------------------------

describe("Devin scenario matrix: Paused at final step → cleanup dispatch", () => {
  it("checkbox for migration paused after all steps dispatches cleanup", async () => {
    const sim = new GitHubSimulator();

    // Set migration as paused with current_step > total_steps
    setupMigrationDoc(sim, { status: "paused", currentStep: 3, totalSteps: 2 });

    // Create merged PRs for steps 1 and 2 so state inference sees them
    const pr1 = sim.createDevinPR({ migrationId: "devin-mig", step: 1, description: "First step" });
    sim.mergePR(pr1.number);

    const pr2 = sim.createDevinPR({ migrationId: "devin-mig", step: 2, description: "Second step" });
    sim.mergePR(pr2.number);

    const ctx = sim.context();
    const stateInfo = await getMigrationState(ctx, "devin-mig");

    const result = determineMigrationAction({
      migrationId: "devin-mig",
      section: "paused",
      stateInfo,
      totalSteps: 2,
    });

    expect(result.action).toBe("cleanup");
    expect(result.stepId).toBe("cleanup");
  });
});
