import { promises as fs } from "node:fs";
import { createLogger } from "../../utils/logger.js";
import { BaseAgentAdapter } from "./base.js";
const logger = createLogger("mock-adapter");
/**
 * Mock agent adapter for testing and development
 */
export class MockAgentAdapter extends BaseAgentAdapter {
  name = "mock";
  mockConfig;
  constructor(policyConfig, mockConfig = {}) {
    super(policyConfig);
    this.mockConfig = {
      successRate: 0.9,
      executionTime: 2000,
      modifyFiles: false,
      ...mockConfig,
    };
  }
  async validate() {
    // Mock adapter is always available
    return true;
  }
  async execute(input) {
    const startTime = Date.now();
    try {
      // Enforce file access policy
      const policyResult = await this.enforceFilePolicy(input.files, input.repoPath);
      if (!policyResult.allowed) {
        return {
          success: false,
          modifiedFiles: [],
          createdFiles: [],
          deletedFiles: [],
          output: "",
          error: `Policy violations: ${policyResult.violations.map((v) => v.message).join(", ")}`,
          exitCode: 1,
          executionTime: Date.now() - startTime,
        };
      }
      // Simulate execution time
      if (this.mockConfig.executionTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.mockConfig.executionTime));
      }
      // Simulate success/failure based on success rate
      const success = Math.random() < this.mockConfig.successRate;
      const modifiedFiles = [];
      const createdFiles = [];
      // Optionally modify files for testing
      if (success && this.mockConfig.modifyFiles) {
        for (const file of input.files) {
          try {
            const content = await fs.readFile(file, "utf-8");
            const mockModification = `\n// Modified by Hachiko Mock Agent - ${new Date().toISOString()}\n// Plan: ${input.planId}, Step: ${input.stepId}\n`;
            await fs.writeFile(file, content + mockModification, "utf-8");
            modifiedFiles.push(this.getRelativePath(file, input.repoPath));
          } catch (_error) {
            // File might not exist - create it
            const mockContent = `// Created by Hachiko Mock Agent\n// Plan: ${input.planId}, Step: ${input.stepId}\n// Prompt: ${input.prompt.slice(0, 100)}...\n`;
            await fs.writeFile(file, mockContent, "utf-8");
            createdFiles.push(this.getRelativePath(file, input.repoPath));
          }
        }
      }
      const executionTime = Date.now() - startTime;
      const output = success
        ? `Mock agent successfully processed ${input.files.length} files for ${input.planId}/${input.stepId}`
        : `Mock agent simulation failed for ${input.planId}/${input.stepId}`;
      const result = {
        success,
        modifiedFiles,
        createdFiles,
        deletedFiles: [],
        output,
        error: success ? undefined : "Simulated failure",
        exitCode: success ? 0 : 1,
        executionTime,
      };
      logger.info(
        {
          planId: input.planId,
          stepId: input.stepId,
          success,
          executionTime,
          modifiedFiles: modifiedFiles.length,
          createdFiles: createdFiles.length,
        },
        "Mock agent execution completed"
      );
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      logger.error(
        {
          error,
          planId: input.planId,
          stepId: input.stepId,
          executionTime,
        },
        "Mock agent execution failed"
      );
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
  }
  getConfig() {
    return {
      name: this.name,
      successRate: this.mockConfig.successRate,
      executionTime: this.mockConfig.executionTime,
      modifyFiles: this.mockConfig.modifyFiles,
    };
  }
}
//# sourceMappingURL=mock.js.map
