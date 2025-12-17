# Local Development Guide

This guide walks you through setting up Hachiko for local development and testing, including webhook simulation to test migration functionality end-to-end.

## Prerequisites

- **Node.js 22+**
- **pnpm 9+**
- **GitHub CLI** (`gh`) - for API interactions
- **ngrok** or **smee.io** - for webhook proxying (optional)

## Quick Start

### 1. Install Dependencies

```bash
git clone https://github.com/launchdarkly/hachiko.git
cd hachiko
pnpm install
```

### 2. Build the Application

```bash
pnpm build
```

### 3. Set Up Environment

Create a `.env` file in the root directory:

```bash
# GitHub App Configuration (for local development)
APP_ID=your_app_id
PRIVATE_KEY_PATH=./private-key.pem
WEBHOOK_SECRET=your_webhook_secret
GITHUB_TOKEN=your_personal_access_token

# Webhook Proxy (optional - for receiving real webhooks)
WEBHOOK_PROXY_URL=https://smee.io/your-webhook-channel

# LaunchDarkly (optional - for AI config features)
LAUNCHDARKLY_SDK_KEY=your_ld_sdk_key
```

### 4. Run Locally

```bash
# Option A: Basic local development
pnpm dev

# Option B: With webhook proxy (receives real GitHub webhooks)
pnpm dev:probot:test
```

## Testing Migration Functionality

Since Hachiko responds to GitHub webhooks, you need to simulate webhook events to test migration detection and processing.

### Option 1: Manual Webhook Simulation (Recommended)

Create a test script to simulate the push webhook that should have been sent when migration plans were merged:

```bash
# Create test webhook script
cat > test-webhook.js << 'EOF'
import { handlePush } from './dist/webhooks/push.js';
import { createLogger } from './dist/utils/logger.js';

// Mock context that simulates a push to main with migration files
const mockContext = {
  id: 'test-123',
  payload: {
    repository: {
      name: 'hachiko',
      full_name: 'launchdarkly-labs/hachiko',
      owner: { login: 'launchdarkly-labs' },
      default_branch: 'main'
    },
    ref: 'refs/heads/main',
    commits: [{
      added: ['migrations/self-test-react-hooks.md'],
      modified: [],
      removed: []
    }],
    head_commit: { id: 'abc123' },
    pusher: { name: 'test-user' }
  },
  octokit: {
    repos: {
      getContent: async ({ path }) => {
        if (path === '.hachiko.yml') {
          return {
            data: {
              type: 'file',
              content: Buffer.from(`
plans:
  directory: migrations/
  filenamePattern: "*.md"
defaults:
  agent: claude-cli
  requirePlanReview: true
`).toString('base64')
            }
          };
        }
        if (path.startsWith('migrations/')) {
          const fs = await import('fs');
          const content = fs.readFileSync(path, 'utf8');
          return {
            data: {
              type: 'file',
              content: Buffer.from(content).toString('base64')
            }
          };
        }
        throw new Error('File not found');
      }
    },
    issues: {
      create: async (params) => {
        console.log('📝 Would create issue:', params.title);
        return { data: { number: 1, html_url: 'https://github.com/test/issues/1' } };
      },
      listForRepo: async () => ({ data: [] })
    }
  }
};

const logger = createLogger('test');

// Test the push handler
try {
  await handlePush(mockContext, logger);
  console.log('✅ Webhook simulation completed');
} catch (error) {
  console.error('❌ Webhook simulation failed:', error);
}
EOF

# Run the simulation
node test-webhook.js
```

### Option 2: Using Webhook Proxy (Real Webhooks)

For testing with real GitHub webhooks:

1. **Set up webhook proxy:**

   ```bash
   # Install smee-client globally
   npm install -g smee-client

   # Start webhook proxy (get URL from https://smee.io)
   smee --url https://smee.io/your-unique-url --target http://localhost:3000/webhooks
   ```

