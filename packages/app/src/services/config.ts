import yaml from "js-yaml"
import { type HachikoConfig, HachikoConfigSchema, validateHachikoConfig } from "../config/schema.js"
import type { ContextWithRepository } from "../types/context.js"
import { ConfigurationError } from "../utils/errors.js"
import { createLogger } from "../utils/logger.js"

const logger = createLogger("config")

const DEFAULT_CONFIG_PATH = ".hachiko.yml"

/**
 * Load and validate Hachiko configuration from repository
 */
export async function loadHachikoConfig(context: ContextWithRepository): Promise<HachikoConfig> {
  try {
    // Try to get the config file from the repository
    const configFile = await context.octokit.repos.getContent({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      path: DEFAULT_CONFIG_PATH,
    })

    if (Array.isArray(configFile.data) || configFile.data.type !== "file") {
      throw new ConfigurationError(`${DEFAULT_CONFIG_PATH} is not a file`)
    }

    // Decode base64 content
    const content = Buffer.from(configFile.data.content, "base64").toString("utf-8")

    // Parse YAML
    const rawConfig = yaml.load(content) as unknown

    // Validate and apply defaults
    const config = validateHachikoConfig(rawConfig)

    logger.info(
      {
        configPath: DEFAULT_CONFIG_PATH,
        planDirectory: config.plans.directory,
        agents: Object.keys(config.agents),
      },
      "Loaded Hachiko configuration"
    )

    return config
  } catch (error) {
    if (error instanceof ConfigurationError) {
      throw error
    }

    // If config file doesn't exist, use defaults
    if (error && typeof error === "object" && "status" in error && error.status === 404) {
      logger.info("No .hachiko.yml found, using default configuration")
      return HachikoConfigSchema.parse({})
    }

    logger.error({ error }, "Failed to load Hachiko configuration")
    throw new ConfigurationError(
      `Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`,
      { configPath: DEFAULT_CONFIG_PATH }
    )
  }
}

/**
 * Validate a configuration object without loading from repository
 */
export function validateConfig(rawConfig: unknown): HachikoConfig {
  try {
    return validateHachikoConfig(rawConfig)
  } catch (error) {
    throw new ConfigurationError(
      `Invalid configuration: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
