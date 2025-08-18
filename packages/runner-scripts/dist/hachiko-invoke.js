#!/usr/bin/env tsx
/**
 * Hachiko Agent Invocation Script
 *
 * This script is executed by the GitHub Actions runner to invoke
 * the configured agent for a migration step.
 */
import { readFile, writeFile } from "node:fs/promises";
import { execa } from "execa";
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
    }
    catch (error) {
        console.error("❌ Invalid event payload:", error);
        process.exit(1);
    }
    // Load Hachiko configuration
    const config = await loadConfig();
    const agentConfig = config.agents[config.defaults.agent];
    if (!agentConfig) {
        console.error(`❌ Agent "${config.defaults.agent}" not found in configuration`);
        process.exit(1);
    }
    // Load migration plan
    const plan = await loadPlan(event.planId, config);
    const step = plan.steps.find((s) => s.id === event.stepId);
    if (!step) {
        console.error(`❌ Step "${event.stepId}" not found in plan`);
        process.exit(1);
    }
    // Create working branch
    await createWorkingBranch(event.branchName);
    // Prepare prompt (placeholder for LaunchDarkly integration)
    const prompt = await preparePrompt(event, plan, step);
    // Execute agent in sandbox
    const result = await executeAgent(agentConfig, prompt, event);
    if (result.changedFiles.length > 0) {
        for (const _file of result.changedFiles) {
        }
    }
    if (!result.success) {
        console.error("❌ Agent execution failed");
        console.error(result.error);
        process.exit(1);
    }
}
async function loadConfig() {
    // For now, return the example config
    // TODO: Load from repository .hachiko.yml
    return {
        defaults: { agent: "mock-agent" },
        agents: {
            "mock-agent": {
                kind: "cli",
                command: "echo",
                args: ["Mock agent execution completed"],
            },
        },
    };
}
async function loadPlan(planId, _config) {
    // For now, return mock plan data
    // TODO: Load actual plan from repository
    return {
        id: planId,
        steps: [
            {
                id: "detect",
                description: "Inventory and analyze code",
            },
            {
                id: "codemod",
                description: "Apply automated transformations",
            },
            {
                id: "verify",
                description: "Verify migration success",
            },
        ],
    };
}
async function createWorkingBranch(branchName) {
    try {
        // Check if branch already exists
        await execa("git", ["show-ref", "--verify", `refs/heads/${branchName}`]);
        await execa("git", ["checkout", branchName]);
    }
    catch {
        await execa("git", ["checkout", "-b", branchName]);
    }
}
async function preparePrompt(event, _plan, step) {
    // TODO: Integrate with LaunchDarkly to fetch prompt templates
    const prompt = `You are a coding agent helping with a migration.

Plan: ${event.planId}
Step: ${event.stepId} - ${step.description}
Chunk: ${event.chunk || "entire codebase"}

Please analyze the codebase and make the necessary changes for this migration step.
Focus only on files that are relevant to this specific step.
Ensure all changes are safe and well-tested.

When complete, commit your changes with the message: "${event.commitMessage}"`;
    // Write prompt to temp file for agent consumption
    const promptPath = "/tmp/hachiko-prompt.txt";
    await writeFile(promptPath, prompt);
    return promptPath;
}
async function executeAgent(agentConfig, promptPath, event) {
    const startTime = Date.now();
    try {
        if (agentConfig.kind === "cli") {
            // For mock agent, just simulate execution
            if (agentConfig.command === "echo") {
                // Simulate making changes to fixture files
                const changedFiles = await simulateMockChanges(event);
                return {
                    success: true,
                    changedFiles,
                    duration: Date.now() - startTime,
                };
            }
            // Real agent execution would happen here
            const result = await execa(agentConfig.command, [
                ...agentConfig.args,
                "--prompt-file",
                promptPath,
            ]);
            return {
                success: result.exitCode === 0,
                changedFiles: await getChangedFiles(),
                duration: Date.now() - startTime,
            };
        }
        throw new Error(`Unsupported agent kind: ${agentConfig.kind}`);
    }
    catch (error) {
        return {
            success: false,
            changedFiles: [],
            duration: Date.now() - startTime,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
async function simulateMockChanges(event) {
    // For demonstration, modify one of the fixture files
    const filePath = "examples/fixtures/SampleTest.java";
    try {
        const content = await readFile(filePath, "utf-8");
        const modified = content
            .replace("import org.junit.Test;", "import org.junit.jupiter.api.Test;")
            .replace("import org.junit.Assert;", "import org.junit.jupiter.api.Assertions;")
            .replace("Assert.assertEquals", "Assertions.assertEquals");
        await writeFile(filePath, modified);
        // Stage and commit the changes
        await execa("git", ["add", filePath]);
        await execa("git", ["commit", "-m", event.commitMessage]);
        return [filePath];
    }
    catch (_error) {
        return [];
    }
}
async function getChangedFiles() {
    try {
        const result = await execa("git", ["diff", "--name-only", "HEAD~1"]);
        return result.stdout.split("\n").filter(Boolean);
    }
    catch {
        return [];
    }
}
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error("❌ Fatal error:", error);
        process.exit(1);
    });
}
//# sourceMappingURL=hachiko-invoke.js.map