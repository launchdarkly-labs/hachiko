import LaunchDarklyClient from "@launchdarkly/node-server-sdk"
import { ConfigurationError } from "../utils/errors.js"
import { createLogger } from "../utils/logger.js"

const logger = createLogger("feature-flags")

/**
 * Feature flag service for managing LaunchDarkly feature flags
 */
export class FeatureFlagService {
  private static instance: FeatureFlagService | null = null
  private ldClient: LaunchDarklyClient.LDClient | null = null
  private initialized = false

  private constructor() {}

  static getInstance(): FeatureFlagService {
    if (!FeatureFlagService.instance) {
      FeatureFlagService.instance = new FeatureFlagService()
    }
    return FeatureFlagService.instance
  }

  /**
   * Initialize the feature flag service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    const sdkKey = process.env.LAUNCHDARKLY_SDK_KEY
    if (!sdkKey) {
      logger.warn("LAUNCHDARKLY_SDK_KEY not found, feature flags will be disabled")
      this.initialized = true
      return
    }

    try {
      this.ldClient = LaunchDarklyClient.init(sdkKey, {
        stream: true,
        offline: process.env.NODE_ENV === "test",
      })

      await this.ldClient.waitForInitialization({ timeout: 10 })
      this.initialized = true
      logger.info("LaunchDarkly feature flag service initialized")
    } catch (error) {
      logger.error({ error }, "Failed to initialize LaunchDarkly client")
      throw new ConfigurationError(
        `LaunchDarkly initialization failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Get a boolean feature flag value
   */
  async getBooleanFlag(
    flagKey: string,
    context: LaunchDarklyClient.LDContext,
    defaultValue = false
  ): Promise<boolean> {
    if (!this.initialized) {
      logger.warn({ flagKey }, "Feature flag service not initialized, returning default value")
      return defaultValue
    }

    if (!this.ldClient) {
      logger.debug({ flagKey }, "LaunchDarkly client not available, returning default value")
      return defaultValue
    }

    try {
      const value = await this.ldClient.variation(flagKey, context, defaultValue)
      logger.debug({ flagKey, value }, "Feature flag evaluated")
      return value
    } catch (error) {
      logger.error({ error, flagKey }, "Failed to evaluate feature flag")
      return defaultValue
    }
  }

  /**
   * Execute a function only if the test flag is enabled
   */
  async executeIfTestFlagEnabled(
    context: LaunchDarklyClient.LDContext,
    fn: () => void | Promise<void>
  ): Promise<void> {
    const isEnabled = await this.getBooleanFlag("test-flag", context, false)

    if (isEnabled) {
      logger.info("test-flag is enabled, executing function")
      await fn()
    } else {
      logger.debug("test-flag is disabled, skipping execution")
    }
  }

  /**
   * Close the feature flag service
   */
  async close(): Promise<void> {
    if (this.ldClient) {
      await this.ldClient.close()
      this.ldClient = null
    }
    this.initialized = false
    logger.info("Feature flag service closed")
  }
}

/**
 * Factory function to get feature flag service instance
 */
export function getFeatureFlagService(): FeatureFlagService {
  return FeatureFlagService.getInstance()
}

/**
 * Initialize feature flags
 */
export async function initializeFeatureFlags(): Promise<FeatureFlagService> {
  const service = getFeatureFlagService()
  await service.initialize()
  return service
}
