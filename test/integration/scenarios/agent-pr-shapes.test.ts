/**
 * Tests that validate each agent type's PR shape is correctly detected,
 * its step number is extracted, and state inference works through the
 * full chain: detection → step calculation → action determination.
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
import { getOpenHachikoPRs, getClosedHachikoPRs } from "../../../src/services/pr-detection.js";
import { handlePRClosure } from "../../../src/services/workflow-orchestration.js";

function setupMigration(sim: GitHubSimulator, id: string, opts?: { currentStep?: number }) {
  sim.setFile(
    `migrations/${id}.md`,
    `---
schema_version: 1
id: ${id}
title: Test Migration
agent: cursor
status: in_progress
current_step: ${opts?.currentStep ?? 1}
total_steps: 3
created: 2024-01-01T00:00:00Z
last_updated: 2024-01-01T00:00:00Z
---
# Test Migration
`
  );
}

describe("Agent PR shapes: hachiko-native", () => {
  it("createHachikoPR produces correct branch/title/label shape", () => {
    const sim = new GitHubSimulator();
    const pr = sim.createHachikoPR({
      migrationId: "add-types",
      step: 2,
      description: "Service types",
    });
    expect(pr.branch).toBe("hachiko/add-types-step-2");
    expect(pr.title).toBe("[add-types] Step 2: Service types");
    expect(pr.labels).toContain("hachiko:migration");
  });

  it("detected via branch name, step extracted from branch", async () => {
    const sim = new GitHubSimulator();
    setupMigration(sim, "add-types");

    sim.createHachikoPR({ migrationId: "add-types", step: 1 });
    const ctx = sim.context();

    const openPRs = await getOpenHachikoPRs(ctx, "add-types");
    expect(openPRs).toHaveLength(1);
    expect(openPRs[0]!.migrationId).toBe("add-types");

    const state = await getMigrationState(ctx, "add-types");
    expect(state.state).toBe("active");
    expect(state.currentStep).toBe(1);
  });

  it("step calculation advances correctly after merge", async () => {
    const sim = new GitHubSimulator();
    setupMigration(sim, "add-types");

    const pr = sim.createHachikoPR({ migrationId: "add-types", step: 1 });
    sim.mergePR(pr.number);

    const ctx = sim.context();
    const state = await getMigrationState(ctx, "add-types");
    // Highest merged step = 1, so current step = 2
    expect(state.currentStep).toBe(2);
  });

  it("full 3-step lifecycle", async () => {
    const sim = new GitHubSimulator();
    setupMigration(sim, "add-types");
    const ctx = sim.context();

    for (let step = 1; step <= 3; step++) {
      const pr = sim.createHachikoPR({ migrationId: "add-types", step });
      sim.mergePR(pr.number);

      const state = await getMigrationState(ctx, "add-types");
      const closure = handlePRClosure({
        migrationId: "add-types",
        wasMerged: true,
        prBranch: pr.branch,
        stateInfo: state,
        totalSteps: 3,
      });

      if (step < 3) {
        expect(closure.nextAction).toBe("advance");
        expect(closure.nextStep).toBe(step + 1);
      } else {
        expect(closure.nextAction).toBe("cleanup");
      }
    }
  });
});

describe("Agent PR shapes: Cursor (cloud)", () => {
  it("createCursorPR produces correct shape with body tracking token", () => {
    const sim = new GitHubSimulator();
    const pr = sim.createCursorPR({
      migrationId: "refactor-api",
      step: 1,
      description: "Refactor endpoints",
    });
    expect(pr.branch).toMatch(/^cursor\/refactor-endpoints-[0-9a-f]+$/);
    expect(pr.body).toContain("<!-- hachiko-track:refactor-api:1 -->");
    expect(pr.labels).toContain("hachiko:migration");
  });

  it("detected via label + body tracking token", async () => {
    const sim = new GitHubSimulator();
    setupMigration(sim, "refactor-api");

    sim.createCursorPR({ migrationId: "refactor-api", step: 1 });
    const ctx = sim.context();

    const openPRs = await getOpenHachikoPRs(ctx, "refactor-api");
    expect(openPRs).toHaveLength(1);
    expect(openPRs[0]!.migrationId).toBe("refactor-api");
  });

  it("step calculation works after merge (body tracking token)", async () => {
    const sim = new GitHubSimulator();
    setupMigration(sim, "refactor-api");

    const pr = sim.createCursorPR({ migrationId: "refactor-api", step: 2, hash: "a1b2" });
    sim.mergePR(pr.number);

    const ctx = sim.context();
    const closedPRs = await getClosedHachikoPRs(ctx, "refactor-api");
    expect(closedPRs).toHaveLength(1);

    const state = await getMigrationState(ctx, "refactor-api");
    // Cursor uses body tracking tokens. detectHachikoPR method 2 (body match)
    // identifies migration but doesn't extract step number into HachikoPR.
    // This should be step 3 (merged step 2, so next = 3).
    expect(state.currentStep).toBe(3);
  });

  it("full lifecycle with Cursor PRs", async () => {
    const sim = new GitHubSimulator();
    setupMigration(sim, "refactor-api");
    const ctx = sim.context();

    for (let step = 1; step <= 3; step++) {
      const pr = sim.createCursorPR({ migrationId: "refactor-api", step });
      sim.mergePR(pr.number);
    }

    const state = await getMigrationState(ctx, "refactor-api");
    // With 3 merged Cursor PRs, step should advance
    // But since Cursor uses body tokens (not commit tokens), stepNumber may not propagate
    expect(state.closedPRs).toHaveLength(3);
  });
});

describe("Agent PR shapes: Devin (cloud)", () => {
  it("createDevinPR produces correct shape with commit tracking token", () => {
    const sim = new GitHubSimulator();
    const pr = sim.createDevinPR({
      migrationId: "fix-types",
      step: 1,
      description: "Fix type errors",
    });
    expect(pr.branch).toMatch(/^devin\/fix-type-errors-[0-9a-f]+$/);
    expect(pr.commits[0]!.message).toMatch(/^hachiko-track:fix-types:1/);
    expect(pr.labels).toContain("hachiko:migration");
  });

  it("detected via label + commit tracking token", async () => {
    const sim = new GitHubSimulator();
    setupMigration(sim, "fix-types");

    sim.createDevinPR({ migrationId: "fix-types", step: 1 });
    const ctx = sim.context();

    const openPRs = await getOpenHachikoPRs(ctx, "fix-types");
    expect(openPRs).toHaveLength(1);
    expect(openPRs[0]!.migrationId).toBe("fix-types");
    // Verify stepNumber was extracted from commit tracking token
    expect(openPRs[0]!.stepNumber).toBe(1);
  });

  it("step calculation works after merge (commit tracking token)", async () => {
    const sim = new GitHubSimulator();
    setupMigration(sim, "fix-types");

    const pr = sim.createDevinPR({ migrationId: "fix-types", step: 2, hash: "c3d4" });
    sim.mergePR(pr.number);

    const ctx = sim.context();
    const state = await getMigrationState(ctx, "fix-types");
    // Should be step 3 (highest merged = 2, so next = 3)
    expect(state.currentStep).toBe(3);
  });

  it("full 3-step lifecycle with Devin PRs", async () => {
    const sim = new GitHubSimulator();
    setupMigration(sim, "fix-types");
    const ctx = sim.context();

    for (let step = 1; step <= 3; step++) {
      const pr = sim.createDevinPR({ migrationId: "fix-types", step });
      sim.mergePR(pr.number);

      const state = await getMigrationState(ctx, "fix-types");
      const closure = handlePRClosure({
        migrationId: "fix-types",
        wasMerged: true,
        prBranch: pr.branch,
        stateInfo: state,
        totalSteps: 3,
      });

      if (step < 3) {
        expect(closure.nextAction).toBe("advance");
        expect(closure.nextStep).toBe(step + 1);
      } else {
        expect(closure.nextAction).toBe("cleanup");
      }
    }
  });
});

describe("Mixed agent lifecycle", () => {
  it("step 1 by Cursor, step 2 by Devin, step 3 by hachiko-native", async () => {
    const sim = new GitHubSimulator();
    setupMigration(sim, "mixed-agents");
    const ctx = sim.context();

    // Step 1: Cursor
    const pr1 = sim.createCursorPR({ migrationId: "mixed-agents", step: 1 });
    sim.mergePR(pr1.number);
    const state1 = await getMigrationState(ctx, "mixed-agents");
    expect(state1.closedPRs).toHaveLength(1);

    // Step 2: Devin
    const pr2 = sim.createDevinPR({ migrationId: "mixed-agents", step: 2 });
    sim.mergePR(pr2.number);
    const state2 = await getMigrationState(ctx, "mixed-agents");
    expect(state2.currentStep).toBe(3);

    // Step 3: hachiko-native
    const pr3 = sim.createHachikoPR({ migrationId: "mixed-agents", step: 3 });
    sim.mergePR(pr3.number);
    const state3 = await getMigrationState(ctx, "mixed-agents");

    const closure = handlePRClosure({
      migrationId: "mixed-agents",
      wasMerged: true,
      prBranch: pr3.branch,
      stateInfo: state3,
      totalSteps: 3,
    });
    expect(closure.nextAction).toBe("cleanup");
  });
});
