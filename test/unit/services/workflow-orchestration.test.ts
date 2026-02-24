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

import {
  parseDashboardCheckboxes,
  determineMigrationAction,
  handlePRClosure,
  normalizePR,
  updateMigrationFrontmatter,
  applyFrontmatterUpdate,
  isMigrationRunning,
  hasOpenPRsForMigration,
} from "../../../src/services/workflow-orchestration.js";
import { GitHubSimulator } from "../../../src/testing/github-simulator.js";
import type { MigrationStateInfo } from "../../../src/services/state-inference.js";

// ---------------------------------------------------------------------------
// parseDashboardCheckboxes
// ---------------------------------------------------------------------------

describe("parseDashboardCheckboxes", () => {
  const baseDashboard = `# 📊 Hachiko Migration Dashboard

## 🟡 Pending Migrations
- [x] \`add-jsdoc\` - Add JSDoc Comments
- [ ] \`react-v16-to-v18\` - React Migration

## 🔄 In-Progress Migrations
- [ ] \`improve-tests\` - Improve Test Coverage (Step 2/3)
    - [x] Start step 2
- [x] \`refactor-api\` - Refactor API Layer (Step 1/2)

## ⏸️ Paused Migrations
- [x] \`fix-lint-errors\` - Fix Lint Errors
- [ ] \`upgrade-deps\` - Upgrade Dependencies

---

**Debug & Manual Control:**
- [x] **Force dashboard regeneration**
`;

  it("extracts checked pending migrations", () => {
    const state = parseDashboardCheckboxes(baseDashboard);
    expect(state.pending).toEqual(["add-jsdoc"]);
  });

  it("extracts checked paused migrations", () => {
    const state = parseDashboardCheckboxes(baseDashboard);
    expect(state.paused).toEqual(["fix-lint-errors"]);
  });

  it("extracts checked in-progress migrations", () => {
    const state = parseDashboardCheckboxes(baseDashboard);
    expect(state.inProgress).toEqual(["refactor-api"]);
  });

  it("extracts nested restart requests", () => {
    const state = parseDashboardCheckboxes(baseDashboard);
    expect(state.restartRequests).toEqual([{ migrationId: "improve-tests", step: 2 }]);
  });

  it("detects force regeneration checkbox", () => {
    const state = parseDashboardCheckboxes(baseDashboard);
    expect(state.forceRegeneration).toBe(true);
  });

  it("returns empty results for no checked boxes", () => {
    const body = `## 🟡 Pending Migrations
- [ ] \`migration-a\` - Title A

## 🔄 In-Progress Migrations
- [ ] \`migration-b\` - Title B

## ⏸️ Paused Migrations
- [ ] \`migration-c\` - Title C

---
- [ ] **Force dashboard regeneration**
`;
    const state = parseDashboardCheckboxes(body);
    expect(state.pending).toEqual([]);
    expect(state.paused).toEqual([]);
    expect(state.inProgress).toEqual([]);
    expect(state.restartRequests).toEqual([]);
    expect(state.forceRegeneration).toBe(false);
  });

  it("handles empty placeholder text without crashing", () => {
    const body = `## 🟡 Pending Migrations
✨ *No pending migrations*

## 🔄 In-Progress Migrations
✨ *No active migrations*

## ⏸️ Paused Migrations
✨ *No paused migrations*

---
`;
    const state = parseDashboardCheckboxes(body);
    expect(state.pending).toEqual([]);
  });

  it("handles multiple restart requests in different migrations", () => {
    const body = `## 🔄 In-Progress Migrations
- [ ] \`migration-a\` - Title A (Step 3/5)
    - [x] Start step 3
- [ ] \`migration-b\` - Title B (Step 1/2)
    - [x] Start step 1

## ⏸️ Paused Migrations
`;
    const state = parseDashboardCheckboxes(body);
    expect(state.restartRequests).toEqual([
      { migrationId: "migration-a", step: 3 },
      { migrationId: "migration-b", step: 1 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// determineMigrationAction
// ---------------------------------------------------------------------------

describe("determineMigrationAction", () => {
  const makeStateInfo = (overrides: Partial<MigrationStateInfo> = {}): MigrationStateInfo => ({
    state: "active",
    openPRs: [],
    closedPRs: [],
    allTasksComplete: false,
    totalTasks: 0,
    completedTasks: 0,
    currentStep: 1,
    lastUpdated: new Date().toISOString(),
    ...overrides,
  });

  it("pending → start from step 1", () => {
    const result = determineMigrationAction({
      migrationId: "test",
      section: "pending",
      stateInfo: makeStateInfo(),
      totalSteps: 3,
    });
    expect(result).toEqual({ action: "start", stepId: 1 });
  });

  it("paused → resume from currentStep", () => {
    const result = determineMigrationAction({
      migrationId: "test",
      section: "paused",
      stateInfo: makeStateInfo({ currentStep: 2 }),
      totalSteps: 3,
    });
    expect(result).toEqual({ action: "resume", stepId: 2 });
  });

  it("in-progress → force-retry currentStep (NOT +1)", () => {
    const result = determineMigrationAction({
      migrationId: "test",
      section: "in-progress",
      stateInfo: makeStateInfo({ currentStep: 3 }),
      totalSteps: 3,
    });
    expect(result).toEqual({ action: "force-retry", stepId: 3 });
  });

  it("detects cleanup when currentStep > totalSteps", () => {
    const result = determineMigrationAction({
      migrationId: "test",
      section: "paused",
      stateInfo: makeStateInfo({ currentStep: 4 }),
      totalSteps: 3,
    });
    expect(result).toEqual({ action: "cleanup", stepId: "cleanup" });
  });

  it("detects cleanup from branch name", () => {
    const result = determineMigrationAction({
      migrationId: "test",
      section: "paused",
      stateInfo: makeStateInfo({ currentStep: 3 }),
      totalSteps: 3,
      prBranch: "hachiko/test-cleanup",
    });
    expect(result).toEqual({ action: "cleanup", stepId: "cleanup" });
  });

  it("detects cleanup from 'final' in branch name", () => {
    const result = determineMigrationAction({
      migrationId: "test",
      section: "paused",
      stateInfo: makeStateInfo({ currentStep: 3 }),
      totalSteps: 3,
      prBranch: "hachiko/test-final",
    });
    expect(result).toEqual({ action: "cleanup", stepId: "cleanup" });
  });
});

// ---------------------------------------------------------------------------
// handlePRClosure
// ---------------------------------------------------------------------------

describe("handlePRClosure", () => {
  const makeStateInfo = (overrides: Partial<MigrationStateInfo> = {}): MigrationStateInfo => ({
    state: "active",
    openPRs: [],
    closedPRs: [],
    allTasksComplete: false,
    totalTasks: 0,
    completedTasks: 0,
    currentStep: 2,
    lastUpdated: new Date().toISOString(),
    ...overrides,
  });

  it("not merged → pause", () => {
    const result = handlePRClosure({
      migrationId: "test",
      wasMerged: false,
      prBranch: "hachiko/test-step-1",
      stateInfo: makeStateInfo(),
      totalSteps: 3,
    });
    expect(result).toEqual({ nextAction: "pause" });
  });

  it("merged → advance with nextStep from stateInfo", () => {
    const result = handlePRClosure({
      migrationId: "test",
      wasMerged: true,
      prBranch: "hachiko/test-step-1",
      stateInfo: makeStateInfo({ currentStep: 2 }),
      totalSteps: 3,
    });
    expect(result).toEqual({ nextAction: "advance", nextStep: 2 });
  });

  it("merged + step > totalSteps → cleanup", () => {
    const result = handlePRClosure({
      migrationId: "test",
      wasMerged: true,
      prBranch: "hachiko/test-step-4",
      stateInfo: makeStateInfo({ currentStep: 4 }),
      totalSteps: 3,
    });
    expect(result).toEqual({ nextAction: "cleanup" });
  });

  it("merged + cleanup branch → cleanup", () => {
    const result = handlePRClosure({
      migrationId: "test",
      wasMerged: true,
      prBranch: "hachiko/test-cleanup",
      stateInfo: makeStateInfo({ currentStep: 3 }),
      totalSteps: 3,
    });
    expect(result).toEqual({ nextAction: "cleanup" });
  });

  it("merged + final branch → cleanup", () => {
    const result = handlePRClosure({
      migrationId: "test",
      wasMerged: true,
      prBranch: "hachiko/test-final-v2",
      stateInfo: makeStateInfo({ currentStep: 3 }),
      totalSteps: 3,
    });
    expect(result).toEqual({ nextAction: "cleanup" });
  });
});

// ---------------------------------------------------------------------------
// updateMigrationFrontmatter (pure)
// ---------------------------------------------------------------------------

describe("updateMigrationFrontmatter", () => {
  const sampleFrontmatter = `---
schema_version: 1
id: test-migration
title: Test Migration
agent: cursor
status: in_progress
current_step: 2
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
pr_number: 123
branch: hachiko/test-step-2
---

# Test Migration
`;

  it("advance: increments step, sets status to pending, removes pr_number/branch", () => {
    const result = updateMigrationFrontmatter(sampleFrontmatter, "advance");
    expect(result).toContain("current_step: 3");
    expect(result).toContain("status: pending");
    expect(result).not.toContain("pr_number:");
    expect(result).not.toContain("branch: hachiko");
    // last_updated should be updated (not the original date)
    expect(result).not.toMatch(/last_updated:\s*2024-01-01/);
  });

  it("pause: sets status to paused, adds error message", () => {
    const result = updateMigrationFrontmatter(sampleFrontmatter, "pause");
    expect(result).toContain("status: paused");
    expect(result).toContain("error: Migration paused - PR closed without merging");
    expect(result).not.toContain("pr_number:");
  });

  it("complete: sets status to completed", () => {
    const result = updateMigrationFrontmatter(sampleFrontmatter, "complete");
    expect(result).toContain("status: completed");
    expect(result).not.toContain("pr_number:");
    expect(result).not.toContain("branch: hachiko");
  });

  it("pause: updates existing error message", () => {
    const withError = sampleFrontmatter.replace(
      "branch: hachiko/test-step-2",
      "branch: hachiko/test-step-2\nerror: Previous error"
    );
    const result = updateMigrationFrontmatter(withError, "pause");
    expect(result).toContain("error: Migration paused - PR closed without merging");
    expect(result).not.toContain("Previous error");
  });
});

// ---------------------------------------------------------------------------
// normalizePR (with simulator)
// ---------------------------------------------------------------------------

describe("normalizePR", () => {
  it("adds label and tracking comment to agent PR", async () => {
    const sim = new GitHubSimulator();
    sim.createDashboardIssue("body"); // just so issue exists
    const pr = sim.createPR({ branch: "cursor/abc", title: "Agent PR" });
    // normalizePR uses issues API, so we need the PR number to also be an issue
    // In the simulator, addLabels checks both issues and PRs maps
    const ctx = sim.context();

    const result = await normalizePR({
      prNumber: pr.number,
      migrationId: "my-migration",
      existingLabels: [],
      existingComments: [],
      context: ctx,
    });

    expect(result.labelAdded).toBe(true);
    expect(result.commentAdded).toBe(true);
    expect(sim.pullRequests.get(pr.number)!.labels).toContain("hachiko:migration");
  });

  it("skips if already normalized (tracking comment exists)", async () => {
    const sim = new GitHubSimulator();
    const pr = sim.createPR({ branch: "cursor/abc", title: "Agent PR" });
    const ctx = sim.context();

    const result = await normalizePR({
      prNumber: pr.number,
      migrationId: "my-migration",
      existingLabels: ["hachiko:migration"],
      existingComments: ["<!-- hachiko-track:my-migration --> tracking comment"],
      context: ctx,
    });

    expect(result.labelAdded).toBe(false);
    expect(result.commentAdded).toBe(false);
  });

  it("skips label add if already present but still adds comment", async () => {
    const sim = new GitHubSimulator();
    const pr = sim.createPR({ branch: "cursor/abc", title: "PR", labels: ["hachiko:migration"] });
    const ctx = sim.context();

    const result = await normalizePR({
      prNumber: pr.number,
      migrationId: "my-migration",
      existingLabels: ["hachiko:migration"],
      existingComments: [],
      context: ctx,
    });

    expect(result.labelAdded).toBe(false);
    expect(result.commentAdded).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyFrontmatterUpdate (with simulator)
// ---------------------------------------------------------------------------

describe("applyFrontmatterUpdate", () => {
  it("reads, transforms, and writes the migration file", async () => {
    const sim = new GitHubSimulator();
    // applyFrontmatterUpdate reads from migrations/{id}.md
    sim.setFile(
      "migrations/test-migration.md",
      `---
schema_version: 1
id: test-migration
title: Test
agent: cursor
status: in_progress
current_step: 2
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Test
`
    );
    const ctx = sim.context();

    await applyFrontmatterUpdate("test-migration", "advance", ctx);

    const updated = sim.getFile("migrations/test-migration.md");
    expect(updated).toContain("current_step: 3");
    expect(updated).toContain("status: pending");
  });

  it("pause writes error message to file", async () => {
    const sim = new GitHubSimulator();
    // Use the migrations/ path since applyFrontmatterUpdate reads from migrations/
    sim.setFile(
      "migrations/my-mig.md",
      `---
schema_version: 1
id: my-mig
title: My Mig
agent: cursor
status: in_progress
current_step: 1
total_steps: 2
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# My Mig
`
    );
    const ctx = sim.context();

    await applyFrontmatterUpdate("my-mig", "pause", ctx);

    const updated = sim.getFile("migrations/my-mig.md");
    expect(updated).toContain("status: paused");
    expect(updated).toContain("error: Migration paused");
  });
});

// ---------------------------------------------------------------------------
// isMigrationRunning + hasOpenPRsForMigration (with simulator)
// ---------------------------------------------------------------------------

describe("isMigrationRunning", () => {
  it("returns false when no in-progress runs", async () => {
    const sim = new GitHubSimulator();
    const ctx = sim.context();
    const running = await isMigrationRunning(ctx);
    expect(running).toBe(false);
  });

  it("returns true when there are in-progress runs", async () => {
    const sim = new GitHubSimulator();
    sim.addWorkflowRun({
      workflow_id: "execute-migration.yml",
      name: "Execute Migration",
      status: "in_progress",
      conclusion: null,
      head_branch: "main",
      created_at: new Date().toISOString(),
    });
    const ctx = sim.context();
    const running = await isMigrationRunning(ctx);
    expect(running).toBe(true);
  });
});

describe("hasOpenPRsForMigration", () => {
  it("returns false when no open PRs", async () => {
    const sim = new GitHubSimulator();
    const ctx = sim.context();
    const hasPRs = await hasOpenPRsForMigration("nonexistent", ctx);
    expect(hasPRs).toBe(false);
  });

  it("returns true when there are open hachiko PRs", async () => {
    const sim = new GitHubSimulator();
    sim.createPR({ branch: "hachiko/my-migration-step-1", title: "Step 1" });
    const ctx = sim.context();
    const hasPRs = await hasOpenPRsForMigration("my-migration", ctx);
    expect(hasPRs).toBe(true);
  });
});
