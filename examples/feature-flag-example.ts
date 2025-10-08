#!/usr/bin/env node
/**
 * Example usage of the FeatureFlagService with test-flag
 *
 * This example demonstrates:
 * - Initializing the feature flag service
 * - Checking the test-flag for different users
 * - Executing operations controlled by the flag
 *
 * To run this example:
 * 1. Set LAUNCHDARKLY_SDK_KEY environment variable
 * 2. Ensure test-flag exists in LaunchDarkly hachiko project
 * 3. Run: tsx examples/feature-flag-example.ts
 */

import { initializeFeatureFlags } from "../src/services/feature-flags.js"

async function main() {
  console.log("🚀 Feature Flag Service Example\n")

  // Initialize the service
  console.log("Initializing feature flag service...")
  const service = await initializeFeatureFlags()
  console.log("✓ Service initialized\n")

  // Test different users
  const users = ["alice", "bob", "anonymous"]

  for (const user of users) {
    console.log(`Checking test-flag for user: ${user}`)
    const isEnabled = await service.isTestFlagEnabled(user)
    console.log(`  → test-flag is ${isEnabled ? "ENABLED" : "DISABLED"}\n`)

    // Execute the operation
    console.log(`Executing test-flag operation for: ${user}`)
    await service.executeTestFlagOperation(user)
    console.log()
  }

  // Cleanup
  console.log("Closing feature flag service...")
  await service.close()
  console.log("✓ Service closed")
}

// Run the example
main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})
