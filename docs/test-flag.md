# Test Flag Integration

This document demonstrates the integration of the `test-flag` feature flag from LaunchDarkly into the Hachiko codebase.

## Flag Information

- **Flag Key**: `test-flag`
- **Project**: `hachiko`
- **Type**: Boolean
- **Environments**: `test`, `production`

## Implementation

The test flag integration consists of two main components:

### 1. FeatureFlagService (`src/services/feature-flags.ts`)

A singleton service that manages LaunchDarkly feature flags:

```typescript
import { getFeatureFlagService } from './services/feature-flags.js'

// Initialize the service
const flagService = getFeatureFlagService()
await flagService.initialize()

// Get a boolean flag value
const isEnabled = await flagService.getBooleanFlag(
  'test-flag',
  { kind: 'user', key: 'user-123' },
  false // default value
)

// Execute code conditionally based on test-flag
await flagService.executeIfTestFlagEnabled(
  { kind: 'user', key: 'user-123' },
  async () => {
    console.log('Test flag is enabled!')
  }
)
```

### 2. Test Flag Utilities (`src/utils/test-flag.ts`)

Helper functions specifically for the test-flag:

```typescript
import { isTestFlagEnabled, testFlagExample } from './utils/test-flag.js'

// Check if test flag is enabled
const enabled = await isTestFlagEnabled({
  kind: 'user',
  key: 'user-123'
})

// Run the example noop operation (only executes when flag is enabled)
await testFlagExample({
  kind: 'user',
  key: 'user-123'
})
```

## Usage Example

Here's a complete example of using the test flag in a webhook handler:

```typescript
import { getFeatureFlagService } from '../services/feature-flags.js'

export async function handlePush(context: Context, logger: Logger) {
  const flagService = getFeatureFlagService()
  
  const ldContext = {
    kind: 'repository',
    key: context.payload.repository.full_name
  }
  
  // Check if test flag is enabled for this repository
  const isTestMode = await flagService.getBooleanFlag('test-flag', ldContext, false)
  
  if (isTestMode) {
    logger.info('Test flag enabled - running in test mode')
    // Execute test-specific logic
  }
  
  // Continue with normal logic
  // ...
}
```

## Environment Setup

The service requires the `LAUNCHDARKLY_SDK_KEY` environment variable to be set:

```bash
export LAUNCHDARKLY_SDK_KEY=your-sdk-key
```

In test mode, the client will run in offline mode automatically.

## Testing

Comprehensive tests are provided in:
- `test/unit/services/feature-flags.test.ts` - 12 tests for the FeatureFlagService
- `test/unit/utils/test-flag.test.ts` - 6 tests for test-flag utilities

Run tests with:
```bash
pnpm test
```

## Architecture Notes

- The `FeatureFlagService` uses a singleton pattern to ensure a single LaunchDarkly client instance
- The service gracefully handles missing SDK keys and initialization failures
- All flag evaluations include proper error handling and default values
- The test flag utilities provide a simple wrapper for the most common use case (noop with conditional execution)
