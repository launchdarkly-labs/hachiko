/**
 * Workflow orchestration logic extracted from bash/YAML into testable TypeScript.
 *
 * Previously lived in:
 *   - migration-dashboard.yml (checkbox parsing, step calculation, dispatch triggering)
 *   - advance-migration.sh (frontmatter mutation, next-step triggering)
 *   - pause-migration.sh (frontmatter mutation)
 */

import type { ContextWithRepository } from "../types/context.js";
import type { MigrationStateInfo } from "./state-inference.js";
import { getMigrationDocumentContent } from "./state-inference.js";
import { getOpenHachikoPRs, detectHachikoPR } from "./pr-detection.js";
import type { PullRequest } from "./pr-detection.js";
import { parseMigrationDocumentContent } from "../utils/migration-document.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardCheckboxState {
  /** Migration IDs checked in the Pending section */
  pending: string[];
  /** Migration IDs checked in the Paused section */
  paused: string[];
  /** Migration IDs checked in the In-Progress section */
  inProgress: string[];
  /** Nested "Start step N" checkboxes in the In-Progress section */
  restartRequests: Array<{ migrationId: string; step: number }>;
  /** Whether the "Force dashboard regeneration" checkbox is checked */
  forceRegeneration: boolean;
}

export interface MigrationAction {
  action: "start" | "resume" | "force-retry" | "skip" | "cleanup";
  stepId: string | number;
}

export interface PRClosureResult {
  nextAction: "advance" | "pause" | "cleanup";
  nextStep?: number;
}

// ---------------------------------------------------------------------------
// parseDashboardCheckboxes
// ---------------------------------------------------------------------------

/**
 * Parse the migration dashboard issue body to extract checked checkboxes
 * from each section.
 *
 * Dashboard structure:
 *   ## 🟡 Pending Migrations
 *   - [x] `migration-id` - Title          ← checked = start
 *   ## 🔄 In-Progress Migrations
 *   - [ ] `migration-id` - Title (Step 2/3)
 *       - [x] Start step 2                ← nested restart request
 *   ## ⏸️ Paused Migrations
 *   - [x] `migration-id` - Title          ← checked = resume
 *   ---
 *   - [x] **Force dashboard regeneration**
 */
