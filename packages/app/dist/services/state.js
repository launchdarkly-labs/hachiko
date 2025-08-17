"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateManager = exports.StepState = exports.MigrationState = void 0;
exports.createStateManager = createStateManager;
const errors_js_1 = require("../utils/errors.js");
const logger_js_1 = require("../utils/logger.js");
const logger = (0, logger_js_1.createLogger)("state-service");
/**
 * Migration state enumeration
 */
exports.MigrationState = {
    DRAFT: "draft",
    PLAN_APPROVED: "plan-approved",
    QUEUED: "queued",
    RUNNING: "running",
    AWAITING_REVIEW: "awaiting-review",
    COMPLETED: "completed",
    FAILED: "failed",
    CANCELLED: "cancelled",
    PAUSED: "paused",
};
/**
 * Step state enumeration
 */
exports.StepState = {
    PENDING: "pending",
    RUNNING: "running",
    COMPLETED: "completed",
    FAILED: "failed",
    SKIPPED: "skipped",
    PAUSED: "paused",
};
/**
 * State transition rules
 */
const VALID_STATE_TRANSITIONS = {
    [exports.MigrationState.DRAFT]: [exports.MigrationState.PLAN_APPROVED, exports.MigrationState.CANCELLED],
    [exports.MigrationState.PLAN_APPROVED]: [exports.MigrationState.QUEUED, exports.MigrationState.CANCELLED, exports.MigrationState.DRAFT],
    [exports.MigrationState.QUEUED]: [exports.MigrationState.RUNNING, exports.MigrationState.PAUSED, exports.MigrationState.CANCELLED],
    [exports.MigrationState.RUNNING]: [exports.MigrationState.AWAITING_REVIEW, exports.MigrationState.COMPLETED, exports.MigrationState.FAILED, exports.MigrationState.PAUSED, exports.MigrationState.CANCELLED],
    [exports.MigrationState.AWAITING_REVIEW]: [exports.MigrationState.RUNNING, exports.MigrationState.COMPLETED, exports.MigrationState.FAILED, exports.MigrationState.CANCELLED],
    [exports.MigrationState.COMPLETED]: [], // Terminal state
    [exports.MigrationState.FAILED]: [exports.MigrationState.QUEUED, exports.MigrationState.CANCELLED], // Can retry
    [exports.MigrationState.CANCELLED]: [], // Terminal state
    [exports.MigrationState.PAUSED]: [exports.MigrationState.RUNNING, exports.MigrationState.CANCELLED],
};
const VALID_STEP_TRANSITIONS = {
    [exports.StepState.PENDING]: [exports.StepState.RUNNING, exports.StepState.SKIPPED],
    [exports.StepState.RUNNING]: [exports.StepState.COMPLETED, exports.StepState.FAILED, exports.StepState.PAUSED],
    [exports.StepState.COMPLETED]: [], // Terminal state
    [exports.StepState.FAILED]: [exports.StepState.RUNNING], // Can retry
    [exports.StepState.SKIPPED]: [], // Terminal state
    [exports.StepState.PAUSED]: [exports.StepState.RUNNING],
};
/**
 * State management service using GitHub Issues as the backend
 */
