import LaunchDarklyClient from "@launchdarkly/node-server-sdk"
import type { HachikoConfig } from "../config/schema.js"
import { ConfigurationError } from "../utils/errors.js"
import { createLogger } from "../utils/logger.js"

const logger = createLogger("ai-configs")

/**
 * AI configuration data structure
 */
export interface AIPromptConfig {
  /** Prompt template */
  template: string
  /** Prompt version */
  version: string
  /** Temperature setting */
  temperature?: number
  /** Model configuration */
  model?: string
  /** Max tokens */
  maxTokens?: number
  /** Additional parameters */
  parameters?: Record<string, unknown>
}

/**
 * Context for prompt evaluation
 */
export interface PromptContext {
  /** Migration plan ID */
  planId: string
  /** Step ID */
  stepId: string
  /** Repository information */
  repository: {
    owner: string
    name: string
    defaultBranch: string
  }
  /** User information */
  user?: {
    login: string
    type: string
  }
  /** Environment */
  environment: string
  /** Additional context data */
  metadata?: Record<string, unknown>
}

/**
 * AI configuration manager using LaunchDarkly for dynamic prompt management
 */
export class AIConfigManager {
  private static instance: AIConfigManager | null = null
  private ldClient: LaunchDarklyClient.LDClient | null = null
  private config: HachikoConfig | null = null
  private initialized = false

  private constructor() {}

  static getInstance(): AIConfigManager {
    if (!AIConfigManager.instance) {
      AIConfigManager.instance = new AIConfigManager()
    }
    return AIConfigManager.instance
  }

  /**
   * Initialize the AI config manager
   */
  async initialize(config: HachikoConfig): Promise<void> {
    if (this.initialized) {
      return
    }

    this.config = config

    if (config.aiConfigs.provider === "launchdarkly") {
      await this.initializeLaunchDarkly()
    }

    this.initialized = true
    logger.info({ provider: config.aiConfigs.provider }, "AI config manager initialized")
  }

  /**
   * Get prompt configuration for a migration step
   */
  async getPromptConfig(
    planId: string,
    stepId: string,
    context: PromptContext
  ): Promise<AIPromptConfig> {
    if (!this.initialized || !this.config) {
      throw new ConfigurationError("AI config manager not initialized")
    }

    const flagKey = this.buildFlagKey(planId, stepId)

    if (this.config.aiConfigs.provider === "launchdarkly" && this.ldClient) {
      return this.getPromptFromLaunchDarkly(flagKey, context)
    }
    return this.getPromptFromLocal(planId, stepId)
  }

  /**
   * Get available prompt configurations
   */
  async getAvailablePrompts(): Promise<Record<string, AIPromptConfig>> {
    if (!this.initialized || !this.config) {
      throw new ConfigurationError("AI config manager not initialized")
    }

    if (this.config.aiConfigs.provider === "launchdarkly") {
      // LaunchDarkly client SDK doesn't provide a method to list all flags
      // Users should use the hachiko-list-flags script which uses the Management API
      logger.warn(
        "Listing LaunchDarkly prompts requires the Management API. Use 'pnpm scripts:list-flags' instead."
      )
      return {}
    }
    return this.getLocalPrompts()
  }

