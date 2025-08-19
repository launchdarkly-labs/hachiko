/**
 * Update GitHub Checks API with agent workflow results
 */
export async function updateChecksStatus(context, workflowRun, // TODO: Type this properly
workflowData, logger) {
    logger.info({ workflowData }, "Updating checks status");
    try {
        const { planId, stepId, chunk } = workflowData;
        const chunkText = chunk ? ` (${chunk})` : "";
        const checkName = `Hachiko: ${planId} - ${stepId}${chunkText}`;
        const conclusion = workflowRun.conclusion === "success" ? "success" : "failure";
        const title = conclusion === "success" ? "Migration step completed successfully" : "Migration step failed";
        let summary = `**Plan**: ${planId}\n**Step**: ${stepId}`;
        if (chunk) {
            summary += `\n**Chunk**: ${chunk}`;
        }
        summary += `\n\n[View workflow run](${workflowRun.html_url})`;
        await context.octokit.checks.create({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            name: checkName,
            head_sha: workflowRun.head_sha,
            status: "completed",
            conclusion,
            output: {
                title,
                summary,
            },
        });
        logger.info({ planId, stepId, conclusion }, "Updated checks status");
    }
    catch (error) {
        logger.error({ error, workflowData }, "Failed to update checks status");
        // Don't throw - this is not critical
    }
}
//# sourceMappingURL=checks.js.map