# Hachiko Scripts

This directory contains utility scripts for managing and operating Hachiko.

## Available Scripts

### `hachiko-list-flags.ts`

Lists all LaunchDarkly feature flags for the hachiko project.

**Usage:**

```bash
# Set your LaunchDarkly Management API token
export LAUNCHDARKLY_API_TOKEN=your-api-token-here

# Optionally set project and environment (defaults: "default" and "production")
export LAUNCHDARKLY_PROJECT_KEY=your-project-key
export LAUNCHDARKLY_ENVIRONMENT=production

# Run the script
pnpm scripts:list-flags

# Get JSON output
pnpm scripts:list-flags -- --json
```

**Requirements:**

- LaunchDarkly Management API token (not the SDK key)
- `.hachiko.yml` configuration file in the project root

**Output:**

The script will display all feature flags that match the configured prefix (`hachiko_prompts_` by default), showing:
- Flag key
- Flag name
- Description
- Kind (boolean, multivariate, etc.)
- Enabled status
- Number of variations

### `hachiko-invoke.ts`

Invokes a coding agent for a migration step.

**Usage:**

This script is typically called by GitHub Actions during migration execution.

### `hachiko-open-pr.ts`

Opens a pull request for a migration step.

**Usage:**

This script is typically called by GitHub Actions after agent execution.

### `hachiko-report.ts`

Reports the status of a migration step.

**Usage:**

This script is typically called by GitHub Actions to update migration state.

## Development

All scripts are written in TypeScript and can be executed using `tsx` or built and run as JavaScript.

To add a new script:

1. Create a new `.ts` file in this directory
2. Add a shebang: `#!/usr/bin/env tsx`
3. Add the script to `package.json` scripts section
4. Update this README with usage instructions