  /**
   * Test a prompt configuration
   */
  async testPromptConfig(
    config: AIPromptConfig,
    context: PromptContext
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = []

    // Validate template
    if (!config.template || config.template.trim().length === 0) {
      errors.push("Template cannot be empty")
    }

    // Validate version
    if (!config.version) {
      errors.push("Version is required")
    }

    // Test template interpolation
    try {
      this.interpolateTemplate(config.template, context)
    } catch (error) {
      errors.push(
        `Template interpolation failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    // Validate parameters
    if (config.temperature !== undefined && (config.temperature < 0 || config.temperature > 2)) {
      errors.push("Temperature must be between 0 and 2")
    }

    if (config.maxTokens !== undefined && config.maxTokens <= 0) {
      errors.push("Max tokens must be positive")
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }

  /**
   * Interpolate prompt template with context
   */
  interpolateTemplate(template: string, context: PromptContext): string {
    let result = template

    // Replace context variables
    const variables = {
      planId: context.planId,
      stepId: context.stepId,
      repository: context.repository.name,
      owner: context.repository.owner,
      defaultBranch: context.repository.defaultBranch,
      user: context.user?.login || "unknown",
      environment: context.environment,
      ...context.metadata,
    }

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g")
      result = result.replace(regex, String(value))
    }

    // Check for unresolved variables
    const unresolvedMatches = result.match(/\{\{\s*\w+\s*\}\}/g)
    if (unresolvedMatches) {
      throw new Error(`Unresolved template variables: ${unresolvedMatches.join(", ")}`)
    }

    return result
  }

  /**
   * Close the AI config manager
   */
  async close(): Promise<void> {
    if (this.ldClient) {
      await this.ldClient.close()
      this.ldClient = null
    }
    this.initialized = false
    logger.info("AI config manager closed")
  }

  /**
   * Initialize LaunchDarkly client
   */
  private async initializeLaunchDarkly(): Promise<void> {
    const sdkKey = process.env.LAUNCHDARKLY_SDK_KEY
    if (!sdkKey) {
      throw new ConfigurationError("LAUNCHDARKLY_SDK_KEY environment variable is required")
    }

    try {
      this.ldClient = LaunchDarklyClient.init(sdkKey, {
        stream: true,
        offline: process.env.NODE_ENV === "test",
      })

      await this.ldClient.waitForInitialization({ timeout: 10 })
      logger.info("LaunchDarkly client initialized")
    } catch (error) {
      logger.error({ error }, "Failed to initialize LaunchDarkly client")
      throw new ConfigurationError(
        `LaunchDarkly initialization failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Get prompt configuration from LaunchDarkly
   */
  private async getPromptFromLaunchDarkly(
    flagKey: string,
    context: PromptContext
  ): Promise<AIPromptConfig> {
    if (!this.ldClient || !this.config) {
      throw new ConfigurationError("LaunchDarkly client not initialized")
    }

    const ldUser: LaunchDarklyClient.LDUser = {
      key: `${context.repository.owner}/${context.repository.name}`,
      custom: {
        planId: context.planId,
        stepId: context.stepId,
        repository: context.repository.name,
        owner: context.repository.owner,
        environment: context.environment,
        ...(context.user?.login && { userLogin: context.user.login }),
        ...(context.user?.type && { userType: context.user.type }),
        ...context.metadata,
      },
    }

    try {
      const flagValue = await this.ldClient.variation(flagKey, ldUser, null)

      if (!flagValue) {
        logger.debug({ flagKey }, "No LaunchDarkly flag found, using default")
        return this.getDefaultPromptConfig()
      }

      // Parse the flag value as AI prompt config
      if (typeof flagValue === "string") {
        return JSON.parse(flagValue) as AIPromptConfig
      }
      if (typeof flagValue === "object") {
        return flagValue as AIPromptConfig
      }
      throw new Error(`Invalid flag value type: ${typeof flagValue}`)
    } catch (error) {
      logger.error({ error, flagKey }, "Failed to get prompt from LaunchDarkly")
      return this.getDefaultPromptConfig()
    }
  }

  /**
   * Get prompt configuration from local files
   */
  private async getPromptFromLocal(planId: string, stepId: string): Promise<AIPromptConfig> {
    if (!this.config) {
      throw new ConfigurationError("Config not available")
    }

    if (this.config.aiConfigs.localPromptsDir) {
      try {
        const fs = await import("node:fs/promises")
        const { join } = await import("node:path")

        const promptPath = join(this.config.aiConfigs.localPromptsDir, `${planId}-${stepId}.json`)
        const promptData = await fs.readFile(promptPath, "utf-8")
        return JSON.parse(promptData) as AIPromptConfig
      } catch (error) {
        logger.debug({ error, planId, stepId }, "Local prompt file not found, using default")
      }
    }

    return this.getDefaultPromptConfig()
  }

  /**
   * Get local prompts from files
   */
  private async getLocalPrompts(): Promise<Record<string, AIPromptConfig>> {
    if (!this.config?.aiConfigs.localPromptsDir) {
      return {}
    }

    try {
      const fs = await import("node:fs/promises")
      const { join } = await import("node:path")
      const { glob } = await import("glob")

      const pattern = join(this.config.aiConfigs.localPromptsDir, "*.json")
      const files = await glob(pattern)

      const prompts: Record<string, AIPromptConfig> = {}

      for (const file of files) {
        try {
          const content = await fs.readFile(file, "utf-8")
          const config = JSON.parse(content) as AIPromptConfig
          const fileName = file.split("/").pop()?.replace(".json", "") || "unknown"
          prompts[fileName] = config
        } catch (error) {
          logger.warn({ error, file }, "Failed to load local prompt file")
        }
      }

      return prompts
    } catch (error) {
      logger.error({ error }, "Failed to load local prompts")
      return {}
    }
  }

  /**
   * Build LaunchDarkly flag key
   */
  private buildFlagKey(planId: string, stepId: string): string {
    if (!this.config) {
      throw new ConfigurationError("Config not available")
    }

    const prefix = this.config.aiConfigs.flagKeyPrefix
    return `${prefix}${planId}_${stepId}`.replace(/[^a-zA-Z0-9_-]/g, "_")
  }

  /**
   * Get default prompt configuration
   */
  private getDefaultPromptConfig(): AIPromptConfig {
    return {
      template: `You are a helpful assistant for performing code migrations.

Plan: {{planId}}
Step: {{stepId}}
Repository: {{owner}}/{{repository}}

Please help with the following migration task. Be careful to only make the necessary changes and preserve existing functionality.`,
      version: "1.0.0",
      temperature: 0.1,
      model: "gpt-4",
      maxTokens: 4000,
    }
  }
}

/**
 * Factory function to get AI config manager instance
 */
export function createAIConfigManager(): AIConfigManager {
  return AIConfigManager.getInstance()
}

/**
 * Initialize AI configs from configuration
 */
export async function initializeAIConfigs(config: HachikoConfig): Promise<AIConfigManager> {
  const manager = createAIConfigManager()
  await manager.initialize(config)
  return manager
}
