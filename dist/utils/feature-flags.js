import LaunchDarklyClient from "@launchdarkly/node-server-sdk";
import { createLogger } from "./logger.js";
const logger = createLogger("feature-flags");
let ldClient = null;
/**
 * Initialize the LaunchDarkly client for feature flags
 */
export async function initializeFeatureFlags() {
    const sdkKey = process.env.LAUNCHDARKLY_SDK_KEY;
    if (!sdkKey) {
        logger.warn("LAUNCHDARKLY_SDK_KEY not set, feature flags will be disabled");
        return;
    }
    try {
        ldClient = LaunchDarklyClient.init(sdkKey, {
            stream: true,
            offline: process.env.NODE_ENV === "test",
        });
        await ldClient.waitForInitialization({ timeout: 10 });
        logger.info("Feature flags client initialized");
    }
    catch (error) {
        logger.error({ error }, "Failed to initialize feature flags client");
        ldClient = null;
    }
}
/**
 * Check if the test-flag is enabled
 */
export async function isTestFlagEnabled(userKey = "anonymous") {
    if (!ldClient) {
        logger.debug("Feature flags client not initialized, returning false for test-flag");
        return false;
    }
    try {
        const user = {
            key: userKey,
        };
        const flagValue = await ldClient.variation("test-flag", user, false);
        return Boolean(flagValue);
    }
    catch (error) {
        logger.error({ error }, "Failed to check test-flag");
        return false;
    }
}
/**
 * Execute a noop operation if test-flag is enabled
 * This is a demonstration of feature flag usage
 */
export async function testFlagNoop(userKey = "anonymous") {
    const isEnabled = await isTestFlagEnabled(userKey);
    if (isEnabled) {
        // No-op: This is intentionally empty but demonstrates the flag is checked
        logger.debug("test-flag is enabled, noop executed");
    }
    else {
        logger.debug("test-flag is disabled, noop skipped");
    }
}
/**
 * Close the feature flags client
 */
export async function closeFeatureFlags() {
    if (ldClient) {
        await ldClient.close();
        ldClient = null;
        logger.info("Feature flags client closed");
    }
}
//# sourceMappingURL=feature-flags.js.map