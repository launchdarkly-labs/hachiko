import type LaunchDarklyClient from "@launchdarkly/node-server-sdk";
/**
 * Example function that demonstrates using the test-flag feature flag
 * This is a simple noop operation that only executes when the flag is enabled
 */
export declare function testFlagExample(context: LaunchDarklyClient.LDContext): Promise<void>;
/**
 * Check if the test flag is enabled for a given context
 */
export declare function isTestFlagEnabled(context: LaunchDarklyClient.LDContext): Promise<boolean>;
//# sourceMappingURL=test-flag.d.ts.map