2. **Configure GitHub App:**
   - Create a GitHub App at `https://github.com/settings/apps/new`
   - Set webhook URL to your smee.io URL
   - Enable permissions: Issues (write), Pull requests (write), Repository contents (read)
   - Install the app on your test repository

3. **Run with webhook proxy:**
   ```bash
   WEBHOOK_PROXY_URL=https://smee.io/your-unique-url pnpm dev:probot:test
   ```

### Option 3: Direct Function Testing

Test specific Hachiko functions directly:

```bash
# Test migration plan parsing
node -e "
import('./dist/services/plans.js').then(async ({ parsePlanFile }) => {
  const result = await parsePlanFile('./migrations/self-test-react-hooks.md');
  console.log('Plan parsing result:', result);
});
"

# Test configuration loading
node -e "
import('./dist/services/config.js').then(async ({ loadHachikoConfig }) => {
  // Mock context with repo info
  const mockContext = {
    payload: { repository: { owner: { login: 'test' }, name: 'test' } },
    octokit: { repos: { getContent: async () => ({
      data: { type: 'file', content: Buffer.from('plans:\\n  directory: migrations/').toString('base64') }
    })}}
  };
  const config = await loadHachikoConfig(mockContext);
  console.log('Loaded config:', config);
});
"
```

## Debugging Tips

### Check Webhook Logs

```bash
# Run with debug logging
DEBUG=probot:* pnpm dev
```

### Verify File Detection

```bash
# Test if migration files are detected
node -e "
import { extractChangedFiles } from './dist/utils/git.js';
const commits = [{ added: ['migrations/self-test-react-hooks.md'], modified: [], removed: [] }];
console.log('Changed files:', extractChangedFiles(commits));
"
```

### Test Plan Validation

```bash
# Validate your migration plan files
node -e "
import('./dist/services/plans.js').then(async ({ parsePlanFile }) => {
  try {
    const result = await parsePlanFile('./migrations/self-test-react-hooks.md');
    if (result.isValid) {
      console.log('✅ Plan is valid:', result.plan.title);
    } else {
      console.log('❌ Plan validation errors:', result.errors);
    }
  } catch (error) {
    console.error('Parse error:', error.message);
  }
});
"
```

## Expected Test Flow

When testing locally, you should see this flow:

1. **Webhook Received**: Push event with migration files detected
2. **Config Loaded**: `.hachiko.yml` parsed successfully
3. **Plans Detected**: Migration plans found in `migrations/` directory
4. **Plan Parsed**: YAML frontmatter and content validated
5. **Issues Created**: Migration Issue created in repository
6. **PR Created**: Plan Review PR created (if `requirePlanReview: true`)

## Common Issues

### "No migration plans changed in this push"

- Verify files are in the correct directory (`migrations/` by default)
- Check that files end with `.md`
- Ensure the push is to the default branch (`main`)

### "Failed to load .hachiko.yml"

- Verify `.hachiko.yml` exists in repository root
- Check YAML syntax is valid
- Ensure required fields are present

### "Plan validation failed"

- Check YAML frontmatter syntax in migration plan
- Verify required fields: `id`, `title`, `steps`
- Validate step structure and IDs

### GitHub API Errors

- Verify `GITHUB_TOKEN` has correct permissions
- Check repository access and API rate limits
- Ensure GitHub App has required permissions (if using app auth)

## Production Deployment

For production deployment, see:

- [Deployment Guide](./deployment.md) (TODO)
- [GitHub App Setup](./github-app-setup.md) (TODO)

## Self-Testing Environment

The repository includes a self-testing environment with:

- **3 React class components** in `self-test/src/components/`
- **Multi-step migration plan** in `migrations/self-test-react-hooks.md`
- **Intentionally unoptimized plan** in `migrations/unoptimized-test-plan.md`

This environment is perfect for testing the full migration workflow locally.
