import type LaunchDarklyClient from "@launchdarkly/node-server-sdk"
import { getFeatureFlagService } from "../services/feature-flags.js"
import { createLogger } from "./logger.js"

const logger = createLogger("test-flag")

/**
 * Example function that demonstrates using the test-flag feature flag
 * This is a simple noop operation that only executes when the flag is enabled
 */
export async function testFlagExample(context: LaunchDarklyClient.LDContext): Promise<void> {
  const flagService = getFeatureFlagService()

  await flagService.executeIfTestFlagEnabled(context, async () => {
    // This is a no-op function that logs when the test flag is enabled
    logger.info({ context }, "Test flag is enabled - executing example noop operation")
  })
}

/**
 * Check if the test flag is enabled for a given context
 */
export async function isTestFlagEnabled(context: LaunchDarklyClient.LDContext): Promise<boolean> {
  const flagService = getFeatureFlagService()
  return flagService.getBooleanFlag("test-flag", context, false)
}
