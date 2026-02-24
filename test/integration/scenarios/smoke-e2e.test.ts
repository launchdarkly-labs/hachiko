/**
 * Smoke test: exercise the FULL orchestration chain end-to-end,
 * the way it would actually execute in a GitHub Actions workflow.
 *
 * This is NOT unit testing individual functions — it's wiring them
 * together exactly as handle-dashboard-event.ts would, and checking
 * that the simulator state transitions are correct at every step.
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
import {
  normalizePR,
} from "../../../src/services/workflow-orchestration.js";
import {
  getMigrationState,
} from "../../../src/services/state-inference.js";
import { getOpenHachikoPRs } from "../../../src/services/pr-detection.js";
import { simulateIssueEditHandler, simulatePRClosedHandler, extractTotalSteps } from "../../helpers/scenario-helpers.js";

// ============================================================================
// THE ACTUAL TESTS
// ============================================================================

describe("E2E Smoke: Full orchestration chain", () => {
  it("complete 3-step migration lifecycle driven by dashboard + PR events", async () => {
    const sim = new GitHubSimulator();

    // --- SETUP: migration file + dashboard issue ---
    sim.setFile(
      "migrations/add-types.md",
      `---
schema_version: 1
id: add-types
title: Add TypeScript Types
agent: cursor
status: pending
current_step: 1
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Add TypeScript Types

## Step 1: Core types
## Step 2: Service types
## Step 3: Adapter types
`
    );

    const dashboard = sim.createDashboardIssue(`# 📊 Hachiko Migration Dashboard

## 🟡 Pending Migrations
- [x] \`add-types\` - Add TypeScript Types

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
✨ *No paused migrations*

---
`);

    // === EVENT 1: User checks pending checkbox ===
    const editResult = await simulateIssueEditHandler(sim, dashboard.number);
    expect(editResult.dispatches).toHaveLength(1);
    expect(editResult.dispatches[0]).toEqual({ migrationId: "add-types", stepId: 1 });
    expect(sim.workflowDispatches).toHaveLength(1);
    expect(sim.workflowDispatches[0]!.inputs.migration_id).toBe("add-types");
    expect(sim.workflowDispatches[0]!.inputs.step_id).toBe("1");

    // === EVENT 2: Agent opens step-1 PR ===
    const pr1 = sim.createPR({
      branch: "hachiko/add-types-step-1",
      title: "[add-types] Step 1: Core types",
      labels: ["hachiko:migration"],
    });

    // Verify state is active
    const ctx = sim.context();
    const stateAfterPR1 = await getMigrationState(ctx, "add-types");
    expect(stateAfterPR1.state).toBe("active");
    expect(stateAfterPR1.openPRs).toHaveLength(1);

    // === EVENT 3: Step-1 PR merged ===
    sim.mergePR(pr1.number);
    const closureResult1 = await simulatePRClosedHandler(
      sim,
      pr1.number,
      "hachiko/add-types-step-1",
      true,
      "add-types"
    );
    expect(closureResult1.nextAction).toBe("advance");
    expect(closureResult1.nextStep).toBe(2);

    // Verify frontmatter was updated
    const fileAfterStep1 = sim.getFile("migrations/add-types.md")!;
    expect(fileAfterStep1).toContain("current_step: 2");
    expect(fileAfterStep1).toContain("status: pending");

    // Verify step 2 dispatch was triggered
    expect(sim.workflowDispatches).toHaveLength(2);
    expect(sim.workflowDispatches[1]!.inputs.step_id).toBe("2");

    // === EVENT 4: Agent opens step-2 PR ===
    const pr2 = sim.createPR({
      branch: "hachiko/add-types-step-2",
      title: "[add-types] Step 2: Service types",
      labels: ["hachiko:migration"],
    });

    // === EVENT 5: Step-2 PR merged ===
    sim.mergePR(pr2.number);
    const closureResult2 = await simulatePRClosedHandler(
      sim,
      pr2.number,
      "hachiko/add-types-step-2",
      true,
      "add-types"
    );
    expect(closureResult2.nextAction).toBe("advance");
    expect(closureResult2.nextStep).toBe(3);

    const fileAfterStep2 = sim.getFile("migrations/add-types.md")!;
    expect(fileAfterStep2).toContain("current_step: 3");
    expect(sim.workflowDispatches).toHaveLength(3);
    expect(sim.workflowDispatches[2]!.inputs.step_id).toBe("3");

    // === EVENT 6: Agent opens step-3 PR (final step) ===
    const pr3 = sim.createPR({
      branch: "hachiko/add-types-step-3",
      title: "[add-types] Step 3: Adapter types",
      labels: ["hachiko:migration"],
    });

    // === EVENT 7: Step-3 PR merged → should trigger cleanup ===
    sim.mergePR(pr3.number);
    const closureResult3 = await simulatePRClosedHandler(
      sim,
      pr3.number,
      "hachiko/add-types-step-3",
      true,
      "add-types"
    );
    expect(closureResult3.nextAction).toBe("cleanup");

    // Verify migration is marked completed
    const fileAfterComplete = sim.getFile("migrations/add-types.md")!;
    expect(fileAfterComplete).toContain("status: completed");

    // No additional dispatch for cleanup (handled differently)
    expect(sim.workflowDispatches).toHaveLength(3);
  });

  it("pause on failed PR, then resume from dashboard", async () => {
    const sim = new GitHubSimulator();

    sim.setFile(
      "migrations/fix-warnings.md",
      `---
schema_version: 1
id: fix-warnings
title: Fix Warnings
agent: cursor
status: in_progress
current_step: 2
total_steps: 4
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Fix Warnings
`
    );

    // Step-1 was already merged
    const pr1 = sim.createPR({
      branch: "hachiko/fix-warnings-step-1",
      title: "Step 1",
      labels: ["hachiko:migration"],
    });
    sim.mergePR(pr1.number);

    // Agent opens step-2 PR
    const pr2 = sim.createPR({
      branch: "hachiko/fix-warnings-step-2",
      title: "Step 2",
      labels: ["hachiko:migration"],
    });

    // === Step-2 PR closed WITHOUT merge (agent failed) ===
    sim.closePR(pr2.number);
    const closureResult = await simulatePRClosedHandler(
      sim,
      pr2.number,
      "hachiko/fix-warnings-step-2",
      false,
      "fix-warnings"
    );
    expect(closureResult.nextAction).toBe("pause");

    // Verify frontmatter shows paused
    const fileAfterPause = sim.getFile("migrations/fix-warnings.md")!;
    expect(fileAfterPause).toContain("status: paused");
    expect(fileAfterPause).toContain("error: Migration paused");

    // === User checks resume checkbox in dashboard ===
    const dashboard = sim.createDashboardIssue(`## 🟡 Pending Migrations
✨ *No pending migrations*

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
- [x] \`fix-warnings\` - Fix Warnings

---
`);

    const editResult = await simulateIssueEditHandler(sim, dashboard.number);
    expect(editResult.dispatches).toHaveLength(1);

    // KEY ASSERTION: resume should dispatch step 2 (the step that needs to run),
    // NOT step 1 (already done) and NOT step 3 (premature advancement)
    expect(editResult.dispatches[0]!.stepId).toBe(2);
  });

  it("cloud agent PR detection + normalization + full cycle", async () => {
    const sim = new GitHubSimulator();

    sim.setFile(
      "migrations/api-refactor.md",
      `---
schema_version: 1
id: api-refactor
title: API Refactor
agent: devin
status: in_progress
current_step: 1
total_steps: 2
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# API Refactor
`
    );
    const ctx = sim.context();

    // Devin creates a PR on its own branch (not hachiko/*)
    const agentPR = sim.createPR({
      branch: "devin/api-refactor-abc123",
      title: "Refactor API endpoints",
      body: "Refactoring the API layer for better maintainability.",
      labels: ["hachiko:migration"],
      commits: [
        { sha: "aaa", message: "hachiko-track:api-refactor:1 refactor endpoints" },
        { sha: "bbb", message: "add error handling" },
      ],
    });

    // Detection: can we find this PR via getOpenHachikoPRs?
    const detectedPRs = await getOpenHachikoPRs(ctx, "api-refactor");
    expect(detectedPRs).toHaveLength(1);
    expect(detectedPRs[0]!.branch).toBe("devin/api-refactor-abc123");
    expect(detectedPRs[0]!.migrationId).toBe("api-refactor");

    // Normalization: add label + tracking comment
    const normResult = await normalizePR({
      prNumber: agentPR.number,
      migrationId: "api-refactor",
      existingLabels: agentPR.labels,
      existingComments: [],
      context: ctx,
    });
    expect(normResult.commentAdded).toBe(true);

    // Merge the agent PR
    sim.mergePR(agentPR.number);

    // Handle closure through the real chain
    const closureResult = await simulatePRClosedHandler(
      sim,
      agentPR.number,
      "devin/api-refactor-abc123",
      true,
      "api-refactor"
    );

    // It won't detect cleanup from branch name (no "cleanup"/"final"),
    // and currentStep after merge should be 2
    expect(closureResult.nextAction).toBe("advance");
    expect(closureResult.nextStep).toBe(2);
  });

  it("step calculation: step 1 fails, step 2 merges, dashboard triggers step 3", async () => {
    const sim = new GitHubSimulator();

    sim.setFile(
      "migrations/test-calc.md",
      `---
schema_version: 1
id: test-calc
title: Test Step Calc
agent: cursor
status: in_progress
current_step: 1
total_steps: 5
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Test Step Calc
`
    );

    // Step 1 PR: opened and closed without merge (failed)
    const pr1 = sim.createPR({
      branch: "hachiko/test-calc-step-1",
      title: "Step 1",
      labels: ["hachiko:migration"],
    });
    sim.closePR(pr1.number);

    // Step 2 PR: opened and merged (success)
    const pr2 = sim.createPR({
      branch: "hachiko/test-calc-step-2",
      title: "Step 2",
      labels: ["hachiko:migration"],
    });
    sim.mergePR(pr2.number);

    // User clicks "force retry" in the in-progress section
    const dashboard = sim.createDashboardIssue(`## 🟡 Pending Migrations
✨ *No pending migrations*

## 🔄 In-Progress Migrations
- [x] \`test-calc\` - Test Step Calc

## ⏸️ Paused Migrations
✨ *No paused migrations*

---
`);

    const editResult = await simulateIssueEditHandler(sim, dashboard.number);
    expect(editResult.dispatches).toHaveLength(1);

    // THE BIG ASSERTION: should be step 3 (highest merged=2, so next=3)
    // NOT step 4 (the old off-by-one bug where we did currentStep+1)
    expect(editResult.dispatches[0]!.stepId).toBe(3);
  });

  it("restart request: nested checkbox triggers specific step", async () => {
    const sim = new GitHubSimulator();

    sim.setFile(
      "migrations/restart-test.md",
      `---
schema_version: 1
id: restart-test
title: Restart Test
agent: cursor
status: in_progress
current_step: 3
total_steps: 5
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Restart Test
`
    );

    // Steps 1 and 2 merged
    for (let i = 1; i <= 2; i++) {
      const pr = sim.createPR({
        branch: `hachiko/restart-test-step-${i}`,
        title: `Step ${i}`,
        labels: ["hachiko:migration"],
      });
      sim.mergePR(pr.number);
    }

    const dashboard = sim.createDashboardIssue(`## 🟡 Pending Migrations
✨ *No pending migrations*

## 🔄 In-Progress Migrations
- [ ] \`restart-test\` - Restart Test (Step 3/5)
    - [x] Start step 2

## ⏸️ Paused Migrations
✨ *No paused migrations*

---
`);

    const editResult = await simulateIssueEditHandler(sim, dashboard.number);

    // Should dispatch step 2 (the explicit restart), not step 3
    expect(editResult.dispatches).toHaveLength(1);
    expect(editResult.dispatches[0]!.migrationId).toBe("restart-test");
    expect(editResult.dispatches[0]!.stepId).toBe(2);
  });

  it("isMigrationRunning guard prevents double-dispatch", async () => {
    const sim = new GitHubSimulator();

    sim.setFile(
      "migrations/guarded.md",
      `---
schema_version: 1
id: guarded
title: Guarded Migration
agent: cursor
status: pending
current_step: 1
total_steps: 2
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Guarded
`
    );

    // Simulate a workflow already running
    sim.addWorkflowRun({
      workflow_id: "execute-migration.yml",
      name: "Execute: guarded step 1",
      status: "in_progress",
      conclusion: null,
      head_branch: "main",
      created_at: new Date().toISOString(),
    });

    const dashboard = sim.createDashboardIssue(`## 🟡 Pending Migrations
- [x] \`guarded\` - Guarded Migration

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
✨ *No paused migrations*

---
`);

    const editResult = await simulateIssueEditHandler(sim, dashboard.number);

    // Should NOT dispatch because a migration is already running
    expect(editResult.dispatches).toHaveLength(0);
    expect(sim.workflowDispatches).toHaveLength(0);
  });
});
