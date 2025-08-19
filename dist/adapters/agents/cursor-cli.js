import { join } from "node:path";
import { AgentExecutionError } from "../../utils/errors.js";
import { createLogger } from "../../utils/logger.js";
import { ContainerExecutor } from "../container.js";
import { BaseAgentAdapter } from "./base.js";
const logger = createLogger("cursor-cli-adapter");
/**
 * Cursor CLI agent adapter with container sandboxing
 */
export class CursorCliAdapter extends BaseAgentAdapter {
    name = "cursor-cli";
    containerExecutor;
    cursorConfig;
    constructor(policyConfig, cursorConfig) {
        super(policyConfig);
        this.containerExecutor = ContainerExecutor.getInstance();
        this.cursorConfig = cursorConfig;
    }
    async validate() {
        try {
            // Check if Docker is available
            const dockerAvailable = await this.containerExecutor.isDockerAvailable();
            if (!dockerAvailable) {
                logger.error("Docker is not available");
                return false;
            }
            // Check if Cursor CLI image is available
            const result = await this.containerExecutor.executeCommand("docker", [
                "image",
                "inspect",
                this.cursorConfig.image,
            ]);
            if (result.exitCode !== 0) {
                logger.warn({ image: this.cursorConfig.image }, "Cursor CLI image not found, will pull on first use");
            }
            return true;
        }
        catch (error) {
            logger.error({ error }, "Cursor CLI validation failed");
            return false;
        }
    }
    async execute(input) {
        const startTime = Date.now();
        let workspacePath = null;
        let containerId = null;
        try {
            // Enforce file access policy
            const policyResult = await this.enforceFilePolicy(input.files, input.repoPath);
            if (!policyResult.allowed) {
                throw new AgentExecutionError(`Policy violations: ${policyResult.violations.map((v) => v.message).join(", ")}`, this.name);
            }
            // Prepare safe workspace
            workspacePath = await this.prepareSafeWorkspace(input);
            // Create container
            const containerConfig = {
                image: this.cursorConfig.image,
                timeout: this.cursorConfig.timeout,
                memoryLimit: this.cursorConfig.memoryLimit || undefined,
                cpuLimit: this.cursorConfig.cpuLimit || undefined,
                workdir: "/workspace",
                env: {
                    ...(this.cursorConfig.apiKey && { CURSOR_API_KEY: this.cursorConfig.apiKey }),
                    PLAN_ID: input.planId,
                    STEP_ID: input.stepId,
                    ...(input.chunk && { CHUNK: input.chunk }),
                },
            };
            const containerContext = await this.containerExecutor.createContainer(containerConfig, workspacePath, input.repoPath);
            containerId = containerContext.containerId;
            // Create instruction file
            const instructionFile = join(workspacePath, ".hachiko-instructions.md");
            await this.writeInstructionFile(instructionFile, input);
            // Execute Cursor CLI
            const command = [
                "cursor",
                "--headless",
                "--apply",
                "--instruction-file",
                ".hachiko-instructions.md",
                "--non-interactive",
                ...input.files.map((f) => this.getRelativePath(f, input.repoPath)),
            ];
            const executionResult = await this.containerExecutor.executeInContainer(containerContext, command, this.cursorConfig.timeout * 1000);
            // Copy results back to repository
            const fileChanges = await this.copyResultsBack(workspacePath, input.repoPath, input.files);
            const success = executionResult.exitCode === 0;
            const executionTime = Date.now() - startTime;
            const result = {
                success,
                modifiedFiles: fileChanges.modifiedFiles,
                createdFiles: fileChanges.createdFiles,
                deletedFiles: fileChanges.deletedFiles,
                output: executionResult.stdout,
                error: success ? undefined : executionResult.stderr,
                exitCode: executionResult.exitCode,
                executionTime,
            };
            logger.info({
                planId: input.planId,
                stepId: input.stepId,
                success,
                executionTime,
                modifiedFiles: fileChanges.modifiedFiles.length,
                createdFiles: fileChanges.createdFiles.length,
            }, "Cursor CLI execution completed");
            return result;
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            logger.error({
                error,
                planId: input.planId,
                stepId: input.stepId,
                executionTime,
            }, "Cursor CLI execution failed");
            return {
                success: false,
                modifiedFiles: [],
                createdFiles: [],
                deletedFiles: [],
                output: "",
                error: error instanceof Error ? error.message : String(error),
                exitCode: -1,
                executionTime,
            };
        }
        finally {
            // Cleanup
            if (containerId) {
                await this.containerExecutor.destroyContainer(containerId);
            }
            if (workspacePath) {
                await this.cleanupWorkspace(workspacePath);
            }
        }
    }
    getConfig() {
        return {
            name: this.name,
            image: this.cursorConfig.image,
            timeout: this.cursorConfig.timeout,
            memoryLimit: this.cursorConfig.memoryLimit,
            cpuLimit: this.cursorConfig.cpuLimit,
            hasApiKey: !!this.cursorConfig.apiKey,
        };
    }
    /**
     * Write instruction file for Cursor CLI
     */
    async writeInstructionFile(instructionPath, input) {
        const instructions = `# Migration Instructions

## Task Context
- Migration Plan: ${input.planId}
- Current Step: ${input.stepId}
${input.chunk ? `- Processing Chunk: ${input.chunk}` : ""}

## Target Files
${input.files.map((f) => `- ${this.getRelativePath(f, input.repoPath)}`).join("\n")}

## Detailed Instructions
${input.prompt}

## Requirements
1. Only modify the files listed above
2. Preserve existing functionality while applying changes
3. Follow the project's coding standards and patterns
4. Ensure changes are atomic and safe
5. Add comments to explain significant modifications

## Output Format
Please apply the changes directly to the files. Use clear, incremental modifications.
`;
        const fs = await import("node:fs/promises");
        await fs.writeFile(instructionPath, instructions, "utf-8");
    }
}
//# sourceMappingURL=cursor-cli.js.map