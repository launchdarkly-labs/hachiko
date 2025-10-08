#!/usr/bin/env tsx

/**
 * Hachiko Feature Flag List Script
 *
 * This script lists all LaunchDarkly feature flags for the hachiko project.
 * It uses the LaunchDarkly Management API to fetch flags.
 *
 * Note: This is a CLI script, so console.log usage is intentional for user output.
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import yaml from "js-yaml"
import type { HachikoConfig } from "../config/schema.js"
import { validateHachikoConfig } from "../config/schema.js"

interface FlagInfo {
  key: string
  name: string
  description: string
  kind: string
  on: boolean
  variations: unknown[]
}

interface ManagementAPIResponse {
  items: FlagInfo[]
  totalCount: number
}

export async function loadConfig(): Promise<HachikoConfig> {
  const configPath = join(process.cwd(), ".hachiko.yml")
  const configContent = await readFile(configPath, "utf-8")
  const rawConfig = yaml.load(configContent)
  return validateHachikoConfig(rawConfig)
}

export async function fetchFlags(
  apiToken: string,
  projectKey: string,
  environment: string
): Promise<FlagInfo[]> {
  const baseUrl = "https://app.launchdarkly.com/api/v2"
  const url = `${baseUrl}/flags/${projectKey}?env=${environment}`

  const response = await fetch(url, {
    headers: {
      Authorization: apiToken,
      "Content-Type": "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch flags: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as ManagementAPIResponse
  return data.items
}

export function filterHachikoFlags(flags: FlagInfo[], prefix: string): FlagInfo[] {
  return flags.filter((flag) => flag.key.startsWith(prefix))
}

export function displayFlags(flags: FlagInfo[]): void {
  console.log("\n🐕 Hachiko Feature Flags\n")
  console.log(`Found ${flags.length} flag(s):\n`)

  if (flags.length === 0) {
    console.log("No flags found matching the configured prefix.")
    return
  }

  for (const flag of flags) {
    console.log(`  📍 ${flag.key}`)
    console.log(`     Name: ${flag.name}`)
    console.log(`     Description: ${flag.description || "N/A"}`)
    console.log(`     Kind: ${flag.kind}`)
    console.log(`     Enabled: ${flag.on ? "Yes" : "No"}`)
    console.log(`     Variations: ${flag.variations.length}`)
    console.log()
  }
}

async function main() {
  console.log("🐕 Hachiko - LaunchDarkly Feature Flags Listing Tool\n")

  try {
    // Load config
    const config = await loadConfig()
    console.log(`✅ Loaded configuration from .hachiko.yml`)
    console.log(`   Provider: ${config.aiConfigs.provider}`)
    console.log(`   Flag Prefix: ${config.aiConfigs.flagKeyPrefix}\n`)

    // Check if LaunchDarkly is configured
    if (config.aiConfigs.provider !== "launchdarkly") {
      console.error("❌ Error: LaunchDarkly is not configured as the AI configs provider")
      process.exit(1)
    }

    // Get API credentials from environment
    const apiToken = process.env.LAUNCHDARKLY_API_TOKEN
    const projectKey = process.env.LAUNCHDARKLY_PROJECT_KEY || "default"
    const environment = process.env.LAUNCHDARKLY_ENVIRONMENT || "production"

    if (!apiToken) {
      console.error("❌ Error: LAUNCHDARKLY_API_TOKEN environment variable is required")
      console.error(
        "\nPlease set your LaunchDarkly Management API token:\n  export LAUNCHDARKLY_API_TOKEN=your-token-here\n"
      )
      process.exit(1)
    }

    console.log(`📡 Fetching flags from LaunchDarkly...`)
    console.log(`   Project: ${projectKey}`)
    console.log(`   Environment: ${environment}`)

    // Fetch and filter flags
    const allFlags = await fetchFlags(apiToken, projectKey, environment)
    const hachikoFlags = filterHachikoFlags(allFlags, config.aiConfigs.flagKeyPrefix)

    // Display results
    displayFlags(hachikoFlags)

    // Output JSON format if requested
    if (process.argv.includes("--json")) {
      console.log("\n📋 JSON Output:\n")
      console.log(JSON.stringify(hachikoFlags, null, 2))
    }
  } catch (error) {
    console.error("\n❌ Error:", error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("❌ Fatal error:", error)
    process.exit(1)
  })
}
