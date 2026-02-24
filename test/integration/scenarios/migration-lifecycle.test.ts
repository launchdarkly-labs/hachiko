/**
 * Scenario integration tests exercising the full migration lifecycle
 * using the GitHubSimulator + extracted workflow orchestration logic.
 *
 * These tests manually drive state transitions by calling extracted functions
 * in the same order the workflow YAML would, with full control over intermediate state.
 */
import { describe, expect, it, vi } from "vitest";

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

import { GitHubSimulator } from "../../../src/testing/github-simulator.js";
import {
  parseDashboardCheckboxes,
  determineMigrationAction,
  handlePRClosure,
  applyFrontmatterUpdate,
  isMigrationRunning,
  hasOpenPRsForMigration,
} from "../../../src/services/workflow-orchestration.js";
import { getMigrationState } from "../../../src/services/state-inference.js";

// ---------------------------------------------------------------------------
// Full Lifecycle: pending → completed
// ---------------------------------------------------------------------------

describe("Scenario: Full lifecycle (pending → completed)", () => {
  it("walks a 3-step migration from pending through all steps to completed", async () => {
    const sim = new GitHubSimulator();
    sim.setFile(
      "migrations/add-jsdoc.md",
      `---
schema_version: 1
id: add-jsdoc
title: Add JSDoc Comments
agent: cursor
status: pending
current_step: 1
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Add JSDoc Comments
`
    );
    const ctx = sim.context();

    // --- Step 1: User checks pending checkbox ---
    const dashboardBody = `## 🟡 Pending Migrations
- [x] \`add-jsdoc\` - Add JSDoc Comments

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
✨ *No paused migrations*

---
`;
    const checkboxes = parseDashboardCheckboxes(dashboardBody);
    expect(checkboxes.pending).toEqual(["add-jsdoc"]);

    // Determine action
    const stateBeforeStart = await getMigrationState(ctx, "add-jsdoc");
    expect(stateBeforeStart.state).toBe("pending");

    const action = determineMigrationAction({
      migrationId: "add-jsdoc",
      section: "pending",
      stateInfo: stateBeforeStart,
      totalSteps: 3,
    });
    expect(action).toEqual({ action: "start", stepId: 1 });

    // Simulate workflow dispatch (we'd assert on workflowDispatches in a real scenario)
    await ctx.octokit.actions.createWorkflowDispatch({
      owner: "test-owner",
      repo: "test-repo",
      workflow_id: "execute-migration.yml",
      ref: "main",
      inputs: { migration_id: "add-jsdoc", step_id: "1" },
    });
    expect(sim.workflowDispatches).toHaveLength(1);

    // --- Step 1: Agent opens PR ---
    const pr1 = sim.createPR({
      branch: "hachiko/add-jsdoc-step-1",
      title: "[add-jsdoc] Step 1: Add JSDoc to utils",
      labels: ["hachiko:migration"],
    });

    // Verify state is now active
    const stateAfterPR = await getMigrationState(ctx, "add-jsdoc");
    expect(stateAfterPR.state).toBe("active");
    expect(stateAfterPR.openPRs).toHaveLength(1);

    // --- Step 1: PR merged ---
    sim.mergePR(pr1.number);
    const stateAfterMerge1 = await getMigrationState(ctx, "add-jsdoc");
    expect(stateAfterMerge1.state).toBe("active"); // Still active (merged PR = between steps)
    expect(stateAfterMerge1.currentStep).toBe(2); // Next step to execute

    const closure1 = handlePRClosure({
      migrationId: "add-jsdoc",
      wasMerged: true,
      prBranch: "hachiko/add-jsdoc-step-1",
      stateInfo: stateAfterMerge1,
      totalSteps: 3,
    });
    expect(closure1).toEqual({ nextAction: "advance", nextStep: 2 });

    // --- Step 2: Agent opens and merges PR ---
    const pr2 = sim.createPR({
      branch: "hachiko/add-jsdoc-step-2",
      title: "[add-jsdoc] Step 2: Add JSDoc to services",
      labels: ["hachiko:migration"],
    });
    sim.mergePR(pr2.number);

    const stateAfterMerge2 = await getMigrationState(ctx, "add-jsdoc");
    expect(stateAfterMerge2.currentStep).toBe(3);

    const closure2 = handlePRClosure({
      migrationId: "add-jsdoc",
      wasMerged: true,
      prBranch: "hachiko/add-jsdoc-step-2",
      stateInfo: stateAfterMerge2,
      totalSteps: 3,
    });
    expect(closure2).toEqual({ nextAction: "advance", nextStep: 3 });

    // --- Step 3: Agent opens and merges final PR ---
    const pr3 = sim.createPR({
      branch: "hachiko/add-jsdoc-step-3",
      title: "[add-jsdoc] Step 3: Add JSDoc to adapters",
      labels: ["hachiko:migration"],
    });
    sim.mergePR(pr3.number);

    const stateAfterMerge3 = await getMigrationState(ctx, "add-jsdoc");
    expect(stateAfterMerge3.currentStep).toBe(4); // 3+1 = 4, exceeds totalSteps

    const closure3 = handlePRClosure({
      migrationId: "add-jsdoc",
      wasMerged: true,
      prBranch: "hachiko/add-jsdoc-step-3",
      stateInfo: stateAfterMerge3,
      totalSteps: 3,
    });
    expect(closure3).toEqual({ nextAction: "cleanup" });
  });
});

