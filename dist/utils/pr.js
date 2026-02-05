/**
 * Checks if a pull request is managed by the Hachiko migration system.
 *
 * This function examines the PR's labels to determine if it's part of a
 * Hachiko-managed migration. A PR is considered a migration PR if it has
 * any label starting with "hachiko" or "migration".
 *
 * @param pr - The pull request object to check
 * @param pr.labels - Optional array of label objects attached to the PR
 * @returns True if the PR has Hachiko or migration labels, false otherwise
 * @example
 * ```typescript
 * const pr = { labels: [{ name: 'hachiko:migration' }, { name: 'bug' }] };
 * isMigrationPR(pr); // Returns: true
 *
 * const regularPR = { labels: [{ name: 'enhancement' }] };
 * isMigrationPR(regularPR); // Returns: false
 *
 * const noLabelsPR = {};
 * isMigrationPR(noLabelsPR); // Returns: false
 * ```
 */
export function isMigrationPR(pr) {
    if (!pr.labels)
        return false;
    return pr.labels.some((label) => label.name.startsWith("hachiko") || label.name.startsWith("migration"));
}
/**
 * Extracts Hachiko-specific labels from a pull request.
 *
 * This function filters the PR's labels to return only those that are
 * specific to the Hachiko migration system. Labels are identified by
 * their "hachiko:" or "migration:" prefix.
 *
 * @param pr - The pull request object to extract labels from
 * @param pr.labels - Optional array of label objects attached to the PR
 * @returns An array of label names that start with "hachiko:" or "migration:"
 * @example
 * ```typescript
 * const pr = {
 *   labels: [
 *     { name: 'hachiko:migration' },
 *     { name: 'hachiko:step:add-jsdoc:1' },
 *     { name: 'bug' }
 *   ]
 * };
 * extractHachikoLabels(pr);
 * // Returns: ['hachiko:migration', 'hachiko:step:add-jsdoc:1']
 *
 * const noLabelsPR = {};
 * extractHachikoLabels(noLabelsPR); // Returns: []
 * ```
 */
export function extractHachikoLabels(pr) {
    if (!pr.labels)
        return [];
    return pr.labels
        .map((label) => label.name)
        .filter((name) => name.startsWith("hachiko:") || name.startsWith("migration:"));
}
/**
 * Extracts migration metadata from a pull request's labels and branch name.
 *
 * This function attempts to identify the migration plan ID, step ID, and optional
 * chunk from a PR using two methods:
 * 1. First, it checks for "hachiko:step:" labels in the format "hachiko:step:{planId}:{stepId}:{chunk?}"
 * 2. If no matching label is found, it falls back to parsing the branch name
 *
 * @param pr - The pull request object containing labels and/or branch information
 * @param pr.labels - Optional array of label objects attached to the PR
 * @param pr.head - Optional object containing the branch reference
 * @param pr.head.ref - The branch name (e.g., "hachi/add-jsdoc/step-1")
 * @returns An object with planId, stepId, and optional chunk, or null if metadata cannot be extracted
 * @example
 * ```typescript
 * // Extract from label
 * const prWithLabel = {
 *   labels: [{ name: 'hachiko:step:add-jsdoc:1:chunk-a' }]
 * };
 * extractMigrationMetadata(prWithLabel);
 * // Returns: { planId: 'add-jsdoc', stepId: '1', chunk: 'chunk-a' }
 *
 * // Extract from branch name
 * const prWithBranch = {
 *   labels: [],
 *   head: { ref: 'hachi/add-jsdoc/step-1' }
 * };
 * extractMigrationMetadata(prWithBranch);
 * // Returns: { planId: 'add-jsdoc', stepId: 'step-1', chunk: undefined }
 *
 * // No metadata available
 * const regularPR = { labels: [], head: { ref: 'feature/my-feature' } };
 * extractMigrationMetadata(regularPR); // Returns: null
 * ```
 */
