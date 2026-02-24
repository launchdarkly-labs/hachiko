/**
 * Tests for:
 * - Bug #3: detectMigrationFromClosedPR handles cloud agent branches
 * - Bug #4: getTotalSteps reads from frontmatter (cleanup detection works)
 * - Edge: concurrent open PRs (step N+1 open when step N merges)
 * - Edge: extractStepNumberFromPR cases
 * - Edge: Cursor full lifecycle with tight step assertions
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
  detectMigrationFromClosedPR,
  getTotalSteps,
  handlePRClosure,
  hasOpenPRsForMigration,
} from "../../../src/services/workflow-orchestration.js";
import { getMigrationState } from "../../../src/services/state-inference.js";
import { detectHachikoPR, type PullRequest } from "../../../src/services/pr-detection.js";

// ---------------------------------------------------------------------------
// Bug #3: detectMigrationFromClosedPR handles all agent types
// ---------------------------------------------------------------------------

describe("Bug #3: detectMigrationFromClosedPR", () => {
  it("detects hachiko-native PR from branch name", async () => {
    const sim = new GitHubSimulator();
    const pr = sim.createHachikoPR({ migrationId: "add-types", step: 2 });
    sim.mergePR(pr.number);

    const ctx = sim.context();
    const result = await detectMigrationFromClosedPR(pr.number, pr.branch, ctx);
    expect(result).not.toBeNull();
    expect(result!.migrationId).toBe("add-types");
    expect(result!.stepNumber).toBe(2);
  });

  it("detects Cursor PR from body tracking token", async () => {
    const sim = new GitHubSimulator();
    const pr = sim.createCursorPR({ migrationId: "refactor-api", step: 3 });
    sim.mergePR(pr.number);

    const ctx = sim.context();
    const result = await detectMigrationFromClosedPR(pr.number, pr.branch, ctx);
    expect(result).not.toBeNull();
    expect(result!.migrationId).toBe("refactor-api");
    expect(result!.stepNumber).toBe(3);
  });

  it("detects Devin PR from commit tracking token", async () => {
    const sim = new GitHubSimulator();
    const pr = sim.createDevinPR({ migrationId: "fix-types", step: 1 });
    sim.mergePR(pr.number);

    const ctx = sim.context();
    const result = await detectMigrationFromClosedPR(pr.number, pr.branch, ctx);
    expect(result).not.toBeNull();
    expect(result!.migrationId).toBe("fix-types");
    // Devin: detectHachikoPR won't find it (no body token, no hachiko/ branch),
    // but commit fallback should
    expect(result!.stepNumber).toBe(1);
  });

  it("returns null for unrelated PR", async () => {
    const sim = new GitHubSimulator();
    const pr = sim.createPR({
      branch: "feature/unrelated-work",
      title: "Some random feature",
    });

    const ctx = sim.context();
    const result = await detectMigrationFromClosedPR(pr.number, pr.branch, ctx);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Bug #4: getTotalSteps reads from frontmatter
// ---------------------------------------------------------------------------

describe("Bug #4: getTotalSteps", () => {
  it("reads total_steps from schema v1 migration document", async () => {
    const sim = new GitHubSimulator();
    sim.setFile(
      "migrations/my-migration.md",
      `---
schema_version: 1
id: my-migration
title: My Migration
agent: cursor
status: pending
current_step: 1
total_steps: 5
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# My Migration
`
    );

    const ctx = sim.context();
    const totalSteps = await getTotalSteps("my-migration", ctx);
    expect(totalSteps).toBe(5);
  });

  it("returns 0 for missing migration document", async () => {
    const sim = new GitHubSimulator();
    const ctx = sim.context();
    const totalSteps = await getTotalSteps("nonexistent", ctx);
    expect(totalSteps).toBe(0);
  });

  it("cleanup fires when currentStep > totalSteps (totalSteps read from doc)", async () => {
    const sim = new GitHubSimulator();
    sim.setFile(
      "migrations/done-migration.md",
      `---
schema_version: 1
id: done-migration
title: Done Migration
agent: cursor
status: in_progress
current_step: 3
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Done
`
    );

    // All 3 steps merged
    for (let i = 1; i <= 3; i++) {
      const pr = sim.createHachikoPR({ migrationId: "done-migration", step: i });
      sim.mergePR(pr.number);
    }

    const ctx = sim.context();
    const stateInfo = await getMigrationState(ctx, "done-migration");
    const totalSteps = await getTotalSteps("done-migration", ctx);

    // currentStep = 4 (highest merged=3, so 3+1=4), totalSteps = 3
    expect(stateInfo.currentStep).toBe(4);
    expect(totalSteps).toBe(3);

    const result = handlePRClosure({
      migrationId: "done-migration",
      wasMerged: true,
      prBranch: "hachiko/done-migration-step-3",
      stateInfo,
      totalSteps,
    });
    expect(result.nextAction).toBe("cleanup");
  });

  it("cleanup would NOT fire with totalSteps=0 (the old bug)", async () => {
    const sim = new GitHubSimulator();
    sim.setFile(
      "migrations/done-migration.md",
      `---
schema_version: 1
id: done-migration
title: Done Migration
agent: cursor
status: in_progress
current_step: 3
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Done
`
    );

    for (let i = 1; i <= 3; i++) {
      const pr = sim.createHachikoPR({ migrationId: "done-migration", step: i });
      sim.mergePR(pr.number);
    }

    const ctx = sim.context();
    const stateInfo = await getMigrationState(ctx, "done-migration");

    // This is what the old code did — totalSteps: 0
    const result = handlePRClosure({
      migrationId: "done-migration",
      wasMerged: true,
      prBranch: "hachiko/done-migration-step-3",
      stateInfo,
      totalSteps: 0, // OLD BUG: would always advance
    });
    // With totalSteps=0, cleanup condition (currentStep > totalSteps) is guarded by totalSteps > 0
    expect(result.nextAction).toBe("advance");
    expect(result.nextStep).toBe(4); // Would try to run step 4 of a 3-step migration!
  });
});

// ---------------------------------------------------------------------------
// Edge: concurrent open PRs
// ---------------------------------------------------------------------------

describe("Concurrent open PRs", () => {
  it("hasOpenPRsForMigration prevents dispatch when step N+1 is already open", async () => {
    const sim = new GitHubSimulator();
    sim.setFile(
      "migrations/concurrent.md",
      `---
schema_version: 1
id: concurrent
title: Concurrent Test
agent: cursor
status: in_progress
current_step: 1
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Concurrent
`
    );

    // Agent eagerly opens step 1 and step 2 PRs
    const pr1 = sim.createHachikoPR({ migrationId: "concurrent", step: 1 });
    sim.createHachikoPR({ migrationId: "concurrent", step: 2 });

    const ctx = sim.context();

    // Step 1 merges
    sim.mergePR(pr1.number);
    const stateInfo = await getMigrationState(ctx, "concurrent");
    const totalSteps = await getTotalSteps("concurrent", ctx);

    const closure = handlePRClosure({
      migrationId: "concurrent",
      wasMerged: true,
      prBranch: pr1.branch,
      stateInfo,
      totalSteps,
    });
    expect(closure.nextAction).toBe("advance");

    // But step 2 PR is still open — should NOT dispatch
    const hasOpen = await hasOpenPRsForMigration("concurrent", ctx);
    expect(hasOpen).toBe(true);
    // (In production, the CLI would skip the dispatch here)
  });

  it("dispatch proceeds after all open PRs are closed/merged", async () => {
    const sim = new GitHubSimulator();
    sim.setFile(
      "migrations/concurrent.md",
      `---
schema_version: 1
id: concurrent
title: Concurrent Test
agent: cursor
status: in_progress
current_step: 1
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Concurrent
`
    );

    const pr1 = sim.createHachikoPR({ migrationId: "concurrent", step: 1 });
    const pr2 = sim.createHachikoPR({ migrationId: "concurrent", step: 2 });

    const ctx = sim.context();

    // Both PRs merge
    sim.mergePR(pr1.number);
    sim.mergePR(pr2.number);

    const hasOpen = await hasOpenPRsForMigration("concurrent", ctx);
    expect(hasOpen).toBe(false);

    const stateInfo = await getMigrationState(ctx, "concurrent");
    // Highest merged = 2, so currentStep = 3
    expect(stateInfo.currentStep).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Edge: extractStepNumberFromPR
// ---------------------------------------------------------------------------

describe("extractStepNumberFromPR via detectHachikoPR", () => {
  it("extracts step from hachiko branch name", () => {
    const pr: PullRequest = {
      number: 1,
      title: "Step 2",
      body: null,
      state: "open",
      head: { ref: "hachiko/my-migration-step-2" },
      labels: [{ name: "hachiko:migration" }],
      html_url: "https://example.com/1",
      merged_at: null,
    };
    const result = detectHachikoPR(pr);
    expect(result?.stepNumber).toBe(2);
  });

  it("extracts step from body tracking token", () => {
    const pr: PullRequest = {
      number: 2,
      title: "Some changes",
      body: "<!-- hachiko-track:my-migration:4 -->\nChanges here.",
      state: "open",
      head: { ref: "cursor/some-changes-a1b2" },
      labels: [{ name: "hachiko:migration" }],
      html_url: "https://example.com/2",
      merged_at: null,
    };
    const result = detectHachikoPR(pr);
    expect(result?.migrationId).toBe("my-migration");
    expect(result?.stepNumber).toBe(4);
  });

  it("extracts step from title tracking token", () => {
    const pr: PullRequest = {
      number: 3,
      title: "hachiko-track:my-migration:7 some work",
      body: null,
      state: "open",
      head: { ref: "devin/some-work-c3d4" },
      labels: [],
      html_url: "https://example.com/3",
      merged_at: null,
    };
    const result = detectHachikoPR(pr);
    expect(result?.migrationId).toBe("my-migration");
    expect(result?.stepNumber).toBe(7);
  });

  it("returns undefined stepNumber when tracking token has no step (cleanup)", () => {
    const pr: PullRequest = {
      number: 4,
      title: "hachiko-track:my-migration:cleanup some work",
      body: null,
      state: "open",
      head: { ref: "devin/cleanup-c3d4" },
      labels: [],
      html_url: "https://example.com/4",
      merged_at: null,
    };
    const result = detectHachikoPR(pr);
    expect(result?.migrationId).toBe("my-migration");
    // "cleanup" is not a number, so extractStepNumberFromPR won't match \d+
    expect(result?.stepNumber).toBeUndefined();
  });

  it("returns undefined stepNumber for bracket-matched title with no token", () => {
    const pr: PullRequest = {
      number: 5,
      title: "[my-migration] Fix some stuff",
      body: null,
      state: "open",
      head: { ref: "feature/fix-stuff" },
      labels: [],
      html_url: "https://example.com/5",
      merged_at: null,
    };
    const result = detectHachikoPR(pr);
    expect(result?.migrationId).toBe("my-migration");
    expect(result?.stepNumber).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Edge: Cursor full lifecycle with tight step assertions
// ---------------------------------------------------------------------------

describe("Cursor full lifecycle: step advancement", () => {
  it("each merged Cursor PR advances currentStep correctly", async () => {
    const sim = new GitHubSimulator();
    sim.setFile(
      "migrations/cursor-lifecycle.md",
      `---
schema_version: 1
id: cursor-lifecycle
title: Cursor Lifecycle
agent: cursor
status: in_progress
current_step: 1
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Cursor Lifecycle
`
    );
    const ctx = sim.context();

    for (let step = 1; step <= 3; step++) {
      const pr = sim.createCursorPR({ migrationId: "cursor-lifecycle", step });
      sim.mergePR(pr.number);

      const state = await getMigrationState(ctx, "cursor-lifecycle");
      expect(state.currentStep).toBe(step + 1);

      const totalSteps = await getTotalSteps("cursor-lifecycle", ctx);
      const closure = handlePRClosure({
        migrationId: "cursor-lifecycle",
        wasMerged: true,
        prBranch: pr.branch,
        stateInfo: state,
        totalSteps,
      });

      if (step < 3) {
        expect(closure.nextAction).toBe("advance");
        expect(closure.nextStep).toBe(step + 1);
      } else {
        // step 3 merged → currentStep=4 > totalSteps=3 → cleanup
        expect(closure.nextAction).toBe("cleanup");
      }
    }
  });
});