// ---------------------------------------------------------------------------
// Pause and Resume
// ---------------------------------------------------------------------------

describe("Scenario: Pause and resume", () => {
  it("pauses on closed-without-merge, resumes from correct step", async () => {
    const sim = new GitHubSimulator();
    sim.setFile(
      "migrations/lint-warnings.md",
      `---
schema_version: 1
id: lint-warnings
title: Fix Lint Warnings
agent: cursor
status: pending
current_step: 1
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Fix Lint Warnings
`
    );
    const ctx = sim.context();

    // Agent opens PR for step 1
    const pr1 = sim.createPR({
      branch: "hachiko/lint-warnings-step-1",
      title: "[lint-warnings] Step 1",
      labels: ["hachiko:migration"],
    });

    // PR closed without merge → pause
    sim.closePR(pr1.number);
    const stateAfterClose = await getMigrationState(ctx, "lint-warnings");
    expect(stateAfterClose.state).toBe("paused");
    expect(stateAfterClose.currentStep).toBe(1); // Should retry step 1

    const closure = handlePRClosure({
      migrationId: "lint-warnings",
      wasMerged: false,
      prBranch: "hachiko/lint-warnings-step-1",
      stateInfo: stateAfterClose,
      totalSteps: 3,
    });
    expect(closure).toEqual({ nextAction: "pause" });

    // User checks resume checkbox
    const action = determineMigrationAction({
      migrationId: "lint-warnings",
      section: "paused",
      stateInfo: stateAfterClose,
      totalSteps: 3,
    });
    // Should resume at step 1 (the failed step), NOT step 2
    expect(action).toEqual({ action: "resume", stepId: 1 });
  });
});

// ---------------------------------------------------------------------------
// Step Calculation Correctness (the off-by-one bug from PR #159)
// ---------------------------------------------------------------------------

