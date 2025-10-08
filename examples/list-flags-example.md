# Example: Listing LaunchDarkly Feature Flags

This example demonstrates how to list all LaunchDarkly feature flags for the Hachiko project.

## Prerequisites

1. A LaunchDarkly Management API token
2. LaunchDarkly configured in `.hachiko.yml`

## Usage

### Basic Usage

```bash
# Set your LaunchDarkly Management API token
export LAUNCHDARKLY_API_TOKEN=api-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# List all flags
pnpm scripts:list-flags
```

### Example Output

```
🐕 Hachiko - LaunchDarkly Feature Flags Listing Tool

✅ Loaded configuration from .hachiko.yml
   Provider: launchdarkly
   Flag Prefix: hachiko_prompts_

📡 Fetching flags from LaunchDarkly...
   Project: default
   Environment: production

🐕 Hachiko Feature Flags

Found 3 flag(s):

  📍 hachiko_prompts_react_hooks_step1
     Name: React Hooks Migration - Step 1
     Description: Prompt configuration for converting class components to hooks
     Kind: json
     Enabled: Yes
     Variations: 2

  📍 hachiko_prompts_react_hooks_step2
     Name: React Hooks Migration - Step 2
     Description: Prompt configuration for refactoring state management
     Kind: json
     Enabled: Yes
     Variations: 2

  📍 hachiko_prompts_typescript_upgrade_step1
     Name: TypeScript Upgrade - Step 1
     Description: Prompt configuration for updating TypeScript version
     Kind: json
     Enabled: No
     Variations: 1
```

### JSON Output

To get machine-readable JSON output:

```bash
pnpm scripts:list-flags -- --json
```

### Specifying Project and Environment

```bash
export LAUNCHDARKLY_PROJECT_KEY=my-project
export LAUNCHDARKLY_ENVIRONMENT=staging

pnpm scripts:list-flags
```

## Configuration

The script uses the `.hachiko.yml` configuration to:
- Determine if LaunchDarkly is enabled (`aiConfigs.provider`)
- Get the flag key prefix to filter by (`aiConfigs.flagKeyPrefix`)

Example `.hachiko.yml` configuration:

```yaml
aiConfigs:
  provider: launchdarkly
  flagKeyPrefix: hachiko_prompts_
```

## Flag Key Format

Hachiko feature flags follow this naming convention:

```
{flagKeyPrefix}{planId}_{stepId}
```

For example:
- `hachiko_prompts_react_hooks_step1`
- `hachiko_prompts_react_hooks_step2`
- `hachiko_prompts_typescript_upgrade_step1`

The script automatically filters flags to only show those matching the configured prefix.

## Getting a LaunchDarkly API Token

1. Log in to your LaunchDarkly account
2. Go to **Account settings** > **Authorization**
3. Create a new API access token with `reader` role
4. Copy the token and set it as `LAUNCHDARKLY_API_TOKEN`

## Troubleshooting

### Error: LAUNCHDARKLY_API_TOKEN not set

```
❌ Error: LAUNCHDARKLY_API_TOKEN environment variable is required
```

Solution: Set the environment variable:
```bash
export LAUNCHDARKLY_API_TOKEN=your-token-here
```

### Error: Failed to fetch flags

```
❌ Error: Failed to fetch flags: 401 Unauthorized
```

Solution: Verify your API token is valid and has the correct permissions.

### No flags found

If you see "No flags found matching the configured prefix", it means:
- No feature flags exist with the configured prefix in LaunchDarkly, or
- The project/environment combination doesn't have any matching flags

This is normal if you haven't created any flags yet.
