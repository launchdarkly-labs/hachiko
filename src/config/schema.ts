import { z } from "zod"

// Agent configuration schemas
export const AgentCliConfigSchema = z.object({
  kind: z.literal("cli"),
  command: z.string(),
  args: z.array(z.string()).default([]),
  timeout: z.number().optional(),
})

export const AgentApiConfigSchema = z.object({
  kind: z.literal("api"),
  endpoint: z.string(),
  auth: z
    .object({
      type: z.enum(["bearer", "basic", "apikey"]),
      token: z.string(),
    })
    .optional(),
  timeout: z.number().optional(),
})

export const AgentConfigSchema = z.union([AgentCliConfigSchema, AgentApiConfigSchema])

// Policy configuration schema
export const PolicyConfigSchema = z.object({
  allowWorkflowEdits: z.boolean().default(false),
  network: z.enum(["none", "restricted", "unrestricted"]).default("none"),
  maxAttemptsPerStep: z.number().min(1).max(5).default(2),
  stepTimeoutMinutes: z.number().min(1).max(180).default(15),
  perRepoMaxConcurrentMigrations: z.number().min(1).max(10).default(3),
  riskyGlobs: z.array(z.string()).default([".github/workflows/**", ".git/**", "**/*.sh"]),
  allowlistGlobs: z
    .array(z.string())
    .default(["src/**", "services/**", "packages/**", "modules/**"]),
})

// Rebase strategy configuration
export const RebaseConfigSchema = z.object({
  when: z.enum(["always", "behind-base-branch", "never"]).default("behind-base-branch"),
  allowManual: z.boolean().default(true),
})

// AI Configs configuration schema
export const AiConfigsSchema = z.object({
  provider: z.enum(["launchdarkly", "local"]).default("launchdarkly"),
  flagKeyPrefix: z.string().default("hachiko_prompts_"),
  localPromptsDir: z.string().optional(),
})

// Migration strategy configuration
export const StrategyConfigSchema = z.object({
  chunkBy: z.enum(["module", "package", "fileset", "custom"]).default("module"),
  maxOpenPRs: z.number().min(1).max(10).default(1),
})

// Plans configuration schema
export const PlansConfigSchema = z.object({
  directory: z.string().default("migrations/"),
  filenamePattern: z.string().default("*.md"),
})

// Dependencies configuration
export const DependenciesConfigSchema = z.object({
  conflictResolution: z.enum(["fail", "merge", "override"]).default("fail"),
  updateStrategy: z.enum(["manual", "auto"]).default("manual"),
})

// Main Hachiko configuration schema
export const HachikoConfigSchema = z.object({
  plans: PlansConfigSchema.default({}),
  defaults: z
    .object({
      agent: z.string().default("claude-cli"),
      prParallelism: z.number().min(1).max(5).default(1),
      rebase: RebaseConfigSchema.default({}),
      labels: z.array(z.string()).default(["hachiko", "migration"]),
      requirePlanReview: z.boolean().default(true),
    })
    .default({}),
  aiConfigs: AiConfigsSchema.default({}),
  policy: PolicyConfigSchema.default({}),
  dependencies: DependenciesConfigSchema.default({}),
  agents: z.record(z.string(), AgentConfigSchema).default({
    "claude-cli": {
      kind: "cli",
      command: "claude",
      args: ["code", "--apply"],
    },
    "cursor-cli": {
      kind: "cli",
      command: "cursor",
      args: ["--headless", "apply"],
    },
  }),
})

export type HachikoConfig = z.infer<typeof HachikoConfigSchema>
export type AgentConfig = z.infer<typeof AgentConfigSchema>
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>
export type StrategyConfig = z.infer<typeof StrategyConfigSchema>

// Migration plan frontmatter schema
export const MigrationStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  expectedPR: z.boolean().default(true),
  agent: z.string().optional(),
  timeout: z.number().optional(),
})

export const MigrationChecksSchema = z.array(z.string()).default([])

export const MigrationRollbackSchema = z
  .array(
    z.object({
      description: z.string(),
      command: z.string().optional(),
    })
  )
  .default([])

export const MigrationStatusSchema = z
  .enum([
    "draft",
    "plan-approved",
    "queued",
    "running",
    "awaiting-review",
    "paused",
    "failed",
    "done",
    "cancelled",
    "skipped",
  ])
  .default("draft")

export const MigrationFrontmatterSchema = z.object({
  id: z.string(),
  title: z.string(),
  owner: z.string(),
  status: MigrationStatusSchema,
  agent: z.string().optional(),
  strategy: StrategyConfigSchema.default({}),
  checks: MigrationChecksSchema,
  rollback: MigrationRollbackSchema,
  successCriteria: z.array(z.string()).default([]),
  steps: z.array(MigrationStepSchema).default([]),
  dependsOn: z.array(z.string()).default([]),
  touches: z.array(z.string()).default([]),
  attempts: z.number().default(0),
  lastError: z.string().optional(),
  currentStep: z.string().optional(),
})

export type MigrationFrontmatter = z.infer<typeof MigrationFrontmatterSchema>
export type MigrationStep = z.infer<typeof MigrationStepSchema>
export type MigrationStatus = z.infer<typeof MigrationStatusSchema>

// Validation utilities
export function validateHachikoConfig(config: unknown): HachikoConfig {
  return HachikoConfigSchema.parse(config)
}

export function validateMigrationFrontmatter(frontmatter: unknown): MigrationFrontmatter {
  return MigrationFrontmatterSchema.parse(frontmatter)
}

// Configuration merge utility
export function mergeConfigs(base: HachikoConfig, override: Partial<HachikoConfig>): HachikoConfig {
  return HachikoConfigSchema.parse({
    ...base,
    ...override,
    defaults: { ...base.defaults, ...override.defaults },
    policy: { ...base.policy, ...override.policy },
    aiConfigs: { ...base.aiConfigs, ...override.aiConfigs },
    dependencies: { ...base.dependencies, ...override.dependencies },
    plans: { ...base.plans, ...override.plans },
    agents: { ...base.agents, ...override.agents },
  })
}
