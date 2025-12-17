#!/usr/bin/env tsx
/**
 * Hachiko Results Reporting Script
 *
 * This script reports the results of agent execution back to GitHub
 * via the Checks API and Migration Issue updates.
 */
import { z } from "zod";
// Event payload schema
const HachikoEventSchema = z.object({
  planId: z.string(),
  stepId: z.string(),
  chunk: z.string().optional(),
  promptConfigRef: z.string().optional(),
  commitMessage: z.string(),
  branchName: z.string(),
});
async function main() {
  const eventJson = process.argv[2];
  if (!eventJson) {
    console.error("❌ Missing event payload argument");
    process.exit(1);
  }
  let event;
  try {
    event = HachikoEventSchema.parse(JSON.parse(eventJson));
  } catch (error) {
    console.error("❌ Invalid event payload:", error);
    process.exit(1);
  }
  const workflowConclusion = process.env.WORKFLOW_CONCLUSION || "success";
  // Create GitHub Check
  await createGitHubCheck(event, workflowConclusion);
  // Update Migration Issue (if possible)
  await updateMigrationIssue(event, workflowConclusion);
}
async function createGitHubCheck(event, conclusion) {
  const chunkText = event.chunk ? ` (${event.chunk})` : "";
  const _checkName = `Hachiko: ${event.planId} - ${event.stepId}${chunkText}`;
  const _summary = generateCheckSummary(event, conclusion);
}
async function updateMigrationIssue(event, conclusion) {
  const _comment = generateIssueComment(event, conclusion);
}
function generateCheckSummary(event, conclusion) {
  const status = conclusion === "success" ? "✅ Completed" : "❌ Failed";
  const chunkText = event.chunk ? `\n- **Chunk**: ${event.chunk}` : "";
  return `**Migration Step ${status}**

- **Plan**: ${event.planId}
- **Step**: ${event.stepId}${chunkText}
- **Branch**: ${event.branchName}
- **Prompt Config**: ${event.promptConfigRef || "default"}

${
  conclusion === "success"
    ? "The agent successfully completed the migration step. Review the pull request for changes."
    : "The agent encountered an error during execution. Check the workflow logs for details."
}`;
}
function generateIssueComment(event, conclusion) {
  const emoji = conclusion === "success" ? "✅" : "❌";
  const status = conclusion === "success" ? "completed" : "failed";
  const chunkText = event.chunk ? ` (${event.chunk})` : "";
  const timestamp = new Date().toISOString();
  let comment = `${emoji} **Step Update**: \`${event.stepId}\`${chunkText} → \`${status}\`\n\n`;
  if (conclusion === "success") {
    comment += "The agent successfully executed this migration step. ";
    comment += "A pull request has been created with the changes.\n\n";
    comment += "**Next Steps:**\n";
    comment += "- Review the pull request for correctness\n";
    comment += "- Merge the PR to continue to the next step\n";
    comment += "- Or use `/hachi pause` to halt the migration\n\n";
  } else {
    comment += "The agent encountered an error during execution. ";
    comment += "Please review the workflow logs for details.\n\n";
    comment += "**Next Steps:**\n";
    comment += `- Check the [workflow run](${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}) for error details\n`;
    comment += `- Use \`/hachi retry ${event.stepId}\` to retry this step\n`;
    comment += `- Use \`/hachi skip ${event.stepId}\` to skip this step\n\n`;
  }
  comment += "**Details:**\n";
  comment += `- Branch: ${event.branchName}\n`;
  comment += `- Commit: ${event.commitMessage}\n`;
  comment += `- Prompt Config: ${event.promptConfigRef || "default"}\n\n`;
  comment += `*Updated at ${timestamp}*`;
  return comment;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("❌ Fatal error:", error);
    process.exit(1);
  });
}
//# sourceMappingURL=hachiko-report.js.map