export function parseDashboardCheckboxes(issueBody: string): DashboardCheckboxState {
  const lines = issueBody.split("\n");

  const result: DashboardCheckboxState = {
    pending: [],
    paused: [],
    inProgress: [],
    restartRequests: [],
    forceRegeneration: false,
  };

  type Section = "pending" | "in-progress" | "paused" | "other";
  let currentSection: Section = "other";

  // Track the most recent migration ID seen in the in-progress section
  // for correlating nested restart checkboxes
  let lastInProgressMigrationId: string | null = null;

  for (const line of lines) {
    // Detect section transitions
    if (line.includes("## 🟡 Pending Migrations")) {
      currentSection = "pending";
      continue;
    }
    if (line.includes("## 🔄 In-Progress Migrations")) {
      currentSection = "in-progress";
      continue;
    }
    if (line.includes("## ⏸️ Paused Migrations")) {
      currentSection = "paused";
      continue;
    }
    if (line.startsWith("---")) {
      currentSection = "other";
      continue;
    }

    // Force regeneration checkbox (can appear anywhere after ---)
    if (line.startsWith("- [x] **Force dashboard regeneration**")) {
      result.forceRegeneration = true;
      continue;
    }

    // Extract migration ID from checked top-level checkboxes: - [x] `migration-id` - ...
    const checkedMatch = line.match(/^- \[x\] `([^`]+)`/);
    if (checkedMatch && checkedMatch[1]) {
      const migrationId = checkedMatch[1];
      switch (currentSection) {
        case "pending":
          result.pending.push(migrationId);
          break;
        case "in-progress":
          result.inProgress.push(migrationId);
          break;
        case "paused":
          result.paused.push(migrationId);
          break;
      }
      continue;
    }

    // Track unchecked migration IDs in in-progress section for restart correlation
    const uncheckedMatch = line.match(/^- \[ \] `([^`]+)`/);
    if (uncheckedMatch && uncheckedMatch[1] && currentSection === "in-progress") {
      lastInProgressMigrationId = uncheckedMatch[1];
      continue;
    }

    // Also track checked top-level items for restart correlation
    if (checkedMatch && currentSection === "in-progress") {
      lastInProgressMigrationId = checkedMatch[1] ?? null;
    }

    // Nested restart checkbox: "    - [x] Start step N"
    const restartMatch = line.match(/^\s+- \[x\] Start step (\d+)/);
    if (restartMatch && restartMatch[1] && lastInProgressMigrationId) {
      result.restartRequests.push({
        migrationId: lastInProgressMigrationId,
        step: parseInt(restartMatch[1], 10),
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// determineMigrationAction
// ---------------------------------------------------------------------------

/**
 * Given a migration ID and its context, determine what action to take.
 *
 * - pending section checkbox checked → start from step 1
 * - paused section checkbox checked → resume from currentStep (the step that needs to run)
 * - in-progress section checkbox checked → force-retry the currentStep
 * - restart request → start at the specified step
 * - cleanup detection → return cleanup action
 */
export function determineMigrationAction(params: {
  migrationId: string;
  section: "pending" | "paused" | "in-progress";
  stateInfo: MigrationStateInfo;
  totalSteps: number;
  prBranch?: string;
}): MigrationAction {
  const { section, stateInfo, totalSteps, prBranch } = params;

  // Cleanup detection: if currentStep exceeds totalSteps
  if (totalSteps > 0 && stateInfo.currentStep > totalSteps) {
    return { action: "cleanup", stepId: "cleanup" };
  }

  // Cleanup detection: branch name contains cleanup/final
  if (prBranch && /cleanup|final/i.test(prBranch)) {
    return { action: "cleanup", stepId: "cleanup" };
  }

  switch (section) {
    case "pending":
      // Pending migrations always start from step 1
      return { action: "start", stepId: 1 };

    case "paused":
      // Resume from the currentStep (which is already "the next step to execute")
      return { action: "resume", stepId: stateInfo.currentStep };

    case "in-progress":
      // Force-retry the currentStep (which is already "the next step to execute")
      // IMPORTANT: do NOT add +1 here — currentStep already means "next step to run"
      return { action: "force-retry", stepId: stateInfo.currentStep };
  }
}

// ---------------------------------------------------------------------------
// handlePRClosure
// ---------------------------------------------------------------------------

/**
 * Determine what should happen when a Hachiko PR is closed.
 *
 * - Merged + step < totalSteps → advance (next step = currentStep from state inference)
 * - Merged + step >= totalSteps → cleanup (migration complete)
 * - Merged + branch contains "cleanup"/"final" → cleanup
 * - Not merged → pause
 */
export function handlePRClosure(params: {
  migrationId: string;
  wasMerged: boolean;
  prBranch: string;
  stateInfo: MigrationStateInfo;
  totalSteps: number;
}): PRClosureResult {
  const { wasMerged, prBranch, stateInfo, totalSteps } = params;

  if (!wasMerged) {
    return { nextAction: "pause" };
  }

  // Check if this is a cleanup PR
  if (/cleanup|final/i.test(prBranch)) {
    return { nextAction: "cleanup" };
  }

  // Check if the merged step was the last step or beyond
  if (totalSteps > 0 && stateInfo.currentStep > totalSteps) {
    return { nextAction: "cleanup" };
  }

  // Normal advancement: next step to run is stateInfo.currentStep
  // (state inference already calculated this as highestMergedStep + 1)
  return { nextAction: "advance", nextStep: stateInfo.currentStep };
}

// ---------------------------------------------------------------------------
// normalizePR
// ---------------------------------------------------------------------------

/**
 * Normalize a PR that was detected as a Hachiko migration PR but doesn't use
 * the hachiko/* branch naming convention (e.g. cursor/*, devin/* branches).
 *
 * Adds the hachiko:migration label and a tracking comment if not already present.
 */
export async function normalizePR(params: {
  prNumber: number;
  migrationId: string;
  existingLabels: string[];
  existingComments: string[];
  context: ContextWithRepository;
}): Promise<{ labelAdded: boolean; commentAdded: boolean }> {
  const { prNumber, migrationId, existingLabels, existingComments, context } = params;
  const owner = context.payload.repository.owner.login;
  const repo = context.payload.repository.name;

  let labelAdded = false;
  let commentAdded = false;

  // Check if already normalized
  const alreadyNormalized = existingComments.some((c) =>
    c.includes(`hachiko-track:${migrationId}`)
  );
  if (alreadyNormalized) {
    return { labelAdded, commentAdded };
  }

  // Add label if missing
  if (!existingLabels.includes("hachiko:migration")) {
    await context.octokit.issues.addLabels({
      owner,
      repo,
      issue_number: prNumber,
      labels: ["hachiko:migration"],
    });
    labelAdded = true;
  }

  // Add tracking comment
  await context.octokit.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body: `<!-- hachiko-track:${migrationId} -->\n🤖 **Hachiko Migration Tracking**\nThis PR has been linked to migration \`${migrationId}\`.\nBranch naming was auto-detected from agent output.`,
  });
  commentAdded = true;

  return { labelAdded, commentAdded };
}

// ---------------------------------------------------------------------------
// Frontmatter mutation (pure + I/O)
// ---------------------------------------------------------------------------

/**
 * Pure function: update migration frontmatter content string.
 * Returns new file content with updated fields.
 */
export function updateMigrationFrontmatter(
  fileContent: string,
  action: "advance" | "pause" | "complete"
): string {
  const now = new Date().toISOString();
  let updated = fileContent;

  switch (action) {
    case "advance": {
      // Increment current_step
      const stepMatch = updated.match(/current_step:\s*(\d+)/);
      if (stepMatch && stepMatch[1]) {
        const nextStep = parseInt(stepMatch[1], 10) + 1;
        updated = updated.replace(/current_step:\s*\d+/, `current_step: ${nextStep}`);
      }
      // Set status to pending (ready for next execution)
      updated = updated.replace(/status:\s*\S+/, "status: pending");
      // Remove pr_number and branch lines
      updated = updated.replace(/^pr_number:.*\n?/m, "");
      updated = updated.replace(/^branch:.*\n?/m, "");
      break;
    }

    case "pause": {
      updated = updated.replace(/status:\s*\S+/, "status: paused");
      // Remove pr_number
      updated = updated.replace(/^pr_number:.*\n?/m, "");
      // Add or update error field
      if (/^error:/m.test(updated)) {
        updated = updated.replace(
          /error:.*/,
          "error: Migration paused - PR closed without merging"
        );
      } else {
        updated = updated.replace(
          /last_updated:.*/,
          `last_updated: ${now}\nerror: Migration paused - PR closed without merging`
        );
      }
      break;
    }

    case "complete": {
      updated = updated.replace(/status:\s*\S+/, "status: completed");
      // Remove pr_number and branch lines
      updated = updated.replace(/^pr_number:.*\n?/m, "");
      updated = updated.replace(/^branch:.*\n?/m, "");
      break;
    }
  }

  // Always update last_updated
  updated = updated.replace(/last_updated:\s*\S+/, `last_updated: ${now}`);

  return updated;
}

/**
 * I/O function: read the migration file, apply an update, and write it back.
 */
export async function applyFrontmatterUpdate(
  migrationId: string,
  action: "advance" | "pause" | "complete",
  context: ContextWithRepository
): Promise<void> {
  const owner = context.payload.repository.owner.login;
  const repo = context.payload.repository.name;
  const path = `migrations/${migrationId}.md`;

  // Read current content
  const response = await context.octokit.repos.getContent({ owner, repo, path });
  const data = response.data as { content: string; sha: string };
  const currentContent = Buffer.from(data.content, "base64").toString("utf-8");

  // Apply pure transformation
  const newContent = updateMigrationFrontmatter(currentContent, action);

  // Write back
  await context.octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message: `chore: ${action} migration ${migrationId}`,
    content: Buffer.from(newContent).toString("base64"),
    sha: data.sha,
  });
}

// ---------------------------------------------------------------------------
// Guard: check if migration is already running
// ---------------------------------------------------------------------------

/**
 * Check if there are in-progress workflow runs for execute-migration.
 * Returns true if a run is in progress (should skip triggering).
 */
export async function isMigrationRunning(context: ContextWithRepository): Promise<boolean> {
  const owner = context.payload.repository.owner.login;
  const repo = context.payload.repository.name;

  const { data } = await context.octokit.actions.listWorkflowRuns({
    owner,
    repo,
    workflow_id: "execute-migration.yml",
    status: "in_progress",
    per_page: 1,
  });

  return data.total_count > 0;
}

/**
 * Check if there are open Hachiko PRs for a migration.
 * Used as a guard before triggering the next step to avoid duplicates.
 */
export async function hasOpenPRsForMigration(
  migrationId: string,
  context: ContextWithRepository
): Promise<boolean> {
  const prs = await getOpenHachikoPRs(context, migrationId);
  return prs.length > 0;
}

// ---------------------------------------------------------------------------
// Helpers: extract totalSteps, detect migration from PR
// ---------------------------------------------------------------------------

/**
 * Read total_steps from the migration document frontmatter.
 * Returns 0 if the document doesn't exist or isn't schema v1.
 */
export async function getTotalSteps(
  migrationId: string,
  context: ContextWithRepository
): Promise<number> {
  const docContent = await getMigrationDocumentContent(context, migrationId);
  if (!docContent) return 0;

  try {
    const parsed = parseMigrationDocumentContent(docContent);
    if (parsed.frontmatter.schema_version === 1) {
      return parsed.frontmatter.total_steps;
    }
  } catch {
    // Malformed frontmatter — treat as unknown
  }
  return 0;
}

/**
 * Detect migration ID from a closed PR.
 *
 * Tries multiple paths:
 * 1. detectHachikoPR (branch name, body tracking token, title)
 * 2. Commit tracking tokens (for Devin-style agents)
 *
 * Returns { migrationId, stepNumber? } or null if not a hachiko PR.
 */
export async function detectMigrationFromClosedPR(
  prNumber: number,
  prBranch: string,
  context: ContextWithRepository
): Promise<{ migrationId: string; stepNumber?: number } | null> {
  const owner = context.payload.repository.owner.login;
  const repo = context.payload.repository.name;

  // Fetch PR data for body/title-based detection
  const { data: prData } = await context.octokit.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  // Build PullRequest-compatible object
  const pr: PullRequest = {
    number: prData.number,
    title: prData.title,
    body: prData.body ?? null,
    state: prData.state as "open" | "closed",
    head: { ref: prData.head.ref },
    labels: prData.labels.map((l: any) => (typeof l === "object" ? { name: l.name } : { name: l })),
    html_url: prData.html_url,
    merged_at: prData.merged_at ?? null,
  };

  // Path 1: detectHachikoPR handles branch, body token, title token, bracket match
  const detected = detectHachikoPR(pr);
  if (detected) {
    return {
      migrationId: detected.migrationId,
      ...(detected.stepNumber !== undefined && { stepNumber: detected.stepNumber }),
    };
  }

  // Path 2: Check commit messages for tracking tokens (Devin-style)
  try {
    const { data: commits } = await context.octokit.pulls.listCommits({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 10,
    });

    for (const commit of commits) {
      const msg = commit.commit.message;
      const match = msg.match(/^hachiko-track:([^:\s]+)(?::(\d+))?/m);
      if (match && match[1]) {
        const stepNumber = match[2] ? parseInt(match[2], 10) : null;
        return {
          migrationId: match[1],
          ...(stepNumber !== null && { stepNumber }),
        };
      }
    }
  } catch {
    // Commit fetch failed — can't detect via this path
  }

  return null;
}
