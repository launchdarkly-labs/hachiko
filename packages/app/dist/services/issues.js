"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMigrationIssue = createMigrationIssue;
exports.createPlanReviewPR = createPlanReviewPR;
const plans_js_1 = require("./plans.js");
/**
 * Create a Migration Issue for a new plan
 */
async function createMigrationIssue(context, plan, config, logger) {
    logger.info({ planId: plan.id }, "Creating Migration Issue");
    const title = `[Migration] ${plan.frontmatter.title}`;
    const body = generateMigrationIssueBody(plan, config);
    const labels = [
        "hachiko",
        "migration",
        `hachiko:plan:${plan.id}`,
        `hachiko:status:${plan.frontmatter.status}`,
        ...config.defaults.labels,
    ];
    try {
        const issue = await context.octokit.issues.create({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            title,
            body,
            labels,
        });
        logger.info({
            planId: plan.id,
            issueNumber: issue.data.number,
            issueUrl: issue.data.html_url,
        }, "Created Migration Issue");
    }
    catch (error) {
        logger.error({ error, planId: plan.id }, "Failed to create Migration Issue");
        throw error;
    }
}
/**
 * Create a Plan Review PR for a new plan
 */
async function createPlanReviewPR(context, plan, config, logger) {
    logger.info({ planId: plan.id }, "Creating Plan Review PR");
    try {
        // Generate normalized frontmatter
        const normalized = (0, plans_js_1.generateNormalizedFrontmatter)(plan.frontmatter, config);
        const normalizedYaml = (0, plans_js_1.serializeFrontmatter)(normalized);
        // Create a new branch for the plan review
        const baseSha = await getLatestCommitSha(context);
        const branchName = `hachi/plan-review/${plan.id}`;
        await context.octokit.git.createRef({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            ref: `refs/heads/${branchName}`,
            sha: baseSha,
        });
        // Update the plan file with normalized frontmatter
        const updatedContent = `---\n${normalizedYaml}\n---\n${plan.content}`;
        await context.octokit.repos.createOrUpdateFileContents({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            path: plan.filePath,
            message: `Hachiko: Normalize plan frontmatter for ${plan.id}`,
            content: Buffer.from(updatedContent).toString("base64"),
            branch: branchName,
        });
        // Create the PR
        const title = `[Plan Review] ${plan.frontmatter.title}`;
        const body = generatePlanReviewPRBody(plan, normalized);
        const pr = await context.octokit.pulls.create({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            title,
            body,
            head: branchName,
            base: context.payload.repository.default_branch,
        });
        // Add labels
        await context.octokit.issues.addLabels({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            issue_number: pr.data.number,
            labels: ["hachiko", "plan-review", `hachiko:plan:${plan.id}`],
        });
        logger.info({
            planId: plan.id,
            prNumber: pr.data.number,
            prUrl: pr.data.html_url,
        }, "Created Plan Review PR");
    }
    catch (error) {
        logger.error({ error, planId: plan.id }, "Failed to create Plan Review PR");
        throw error;
    }
}
/**
 * Generate the body content for a Migration Issue
 */
function generateMigrationIssueBody(plan, config) {
    const { frontmatter } = plan;
    // Generate step checklist
    const stepsChecklist = frontmatter.steps
        .map((step) => `- [ ] **${step.id}**: ${step.description}`)
        .join("\n");
    // Generate metadata section
    const metadata = [
        `**Plan ID**: \`${frontmatter.id}\``,
        `**Owner**: ${frontmatter.owner}`,
        `**Status**: ${frontmatter.status}`,
        `**Agent**: ${frontmatter.agent || config.defaults.agent}`,
        `**Strategy**: ${frontmatter.strategy.chunkBy} (max ${frontmatter.strategy.maxOpenPRs} PRs)`,
    ];
    if (frontmatter.dependsOn.length > 0) {
        metadata.push(`**Dependencies**: ${frontmatter.dependsOn.join(", ")}`);
    }
    if (frontmatter.touches.length > 0) {
        metadata.push(`**Touches**: ${frontmatter.touches.join(", ")}`);
    }
    return `# ${frontmatter.title}

${plan.content}

---

## Migration Progress

### Steps
${stepsChecklist}

### Metadata
${metadata.join("\n")}

### Success Criteria
${frontmatter.successCriteria.map((criteria) => `- ${criteria}`).join("\n") || "- Migration completes successfully"}

---

**Commands**: Use \`/hachi status\`, \`/hachi pause\`, \`/hachi resume\` to control this migration.

*This issue is automatically managed by [Hachiko](https://github.com/launchdarkly/hachiko)*`;
}
/**
 * Generate the body content for a Plan Review PR
 */
function generatePlanReviewPRBody(original, _normalized) {
    return `This pull request normalizes the migration plan frontmatter and generates any missing default steps.

## Changes Made

- ✅ Applied default configuration values
- ✅ Normalized frontmatter structure
- ✅ Generated default steps (if missing)
- ✅ Validated plan schema

## Migration Plan: ${original.frontmatter.title}

**Plan ID**: \`${original.id}\`
**Owner**: ${original.frontmatter.owner}

## Review Checklist

- [ ] Plan scope and approach looks correct
- [ ] Steps are logical and complete
- [ ] Success criteria are clear
- [ ] Dependencies are accurate
- [ ] Ready to activate migration

**Note**: Merging this PR will activate the migration and create the first step.

---
*Generated by [Hachiko](https://github.com/launchdarkly/hachiko)*`;
}
/**
 * Get the latest commit SHA from the default branch
 */
async function getLatestCommitSha(context) {
    const branch = await context.octokit.repos.getBranch({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        branch: context.payload.repository.default_branch,
    });
    return branch.data.commit.sha;
}
//# sourceMappingURL=issues.js.map