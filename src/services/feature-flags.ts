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
      logger.info("Feature flag service initialized")
      this.initialized = true
    } catch (error) {
      logger.error({ error }, "Failed to initialize feature flag service")
      throw new ConfigurationError(
        `Feature flag service initialization failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  /**
   * Check if the test-flag is enabled
   * This is a simple feature flag check that wraps a noop operation
   */
  async isTestFlagEnabled(userId = "anonymous"): Promise<boolean> {
    if (!this.initialized) {
      throw new ConfigurationError("Feature flag service not initialized")
    }

    if (!this.ldClient) {
      logger.debug("LaunchDarkly client not available, test-flag returns false")
      return false
    }

    try {
      const user: LaunchDarklyClient.LDUser = {
        key: userId,
      }

      const flagValue = await this.ldClient.variation("test-flag", user, false)
      logger.debug({ flagValue, userId }, "test-flag evaluated")
      return flagValue as boolean
    } catch (error) {
      logger.error({ error, userId }, "Failed to evaluate test-flag")
      return false
    }
  }

  /**
   * Execute a noop operation wrapped by the test-flag
   * This demonstrates feature flag usage with a simple operation
   */
  async executeTestFlagOperation(userId = "anonymous"): Promise<void> {
    const isEnabled = await this.isTestFlagEnabled(userId)

    if (isEnabled) {
      logger.info({ userId }, "test-flag is enabled - executing operation")
      // This is the noop operation
      // In a real scenario, this would contain actual business logic
    } else {
      logger.info({ userId }, "test-flag is disabled - skipping operation")
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
export function createFeatureFlagService(): FeatureFlagService {
  return FeatureFlagService.getInstance()
}

/**
 * Initialize feature flags service
 */
export async function initializeFeatureFlags(): Promise<FeatureFlagService> {
  const service = createFeatureFlagService()
  await service.initialize()
  return service
}
