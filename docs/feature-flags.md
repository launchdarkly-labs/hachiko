# Feature Flags Service

This service provides integration with LaunchDarkly for feature flag management in Hachiko.

## Overview

The `FeatureFlagService` is a singleton service that manages LaunchDarkly feature flags, starting with the `test-flag` which demonstrates the basic feature flag pattern.

## Usage

### Initialization

```typescript
import { initializeFeatureFlags } from "./services/feature-flags.js"

// Initialize the service
const featureFlagService = await initializeFeatureFlags()
```

### Checking the test-flag

The `test-flag` is a boolean feature flag that can be used to control feature availability:

```typescript
// Check if test-flag is enabled for a user
const isEnabled = await featureFlagService.isTestFlagEnabled("user123")

if (isEnabled) {
  // Feature is enabled
  console.log("test-flag is enabled")
} else {
  // Feature is disabled
  console.log("test-flag is disabled")
}
```

### Executing Operations with Feature Flags

The service provides a convenience method that wraps operations with the flag check:

```typescript
// Execute an operation that's controlled by test-flag
await featureFlagService.executeTestFlagOperation("user123")
```

This will:
- Check if the `test-flag` is enabled for the user
- Execute the operation if enabled
- Skip the operation if disabled
- Log the result

## Configuration

The service requires the `LAUNCHDARKLY_SDK_KEY` environment variable to be set. If not set, the service will initialize in a disabled state where all flags return `false`.

### Environment Variables

- `LAUNCHDARKLY_SDK_KEY`: The LaunchDarkly SDK key for authentication
- `NODE_ENV`: When set to `test`, the LaunchDarkly client runs in offline mode

## LaunchDarkly Flag Configuration

The `test-flag` should be configured in LaunchDarkly with:
- **Project**: `hachiko`
- **Flag Key**: `test-flag`
- **Flag Type**: Boolean
- **Default Value**: `false`

## Testing

The service includes comprehensive unit tests that mock the LaunchDarkly SDK. Tests cover:
- Initialization with and without SDK key
- Flag evaluation with different user contexts
- Error handling
- Service lifecycle (close)

Run tests with:

```bash
pnpm test test/unit/services/feature-flags.test.ts
```

## Architecture Notes

- The service uses the singleton pattern to ensure only one LaunchDarkly client is created
- The service handles missing SDK keys gracefully by returning `false` for all flags
- All flag operations are logged for debugging and auditing
- The service supports clean shutdown via the `close()` method

## Future Enhancements

This initial implementation with `test-flag` demonstrates the pattern. Future enhancements may include:
- Additional feature flags for other Hachiko features
- Flag variation support for multi-variant flags
- Flag metrics and analytics
- Integration with the existing AI config management system