export function extractMigrationMetadata(pr) {
    // Try to extract from labels first
    const hachikoLabels = extractHachikoLabels(pr);
    for (const label of hachikoLabels) {
        if (label.startsWith("hachiko:step:")) {
            const parts = label.replace("hachiko:step:", "").split(":");
            if (parts.length >= 2 && parts[0] && parts[1]) {
                return {
                    planId: parts[0],
                    stepId: parts[1],
                    chunk: parts[2] || undefined,
                };
            }
        }
    }
    // Fall back to parsing branch name
    if (pr.head?.ref) {
        const { parseMigrationBranchName } = require("./git.js");
        return parseMigrationBranchName(pr.head.ref);
    }
    return null;
}
/**
 * Generates a standardized set of labels for a Hachiko migration pull request.
 *
 * This function creates a consistent labeling scheme that enables tracking and
 * filtering of migration PRs. The generated labels include base identifiers
 * ("hachiko", "migration"), plan-specific labels, and step-specific labels.
 *
 * @param planId - The unique identifier for the migration plan
 * @param stepId - The identifier for the specific step within the migration
 * @param chunk - Optional chunk identifier for large migrations split into parts
 * @param additionalLabels - Optional array of extra labels to include
 * @returns An array of label strings to apply to the PR
 * @example
 * ```typescript
 * // Basic usage
 * generateMigrationPRLabels('add-jsdoc', 'step-1');
 * // Returns: ['hachiko', 'migration', 'hachiko:plan:add-jsdoc', 'hachiko:step:add-jsdoc:step-1']
 *
 * // With chunk
 * generateMigrationPRLabels('add-jsdoc', 'step-1', 'chunk-a');
 * // Returns: ['hachiko', 'migration', 'hachiko:plan:add-jsdoc', 'hachiko:step:add-jsdoc:step-1:chunk-a']
 *
 * // With additional labels
 * generateMigrationPRLabels('add-jsdoc', 'step-1', undefined, ['needs-review']);
 * // Returns: ['hachiko', 'migration', 'hachiko:plan:add-jsdoc', 'hachiko:step:add-jsdoc:step-1', 'needs-review']
 * ```
 */
export function generateMigrationPRLabels(planId, stepId, chunk, additionalLabels = []) {
    const labels = [
        "hachiko",
        "migration",
        `hachiko:plan:${planId}`,
        `hachiko:step:${planId}:${stepId}${chunk ? `:${chunk}` : ""}`,
        ...additionalLabels,
    ];
    return labels;
}
/**
 * Generates a standardized title for a Hachiko migration pull request.
 *
 * This function creates a consistent title format that clearly identifies
 * the PR as part of a Hachiko migration and includes relevant context
 * about the plan and step being executed.
 *
 * @param planTitle - The human-readable title of the migration plan
 * @param stepDescription - A brief description of the current step
 * @param chunk - Optional chunk identifier for large migrations split into parts
 * @returns A formatted PR title string
 * @example
 * ```typescript
 * // Basic usage
 * generateMigrationPRTitle('Add JSDoc Comments', 'Document utility functions');
 * // Returns: 'Hachiko: Add JSDoc Comments - Document utility functions'
 *
 * // With chunk
 * generateMigrationPRTitle('Add JSDoc Comments', 'Document utility functions', 'chunk-a');
 * // Returns: 'Hachiko: Add JSDoc Comments - Document utility functions (chunk-a)'
 * ```
 */
export function generateMigrationPRTitle(planTitle, stepDescription, chunk) {
    const chunkSuffix = chunk ? ` (${chunk})` : "";
    return `Hachiko: ${planTitle} - ${stepDescription}${chunkSuffix}`;
}
/**
 * Generates a standardized body/description for a Hachiko migration pull request.
 *
 * This function creates a comprehensive PR description that includes migration
 * details, a review checklist, and relevant metadata. The generated body follows
 * a consistent format that helps reviewers understand the context and purpose
 * of the automated changes.
 *
 * @param planId - The unique identifier for the migration plan
 * @param stepId - The identifier for the specific step within the migration
 * @param stepDescription - A human-readable description of what this step accomplishes
 * @param planUrl - Optional URL linking to the migration plan document
 * @param chunk - Optional chunk identifier for large migrations split into parts
 * @param promptVersion - Optional version identifier for the prompt used to generate changes
 * @returns A formatted markdown string suitable for use as a PR body
 * @example
 * ```typescript
 * // Basic usage
 * generateMigrationPRBody('add-jsdoc', 'step-1', 'Add JSDoc to utility functions');
 * // Returns a markdown string with migration details and review checklist
 *
 * // With all options
 * generateMigrationPRBody(
 *   'add-jsdoc',
 *   'step-1',
 *   'Add JSDoc to utility functions',
 *   'https://github.com/org/repo/blob/main/migrations/add-jsdoc.md',
 *   'chunk-a',
 *   'v1.2.0'
 * );
 * // Returns a markdown string with full migration details including plan link and prompt version
 * ```
 */
export function generateMigrationPRBody(planId, stepId, stepDescription, planUrl, chunk, promptVersion) {
    const chunkText = chunk ? `\n- **Chunk**: ${chunk}` : "";
    const planLink = planUrl ? `\n- **Plan**: [${planId}](${planUrl})` : `\n- **Plan**: ${planId}`;
    const promptText = promptVersion ? `\n- **Prompt Version**: ${promptVersion}` : "";
    return `This pull request was automatically generated by Hachiko as part of a migration.

## Migration Details
- **Step**: ${stepId}
- **Description**: ${stepDescription}${chunkText}${planLink}${promptText}

## Review Checklist
- [ ] Changes look correct and complete
- [ ] Tests pass
- [ ] No unintended side effects
- [ ] Ready to merge

**Note**: This PR is part of an automated migration. After merging, the next step will be automatically queued.

---
*Generated by [Hachiko](https://github.com/launchdarkly/hachiko)*`;
}
//# sourceMappingURL=pr.js.map