describe("Scenario: Step calculation correctness", () => {
  it("step 1 fails, step 2 succeeds → triggers step 3 not step 4", async () => {
    const sim = new GitHubSimulator();
    const ctx = sim.context();

    // Step 1 PR opened and closed without merge (failed)
    const pr1 = sim.createPR({
      branch: "hachiko/test-migration-step-1",
      title: "Step 1",
      labels: ["hachiko:migration"],
    });
    sim.closePR(pr1.number);

    // Step 2 PR opened and merged (success)
    const pr2 = sim.createPR({
      branch: "hachiko/test-migration-step-2",
      title: "Step 2",
      labels: ["hachiko:migration"],
    });
    sim.mergePR(pr2.number);

    // State inference: highest merged step = 2, so currentStep = 3
    const state = await getMigrationState(ctx, "test-migration");
    expect(state.currentStep).toBe(3);

    // Checkbox triggers step 3, not step 4
    const action = determineMigrationAction({
      migrationId: "test-migration",
      section: "in-progress",
      stateInfo: state,
      totalSteps: 5,
    });
    expect(action).toEqual({ action: "force-retry", stepId: 3 });
    // Verify it's NOT step 4 (the old off-by-one bug)
    expect(action.stepId).not.toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Cleanup / Completion Flow
// ---------------------------------------------------------------------------

describe("Scenario: Cleanup / completion flow", () => {
  it("step exceeding total_steps triggers cleanup", async () => {
    const sim = new GitHubSimulator();
    const ctx = sim.context();

    // All 3 steps merged
    for (let i = 1; i <= 3; i++) {
      const pr = sim.createPR({
        branch: `hachiko/mig-step-${i}`,
        title: `Step ${i}`,
        labels: ["hachiko:migration"],
      });
      sim.mergePR(pr.number);
    }

    const state = await getMigrationState(ctx, "mig");
    expect(state.currentStep).toBe(4); // 3+1 = 4, exceeds totalSteps=3

    const closure = handlePRClosure({
      migrationId: "mig",
      wasMerged: true,
      prBranch: "hachiko/mig-step-3",
      stateInfo: state,
      totalSteps: 3,
    });
    expect(closure).toEqual({ nextAction: "cleanup" });
  });

  it("cleanup branch name triggers cleanup even if step is within range", async () => {
    const sim = new GitHubSimulator();
    const ctx = sim.context();

    const pr = sim.createPR({
      branch: "hachiko/mig-cleanup",
      title: "Cleanup",
      labels: ["hachiko:migration"],
    });
    sim.mergePR(pr.number);

    // Even with currentStep=1 (within range), cleanup branch forces cleanup
    const state = await getMigrationState(ctx, "mig");
    const closure = handlePRClosure({
      migrationId: "mig",
      wasMerged: true,
      prBranch: "hachiko/mig-cleanup",
      stateInfo: state,
      totalSteps: 5,
    });
    expect(closure).toEqual({ nextAction: "cleanup" });
  });

  it("'final' in branch name also triggers cleanup", async () => {
    const sim = new GitHubSimulator();
    const ctx = sim.context();

    const pr = sim.createPR({
      branch: "hachiko/mig-final-v2",
      title: "Final",
      labels: ["hachiko:migration"],
    });
    sim.mergePR(pr.number);

    const state = await getMigrationState(ctx, "mig");
    const closure = handlePRClosure({
      migrationId: "mig",
      wasMerged: true,
      prBranch: "hachiko/mig-final-v2",
      stateInfo: state,
      totalSteps: 5,
    });
    expect(closure).toEqual({ nextAction: "cleanup" });
  });
});

// ---------------------------------------------------------------------------
// Dashboard Regeneration
// ---------------------------------------------------------------------------

describe("Scenario: Dashboard regeneration", () => {
  it("parses force regeneration checkbox from dashboard body", () => {
    const body = `# 📊 Hachiko Migration Dashboard

## 🟡 Pending Migrations
- [ ] \`migration-a\` - Title A

## 🔄 In-Progress Migrations
- [ ] \`migration-b\` - Title B (Step 1/2)

## ⏸️ Paused Migrations
- [ ] \`migration-c\` - Title C

---

**Debug & Manual Control:**
- [x] **Force dashboard regeneration**
`;
    const state = parseDashboardCheckboxes(body);
    expect(state.forceRegeneration).toBe(true);
    expect(state.pending).toEqual([]);
    expect(state.paused).toEqual([]);
    expect(state.inProgress).toEqual([]);
  });

  it("multiple migrations in different states are correctly categorized", () => {
    const body = `## 🟡 Pending Migrations
- [x] \`new-migration\` - New Migration
- [ ] \`another-pending\` - Another

## 🔄 In-Progress Migrations
- [ ] \`active-one\` - Active (Step 2/3)
- [x] \`force-this\` - Force This (Step 1/2)

## ⏸️ Paused Migrations
- [x] \`resume-me\` - Resume Me
- [x] \`resume-two\` - Resume Two

---
`;
    const state = parseDashboardCheckboxes(body);
    expect(state.pending).toEqual(["new-migration"]);
    expect(state.inProgress).toEqual(["force-this"]);
    expect(state.paused).toEqual(["resume-me", "resume-two"]);
  });
});

// ---------------------------------------------------------------------------
// Frontmatter mutation through the full cycle
// ---------------------------------------------------------------------------

describe("Scenario: Frontmatter mutation through lifecycle", () => {
  it("advance → pause → advance → complete", async () => {
    const sim = new GitHubSimulator();
    sim.setFile(
      "migrations/lifecycle.md",
      `---
schema_version: 1
id: lifecycle
title: Lifecycle Test
agent: cursor
status: in_progress
current_step: 1
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Lifecycle Test
`
    );
    const ctx = sim.context();

    // Advance (step 1 merged)
    await applyFrontmatterUpdate("lifecycle", "advance", ctx);
    let content = sim.getFile("migrations/lifecycle.md")!;
    expect(content).toContain("current_step: 2");
    expect(content).toContain("status: pending");

    // Simulate step 2 starting, then failing
    content = content.replace("status: pending", "status: in_progress");
    sim.setFile("migrations/lifecycle.md", content);

    await applyFrontmatterUpdate("lifecycle", "pause", ctx);
    content = sim.getFile("migrations/lifecycle.md")!;
    expect(content).toContain("status: paused");
    expect(content).toContain("error: Migration paused");

    // Resume and advance step 2
    content = content.replace("status: paused", "status: in_progress");
    sim.setFile("migrations/lifecycle.md", content);

    await applyFrontmatterUpdate("lifecycle", "advance", ctx);
    content = sim.getFile("migrations/lifecycle.md")!;
    expect(content).toContain("current_step: 3");

    // Complete
    content = content.replace("status: pending", "status: in_progress");
    sim.setFile("migrations/lifecycle.md", content);

    await applyFrontmatterUpdate("lifecycle", "complete", ctx);
    content = sim.getFile("migrations/lifecycle.md")!;
    expect(content).toContain("status: completed");
  });
});

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe("Scenario: Migration guards", () => {
  it("isMigrationRunning prevents double-dispatch", async () => {
    const sim = new GitHubSimulator();
    const ctx = sim.context();

    // No runs → not running
    expect(await isMigrationRunning(ctx)).toBe(false);

    // Add in-progress run
    sim.addWorkflowRun({
      workflow_id: "execute-migration.yml",
      name: "Execute: test step 1",
      status: "in_progress",
      conclusion: null,
      head_branch: "main",
      created_at: new Date().toISOString(),
    });
    expect(await isMigrationRunning(ctx)).toBe(true);
  });

  it("hasOpenPRsForMigration prevents duplicate PRs", async () => {
    const sim = new GitHubSimulator();
    const ctx = sim.context();

    expect(await hasOpenPRsForMigration("test", ctx)).toBe(false);

    sim.createPR({
      branch: "hachiko/test-step-2",
      title: "Step 2",
      labels: ["hachiko:migration"],
    });
    expect(await hasOpenPRsForMigration("test", ctx)).toBe(true);
  });
});
