import { promises as fs } from "node:fs"
import { join, resolve } from "node:path"
import { minimatch } from "minimatch"
import type { 
  AgentAdapter, 
  AgentInput, 
  AgentResult, 
  PolicyConfig, 
  PolicyViolation, 
  PolicyEnforcementResult 
} from "../types.js"
import { AgentExecutionError } from "../../utils/errors.js"
import { createLogger } from "../../utils/logger.js"

const logger = createLogger("agent-adapter")

/**
 * Base agent adapter with common functionality
 */
export abstract class BaseAgentAdapter implements AgentAdapter {
  abstract readonly name: string
  
  constructor(
    protected readonly policyConfig: PolicyConfig
  ) {}

  abstract execute(input: AgentInput): Promise<AgentResult>
  abstract validate(): Promise<boolean>
  abstract getConfig(): Record<string, unknown>

  /**
   * Enforce policy restrictions on file access
   */
  protected async enforceFilePolicy(files: string[], repoPath: string): Promise<PolicyEnforcementResult> {
    const violations: PolicyViolation[] = []
    let allowed = true

    for (const file of files) {
      const relativePath = this.getRelativePath(file, repoPath)
      
      // Check against blocked paths
      for (const blockedPattern of this.policyConfig.blockedPaths) {
        if (minimatch(relativePath, blockedPattern)) {
          violations.push({
            type: "file_access",
            message: `Access to blocked path: ${relativePath}`,
            pattern: blockedPattern,
            severity: "error",
          })
          allowed = false
        }
      }

      // Check against allowed paths (if any are specified)
      if (this.policyConfig.allowedPaths.length > 0) {
        const isAllowed = this.policyConfig.allowedPaths.some(pattern => 
          minimatch(relativePath, pattern)
        )
        
        if (!isAllowed) {
          violations.push({
            type: "file_access",
            message: `Access to non-allowlisted path: ${relativePath}`,
            pattern: "not_in_allowlist",
            severity: "error",
          })
          allowed = false
        }
      }

      // Check file size if file exists
      try {
        const stats = await fs.stat(file)
        if (stats.size > this.policyConfig.maxFileSize) {
          violations.push({
            type: "file_size",
            message: `File too large: ${relativePath} (${stats.size} bytes > ${this.policyConfig.maxFileSize})`,
            pattern: "max_file_size",
            severity: "error",
          })
          allowed = false
        }
      } catch (error) {
        // File doesn't exist yet (might be created by agent) - that's okay
      }
    }

    return { allowed, violations }
  }

  /**
   * Enforce policy restrictions on command execution
   */
  protected enforceCommandPolicy(command: string): PolicyEnforcementResult {
    const violations: PolicyViolation[] = []
    let allowed = true

    for (const dangerousPattern of this.policyConfig.dangerousPatterns) {
      if (command.includes(dangerousPattern)) {
        violations.push({
          type: "command_execution",
          message: `Dangerous command detected: ${dangerousPattern}`,
          pattern: dangerousPattern,
          severity: "error",
        })
        allowed = false
      }
    }

    return { allowed, violations }
  }

  /**
   * Get relative path from repository root
   */
  protected getRelativePath(filePath: string, repoPath: string): string {
    const absoluteFilePath = resolve(filePath)
    const absoluteRepoPath = resolve(repoPath)
    
    if (absoluteFilePath.startsWith(absoluteRepoPath)) {
      return absoluteFilePath.slice(absoluteRepoPath.length + 1)
    }
    
    return filePath
  }

  /**
   * Prepare safe working directory with only allowed files
   */
  protected async prepareSafeWorkspace(input: AgentInput): Promise<string> {
    const { repoPath, files } = input
    
    // Create temporary workspace
    const workspaceId = `hachiko-${input.planId}-${input.stepId}-${Date.now()}`
    const workspacePath = join("/tmp", workspaceId)
    
    try {
      await fs.mkdir(workspacePath, { recursive: true })
      
      // Copy allowed files to workspace
      for (const file of files) {
        const relativePath = this.getRelativePath(file, repoPath)
        const sourcePath = resolve(repoPath, relativePath)
        const targetPath = join(workspacePath, relativePath)
        
        // Ensure target directory exists
        await fs.mkdir(join(targetPath, ".."), { recursive: true })
        
        try {
          await fs.copyFile(sourcePath, targetPath)
          logger.debug({ sourcePath, targetPath }, "Copied file to workspace")
        } catch (error) {
          // File might not exist yet - that's okay for files the agent will create
          logger.debug({ sourcePath, error }, "File not found, skipping copy")
        }
      }
      
      return workspacePath
    } catch (error) {
      logger.error({ error, workspacePath }, "Failed to prepare workspace")
      throw new AgentExecutionError(
        `Failed to prepare workspace: ${error instanceof Error ? error.message : String(error)}`,
        this.name
      )
    }
  }

  /**
   * Copy results back from workspace to repository
   */
  protected async copyResultsBack(workspacePath: string, repoPath: string, allowedFiles: string[]): Promise<{
    modifiedFiles: string[]
    createdFiles: string[]
    deletedFiles: string[]
  }> {
    const modifiedFiles: string[] = []
    const createdFiles: string[] = []
    const deletedFiles: string[] = []
    
    try {
      // Check each allowed file for changes
      for (const file of allowedFiles) {
        const relativePath = this.getRelativePath(file, repoPath)
        const workspaceFilePath = join(workspacePath, relativePath)
        const repoFilePath = resolve(repoPath, relativePath)
        
        try {
          const workspaceStats = await fs.stat(workspaceFilePath)
          
          try {
            const repoStats = await fs.stat(repoFilePath)
            
            // File exists in both - check if modified
            const workspaceContent = await fs.readFile(workspaceFilePath, "utf-8")
            const repoContent = await fs.readFile(repoFilePath, "utf-8")
            
            if (workspaceContent !== repoContent) {
              await fs.copyFile(workspaceFilePath, repoFilePath)
              modifiedFiles.push(relativePath)
              logger.debug({ file: relativePath }, "File modified")
            }
          } catch {
            // File doesn't exist in repo - it's a new file
            await fs.mkdir(join(repoFilePath, ".."), { recursive: true })
            await fs.copyFile(workspaceFilePath, repoFilePath)
            createdFiles.push(relativePath)
            logger.debug({ file: relativePath }, "File created")
          }
        } catch {
          // File doesn't exist in workspace - might have been deleted
          try {
            await fs.stat(repoFilePath)
            // File exists in repo but not workspace - mark as deleted
            // Note: We don't actually delete it here for safety
            deletedFiles.push(relativePath)
            logger.debug({ file: relativePath }, "File marked for deletion")
          } catch {
            // File doesn't exist in either place - nothing to do
          }
        }
      }
      
      return { modifiedFiles, createdFiles, deletedFiles }
    } catch (error) {
      logger.error({ error, workspacePath, repoPath }, "Failed to copy results back")
      throw new AgentExecutionError(
        `Failed to copy results: ${error instanceof Error ? error.message : String(error)}`,
        this.name
      )
    }
  }

  /**
   * Clean up workspace
   */
  protected async cleanupWorkspace(workspacePath: string): Promise<void> {
    try {
      await fs.rm(workspacePath, { recursive: true, force: true })
      logger.debug({ workspacePath }, "Cleaned up workspace")
    } catch (error) {
      logger.warn({ error, workspacePath }, "Failed to cleanup workspace")
    }
  }
}
