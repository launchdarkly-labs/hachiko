/**
 * GitHubSimulator — a stateful in-memory fake that implements the subset of
 * GitHub APIs Hachiko uses, compatible with the ContextWithRepository interface
 * so services work unchanged.
 *
 * Usage:
 *   const sim = new GitHubSimulator();
 *   sim.addMigrationFile("my-migration", { title: "My Migration", agent: "cursor", totalSteps: 3 });
 *   const ctx = sim.context();
 *   const state = await getMigrationState(ctx, "my-migration");
 */
import type { ContextWithRepository } from "../types/context.js";
export interface SimulatedIssue {
    number: number;
    title: string;
    body: string;
    labels: string[];
    state: "open" | "closed";
    comments: Array<{
        body: string;
        created_at: string;
    }>;
}
export interface SimulatedPR {
    number: number;
    title: string;
    body: string;
    branch: string;
    labels: string[];
    state: "open" | "closed";
    merged: boolean;
    merged_at: string | null;
    html_url: string;
    commits: Array<{
        sha: string;
        message: string;
    }>;
}
export interface WorkflowDispatch {
    workflow: string;
    ref: string;
    inputs: Record<string, string>;
}
export interface WorkflowRun {
    id: number;
    workflow_id: string;
    name: string;
    status: "queued" | "in_progress" | "completed";
    conclusion: "success" | "failure" | "cancelled" | null;
    head_branch: string;
    created_at: string;
}
export interface AddMigrationFileOpts {
    title: string;
    agent: string;
    totalSteps?: number;
    currentStep?: number;
    status?: string;
    schemaVersion?: 1 | 2;
    reviewers?: string[];
    bodyContent?: string;
}
export declare class GitHubSimulator {
    issues: Map<number, SimulatedIssue>;
    pullRequests: Map<number, SimulatedPR>;
    files: Map<string, string>;
    workflowDispatches: WorkflowDispatch[];
    workflowRuns: WorkflowRun[];
    private nextNumber;
    private nextRunId;
    /** Create a migration .md in the files map with frontmatter */
    addMigrationFile(id: string, opts: AddMigrationFileOpts): void;
    /** Add a PR in open state */
    createPR(opts: {
        branch: string;
        title: string;
        body?: string;
        labels?: string[];
        commits?: Array<{
            sha: string;
            message: string;
        }>;
    }): SimulatedPR;
    /**
     * Create a PR matching the shape a hachiko-native agent would produce.
     * Branch: hachiko/{migrationId}-step-{step}, title: [{migrationId}] Step {step}: {description}
     */
    createHachikoPR(opts: {
        migrationId: string;
        step: number;
        description?: string;
    }): SimulatedPR;
    /**
     * Create a PR matching the shape Cursor (cloud) would produce.
     * Branch: cursor/{slug}-{hash}, body contains tracking token, label hachiko:migration.
     */
    createCursorPR(opts: {
        migrationId: string;
        step: number;
        description?: string;
        hash?: string;
    }): SimulatedPR;
    /**
     * Create a PR matching the shape Devin (cloud) would produce.
     * Branch: devin/{slug}-{hash}, tracking token in first commit message, label hachiko:migration.
     */
    createDevinPR(opts: {
        migrationId: string;
        step: number;
        description?: string;
        hash?: string;
    }): SimulatedPR;
    /** Merge a PR (set state=closed, merged=true, merged_at=now) */
    mergePR(number: number): void;
    /** Close a PR without merging */
    closePR(number: number): void;
    /** Create an issue with the hachiko:migration-dashboard label */
    createDashboardIssue(body: string): SimulatedIssue;
    /** Add a workflow run to the simulator */
    addWorkflowRun(run: Omit<WorkflowRun, "id">): WorkflowRun;
    /** Get a file from the simulator's file store */
    getFile(path: string): string | undefined;
    /** Set a file in the simulator's file store */
    setFile(path: string, content: string): void;
    /** Return a ContextWithRepository wired to this simulator */
    context(owner?: string, repo?: string): ContextWithRepository;
    private buildOctokit;
    private issuesCreate;
    private issuesGet;
    private issuesUpdate;
    private issuesListForRepo;
    private issuesAddLabels;
    private issuesCreateComment;
    private pullsList;
    private pullsGet;
    private pullsListCommits;
    private serializePR;
    private reposGetContent;
    private reposListCommits;
    private reposCreateOrUpdateFileContents;
    private actionsCreateWorkflowDispatch;
    private actionsListWorkflowRuns;
}
//# sourceMappingURL=github-simulator.d.ts.map