class StateManager {
    static instance = null;
    constructor() { }
    static getInstance() {
        if (!this.instance) {
            this.instance = new StateManager();
        }
        return this.instance;
    }
    /**
     * Create a new migration state
     */
    async createMigrationState(context, planId, issueNumber, totalSteps, stepIds) {
        const now = new Date().toISOString();
        const initialProgress = {
            planId,
            state: exports.MigrationState.DRAFT,
            issueNumber,
            totalSteps,
            completedSteps: 0,
            failedSteps: 0,
            skippedSteps: 0,
            lastUpdatedAt: now,
            steps: {},
            metadata: {
                owner: context.payload.repository.owner.login,
                repository: context.payload.repository.name,
                baseBranch: context.payload.repository.default_branch,
            },
        };
        // Initialize step states
        for (const stepId of stepIds) {
            initialProgress.steps[stepId] = {
                stepId,
                state: exports.StepState.PENDING,
                retryCount: 0,
            };
        }
        await this.persistState(context, initialProgress);
        logger.info({
            planId,
            issueNumber,
            totalSteps,
            state: initialProgress.state,
        }, "Created migration state");
        return initialProgress;
    }
    /**
     * Load migration state from GitHub Issue
     */
    async loadMigrationState(context, planId) {
        try {
            // Find the migration issue
            const issues = await context.octokit.issues.listForRepo({
                owner: context.payload.repository.owner.login,
                repo: context.payload.repository.name,
                labels: `hachiko:plan:${planId}`,
                state: "open",
            });
            if (issues.data.length === 0) {
                logger.debug({ planId }, "No migration issue found");
                return null;
            }
            const issue = issues.data[0];
            return this.parseStateFromIssue(issue.body || "");
        }
        catch (error) {
            logger.error({ error, planId }, "Failed to load migration state");
            throw new errors_js_1.MigrationStateError(`Failed to load state for plan ${planId}`, planId, "unknown");
        }
    }
    /**
     * Update migration state
     */
    async updateMigrationState(context, planId, newState) {
        const currentProgress = await this.loadMigrationState(context, planId);
        if (!currentProgress) {
            throw new errors_js_1.MigrationStateError(`Migration state not found for plan ${planId}`, planId, "unknown");
        }
        // Validate state transition
        const validTransitions = VALID_STATE_TRANSITIONS[currentProgress.state];
        if (!validTransitions.includes(newState)) {
            throw new errors_js_1.MigrationStateError(`Invalid state transition from ${currentProgress.state} to ${newState}`, planId, currentProgress.state);
        }
        // Update state
        currentProgress.state = newState;
        currentProgress.lastUpdatedAt = new Date().toISOString();
        if (newState === exports.MigrationState.RUNNING && !currentProgress.startedAt) {
            currentProgress.startedAt = currentProgress.lastUpdatedAt;
        }
        const terminalStates = [exports.MigrationState.COMPLETED, exports.MigrationState.FAILED, exports.MigrationState.CANCELLED];
        if (terminalStates.includes(newState)) {
            currentProgress.completedAt = currentProgress.lastUpdatedAt;
        }
        await this.persistState(context, currentProgress);
        logger.info({
            planId,
            oldState: currentProgress.state,
            newState,
        }, "Updated migration state");
        return currentProgress;
    }
    /**
     * Update step state
     */
    async updateStepState(context, planId, stepId, newState, metadata) {
        const currentProgress = await this.loadMigrationState(context, planId);
        if (!currentProgress) {
            throw new errors_js_1.MigrationStateError(`Migration state not found for plan ${planId}`, planId, "unknown");
        }
        const step = currentProgress.steps[stepId];
        if (!step) {
            throw new errors_js_1.MigrationStateError(`Step ${stepId} not found in plan ${planId}`, planId, currentProgress.state);
        }
        // Validate step state transition
        const validTransitions = VALID_STEP_TRANSITIONS[step.state];
        if (!validTransitions.includes(newState)) {
            throw new errors_js_1.MigrationStateError(`Invalid step state transition from ${step.state} to ${newState}`, planId, currentProgress.state);
        }
        // Update step state
        const now = new Date().toISOString();
        step.state = newState;
        if (newState === exports.StepState.RUNNING && !step.startedAt) {
            step.startedAt = now;
        }
        const terminalStepStates = [exports.StepState.COMPLETED, exports.StepState.FAILED, exports.StepState.SKIPPED];
        if (terminalStepStates.includes(newState)) {
            step.completedAt = now;
        }
        // Apply metadata updates
        if (metadata) {
            Object.assign(step, metadata);
        }
        // Recalculate progress counters
        this.recalculateProgress(currentProgress);
        currentProgress.lastUpdatedAt = now;
        await this.persistState(context, currentProgress);
        logger.info({
            planId,
            stepId,
            oldState: step.state,
            newState,
        }, "Updated step state");
        return currentProgress;
    }
    /**
     * Get migration state
     */
    async getMigrationState(context, planId) {
        return this.loadMigrationState(context, planId);
    }
    /**
     * List all active migrations
     */
    async listActiveMigrations(context) {
        try {
            const issues = await context.octokit.issues.listForRepo({
                owner: context.payload.repository.owner.login,
                repo: context.payload.repository.name,
                labels: "hachiko,migration",
                state: "open",
            });
            const migrations = [];
            for (const issue of issues.data) {
                try {
                    const progress = this.parseStateFromIssue(issue.body || "");
                    if (progress) {
                        migrations.push(progress);
                    }
                }
                catch (error) {
                    logger.warn({ error, issueNumber: issue.number }, "Failed to parse migration state from issue");
                }
            }
            return migrations;
        }
        catch (error) {
            logger.error({ error }, "Failed to list active migrations");
            return [];
        }
    }
    /**
     * Persist state to GitHub Issue
     */
    async persistState(context, progress) {
        const stateJson = JSON.stringify(progress, null, 2);
        const body = this.generateIssueBody(progress, stateJson);
        await context.octokit.issues.update({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            issue_number: progress.issueNumber,
            body,
        });
    }
    /**
     * Parse state from issue body
     */
    parseStateFromIssue(body) {
        // Look for state JSON in code block
        const stateMatch = body.match(/```json\n([\s\S]*?)\n```/);
        if (!stateMatch) {
            return null;
        }
        try {
            return JSON.parse(stateMatch[1]);
        }
        catch (error) {
            logger.error({ error }, "Failed to parse state JSON");
            return null;
        }
    }
    /**
     * Generate issue body with embedded state
     */
    generateIssueBody(progress, stateJson) {
        const { planId, state, totalSteps, completedSteps, failedSteps, skippedSteps } = progress;
        const progressPercent = Math.round((completedSteps / totalSteps) * 100);
        return `# Migration Progress: ${planId}

## Status: ${state.toUpperCase()}

### Progress Overview
- **Completed**: ${completedSteps}/${totalSteps} steps (${progressPercent}%)
- **Failed**: ${failedSteps} steps
- **Skipped**: ${skippedSteps} steps

### Step Status
${Object.values(progress.steps).map(step => {
            const icon = step.state === exports.StepState.COMPLETED ? "✅" :
                step.state === exports.StepState.FAILED ? "❌" :
                    step.state === exports.StepState.RUNNING ? "🏃" :
                        step.state === exports.StepState.SKIPPED ? "⏭️" :
                            step.state === exports.StepState.PAUSED ? "⏸️" : "⏳";
            return `- ${icon} **${step.stepId}**: ${step.state}`;
        }).join("\n")}

---

<!-- Hachiko State Data - DO NOT EDIT -->
\`\`\`json
${stateJson}
\`\`\``;
    }
    /**
     * Recalculate progress counters
     */
    recalculateProgress(progress) {
        progress.completedSteps = 0;
        progress.failedSteps = 0;
        progress.skippedSteps = 0;
        for (const step of Object.values(progress.steps)) {
            switch (step.state) {
                case exports.StepState.COMPLETED:
                    progress.completedSteps++;
                    break;
                case exports.StepState.FAILED:
                    progress.failedSteps++;
                    break;
                case exports.StepState.SKIPPED:
                    progress.skippedSteps++;
                    break;
            }
        }
        // Update current step
        progress.currentStep = Object.values(progress.steps)
            .find(step => step.state === exports.StepState.RUNNING)?.stepId || undefined;
    }
}
exports.StateManager = StateManager;
/**
 * Factory function to get state manager instance
 */
function createStateManager() {
    return StateManager.getInstance();
}
//# sourceMappingURL=state.js.map