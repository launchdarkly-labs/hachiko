/**
 * Cursor agent scenario test matrix — 13 scenarios across 5 describe blocks.
 *
 * All tests use sim.createCursorPR() and a 2-step migration (total_steps: 2)
 * with agent: cursor. Cursor PRs are detected via body tracking tokens:
 *   <!-- hachiko-track:{id}:{step} -->
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
  determineMigrationAction,
  applyFrontmatterUpdate,
} from "../../../src/services/workflow-orchestration.js";
import {
  getMigrationState,
} from "../../../src/services/state-inference.js";
import { getOpenHachikoPRs } from "../../../src/services/pr-detection.js";
import {
  simulateIssueEditHandler,
  simulatePRClosedHandler,
  extractTotalSteps,
} from "../../helpers/scenario-helpers.js";

// ---------------------------------------------------------------------------
// Helper: migration doc template (2-step Cursor migration)
// ---------------------------------------------------------------------------

function migrationDoc(opts: { status?: string; currentStep?: number } = {}): string {
  return `---
schema_version: 1
id: cursor-test
title: Cursor Test Migration
agent: cursor
status: ${opts.status ?? "pending"}
current_step: ${opts.currentStep ?? 1}
total_steps: 2
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Cursor Test Migration
`;
}

// ============================================================================
// 1. Pending → Step 1 dispatch
// ============================================================================

describe("Cursor: Pending → Step 1 dispatch", () => {
  it("clicking checkbox for pending migration dispatches step 1", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/cursor-test.md", migrationDoc());

    const dashboard = sim.createDashboardIssue(`# 📊 Hachiko Migration Dashboard

## 🟡 Pending Migrations
- [x] \`cursor-test\` - Cursor Test Migration

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
✨ *No paused migrations*

---
`);

    const result = await simulateIssueEditHandler(sim, dashboard.number);

    expect(result.dispatches).toHaveLength(1);
    expect(result.dispatches[0]).toEqual({ migrationId: "cursor-test", stepId: 1 });
  });
});

// ============================================================================
// 2–5. Step 1 PR lifecycle
// ============================================================================

describe("Cursor: Step 1 PR lifecycle", () => {
  it("Cursor PR for step 1 detected → state is active", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/cursor-test.md", migrationDoc());

    sim.createCursorPR({ migrationId: "cursor-test", step: 1 });

    const ctx = sim.context();
    const docContent = sim.getFile("migrations/cursor-test.md")!;
    const state = await getMigrationState(ctx, "cursor-test", docContent);

    expect(state.state).toBe("active");
    expect(state.openPRs).toHaveLength(1);
  });

  it("step 1 PR closed without merge → state paused", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/cursor-test.md", migrationDoc());

    const pr = sim.createCursorPR({ migrationId: "cursor-test", step: 1 });
    sim.closePR(pr.number);

    const result = await simulatePRClosedHandler(
      sim,
      pr.number,
      pr.branch,
      false,
      "cursor-test",
    );

    expect(result.nextAction).toBe("pause");
    const file = sim.getFile("migrations/cursor-test.md")!;
    expect(file).toContain("status: paused");
  });

  it("checkbox for migration paused at step 1 → dispatches step 1", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/cursor-test.md", migrationDoc());

    // Step 1 PR closed without merge
    const pr = sim.createCursorPR({ migrationId: "cursor-test", step: 1 });
    sim.closePR(pr.number);

    // Apply pause via applyFrontmatterUpdate
    const ctx = sim.context();
    await applyFrontmatterUpdate("cursor-test", "pause", ctx);

    const dashboard = sim.createDashboardIssue(`## 🟡 Pending Migrations
✨ *No pending migrations*

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
- [x] \`cursor-test\` - Cursor Test Migration

---
`);

    const result = await simulateIssueEditHandler(sim, dashboard.number);

    expect(result.dispatches).toHaveLength(1);
    expect(result.dispatches[0]!.stepId).toBe(1);
  });

  it("step 1 PR merged → dashboard updated, step 2 dispatched", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/cursor-test.md", migrationDoc());

    const pr = sim.createCursorPR({ migrationId: "cursor-test", step: 1 });
    sim.mergePR(pr.number);

    const result = await simulatePRClosedHandler(
      sim,
      pr.number,
      pr.branch,
      true,
      "cursor-test",
    );

    expect(result.nextAction).toBe("advance");
    expect(result.nextStep).toBe(2);

    const file = sim.getFile("migrations/cursor-test.md")!;
    expect(file).toContain("current_step: 2");

    // Verify step 2 dispatch was triggered
    expect(sim.workflowDispatches).toHaveLength(1);
    expect(sim.workflowDispatches[0]!.inputs.step_id).toBe("2");
  });
});

// ============================================================================
// 6–9. Step 2 PR lifecycle
// ============================================================================

describe("Cursor: Step 2 PR lifecycle", () => {
  it("Cursor PR for step 2 detected → state is active", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/cursor-test.md", migrationDoc());

    // Step 1 merged
    const pr1 = sim.createCursorPR({ migrationId: "cursor-test", step: 1 });
    sim.mergePR(pr1.number);

    // Step 2 opened
    sim.createCursorPR({ migrationId: "cursor-test", step: 2 });

    const ctx = sim.context();
    const docContent = sim.getFile("migrations/cursor-test.md")!;
    const state = await getMigrationState(ctx, "cursor-test", docContent);

    expect(state.state).toBe("active");
    expect(state.openPRs).toHaveLength(1);
  });

  it("step 2 (of 2) merged → cleanup triggered", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/cursor-test.md", migrationDoc());

    // Step 1 merged + advance (full chain)
    const pr1 = sim.createCursorPR({ migrationId: "cursor-test", step: 1 });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "cursor-test");

    // Step 2 merged
    const pr2 = sim.createCursorPR({ migrationId: "cursor-test", step: 2 });
    sim.mergePR(pr2.number);

    const result = await simulatePRClosedHandler(
      sim,
      pr2.number,
      pr2.branch,
      true,
      "cursor-test",
    );

    expect(result.nextAction).toBe("cleanup");
    const file = sim.getFile("migrations/cursor-test.md")!;
    expect(file).toContain("status: completed");
  });

  it("step 2 PR closed without merge → state paused", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/cursor-test.md", migrationDoc());

    // Step 1 merged + advance (full chain)
    const pr1 = sim.createCursorPR({ migrationId: "cursor-test", step: 1 });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "cursor-test");

    // Step 2 closed without merge
    const pr2 = sim.createCursorPR({ migrationId: "cursor-test", step: 2 });
    sim.closePR(pr2.number);

    const result = await simulatePRClosedHandler(
      sim,
      pr2.number,
      pr2.branch,
      false,
      "cursor-test",
    );

    expect(result.nextAction).toBe("pause");
    const file = sim.getFile("migrations/cursor-test.md")!;
    expect(file).toContain("status: paused");
  });

  it("checkbox for migration paused at step 2 → dispatches step 2", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/cursor-test.md", migrationDoc());

    // Step 1 merged + advance (full chain)
    const pr1 = sim.createCursorPR({ migrationId: "cursor-test", step: 1 });
    sim.mergePR(pr1.number);
    await simulatePRClosedHandler(sim, pr1.number, pr1.branch, true, "cursor-test");

    // Step 2 closed without merge
    const pr2 = sim.createCursorPR({ migrationId: "cursor-test", step: 2 });
    sim.closePR(pr2.number);

    // Apply pause
    const ctx = sim.context();
    await applyFrontmatterUpdate("cursor-test", "pause", ctx);

    const dashboard = sim.createDashboardIssue(`## 🟡 Pending Migrations
✨ *No pending migrations*

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
- [x] \`cursor-test\` - Cursor Test Migration

---
`);

    const result = await simulateIssueEditHandler(sim, dashboard.number);

    expect(result.dispatches).toHaveLength(1);
    expect(result.dispatches[0]!.stepId).toBe(2);
  });
});

// ============================================================================
// 10–12. Cleanup PR lifecycle
// ============================================================================

describe("Cursor: Cleanup PR lifecycle", () => {
  it("cleanup PR detected → state updated", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/cursor-test.md", migrationDoc());

    // Both steps merged
    const pr1 = sim.createCursorPR({ migrationId: "cursor-test", step: 1 });
    sim.mergePR(pr1.number);
    const pr2 = sim.createCursorPR({ migrationId: "cursor-test", step: 2 });
    sim.mergePR(pr2.number);

    // Create cleanup Cursor PR (step 3 > total_steps)
    sim.createCursorPR({ migrationId: "cursor-test", step: 3 });

    const ctx = sim.context();
    const openPRs = await getOpenHachikoPRs(ctx, "cursor-test");
    expect(openPRs).toHaveLength(1);

    const docContent = sim.getFile("migrations/cursor-test.md")!;
    const state = await getMigrationState(ctx, "cursor-test", docContent);
    expect(state.openPRs).toHaveLength(1);
  });

  it("cleanup PR merged → dashboard shows completed", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/cursor-test.md", migrationDoc());

    // Both steps merged
    const pr1 = sim.createCursorPR({ migrationId: "cursor-test", step: 1 });
    sim.mergePR(pr1.number);
    const pr2 = sim.createCursorPR({ migrationId: "cursor-test", step: 2 });
    sim.mergePR(pr2.number);

    // Cleanup PR created + merged
    const cleanupPR = sim.createCursorPR({ migrationId: "cursor-test", step: 3 });
    sim.mergePR(cleanupPR.number);

    const result = await simulatePRClosedHandler(
      sim,
      cleanupPR.number,
      cleanupPR.branch,
      true,
      "cursor-test",
    );

    expect(result.nextAction).toBe("cleanup");
    const file = sim.getFile("migrations/cursor-test.md")!;
    expect(file).toContain("status: completed");
  });

  it("cleanup PR closed without merge → state paused", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/cursor-test.md", migrationDoc());

    // Both steps merged
    const pr1 = sim.createCursorPR({ migrationId: "cursor-test", step: 1 });
    sim.mergePR(pr1.number);
    const pr2 = sim.createCursorPR({ migrationId: "cursor-test", step: 2 });
    sim.mergePR(pr2.number);

    // Cleanup PR created + closed without merge
    const cleanupPR = sim.createCursorPR({ migrationId: "cursor-test", step: 3 });
    sim.closePR(cleanupPR.number);

    const result = await simulatePRClosedHandler(
      sim,
      cleanupPR.number,
      cleanupPR.branch,
      false,
      "cursor-test",
    );

    expect(result.nextAction).toBe("pause");
  });
});

// ============================================================================
// 13. Paused at final step → cleanup dispatch
// ============================================================================

describe("Cursor: Paused at final step → cleanup dispatch", () => {
  it("checkbox for migration paused after all steps done → dispatches cleanup", async () => {
    const sim = new GitHubSimulator();
    sim.setFile("migrations/cursor-test.md", migrationDoc());

    // Both steps merged (currentStep will be inferred as 3 > totalSteps 2)
    const pr1 = sim.createCursorPR({ migrationId: "cursor-test", step: 1 });
    sim.mergePR(pr1.number);
    const pr2 = sim.createCursorPR({ migrationId: "cursor-test", step: 2 });
    sim.mergePR(pr2.number);

    const dashboard = sim.createDashboardIssue(`## 🟡 Pending Migrations
✨ *No pending migrations*

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
- [x] \`cursor-test\` - Cursor Test Migration

---
`);

    const editResult = await simulateIssueEditHandler(sim, dashboard.number);

    expect(editResult.dispatches).toHaveLength(1);
    expect(editResult.dispatches[0]!.stepId).toBe("cleanup");

    // Also verify determineMigrationAction directly
    const ctx = sim.context();
    const docContent = sim.getFile("migrations/cursor-test.md")!;
    const stateInfo = await getMigrationState(ctx, "cursor-test", docContent);
    const totalSteps = extractTotalSteps(docContent);

    const action = determineMigrationAction({
      migrationId: "cursor-test",
      section: "paused",
      stateInfo,
      totalSteps,
    });

    expect(action.action).toBe("cleanup");
    expect(action.stepId).toBe("cleanup");
  });
});
