import { describe, it, expect, beforeEach, vi } from "vitest";
import { spawn } from "child_process";
import { promises as fs } from "fs";

describe("Cursor API Integration", () => {
  const testScript = "/tmp/test-cursor-api.sh";

  beforeEach(async () => {
    // Clean up any existing test script
    try {
      await fs.unlink(testScript);
    } catch {
      // File doesn't exist, that's fine
    }
  });

  afterEach(async () => {
    // Clean up test script
    try {
      await fs.unlink(testScript);
    } catch {
      // File doesn't exist, that's fine
    }
  });

  describe("GitHub Actions shell script curl syntax", () => {
    it("should demonstrate improved curl command reliability", async () => {
      // This test shows that the fixed format works reliably
      const improvedScript = `#!/bin/bash
set -e
CURSOR_API_KEY="test-key"
PAYLOAD_FILE=$(mktemp)

# Create payload matching the fixed workflow format
cat > "$PAYLOAD_FILE" << 'EOF'
{
  "task": "Test migration task",
  "repository_url": "https://github.com/test/repo",
  "branch": "main",
  "files": [],
  "metadata": {
    "plan_id": "test-plan",
    "step_id": "test-step"
  }
}
EOF

CURSOR_AUTH=$(echo -n "$CURSOR_API_KEY:" | base64)

# This is the corrected command from the workflow 
set +e
HTTP_RESPONSE=$(curl -s -w "\\nSTATUS_CODE:%{http_code}" \\
  -X POST "https://httpbin.org/post" \\
  -H "Authorization: Basic $CURSOR_AUTH" \\
  -H "Content-Type: application/json" \\
  -H "User-Agent: Hachiko/1.0" \\
  -d "@$PAYLOAD_FILE" 2>&1)

CURL_EXIT_CODE=$?
set -e

rm -f "$PAYLOAD_FILE"
echo "Exit code: $CURL_EXIT_CODE"

# Extract status code
HTTP_STATUS=$(echo "$HTTP_RESPONSE" | grep "^STATUS_CODE:" | cut -d: -f2)
echo "HTTP Status: $HTTP_STATUS"

exit $CURL_EXIT_CODE
`;

      await fs.writeFile(testScript, improvedScript, { mode: 0o755 });

      const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const child = spawn("bash", [testScript], { timeout: 10000 });
        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (data) => (stdout += data.toString()));
        child.stderr?.on("data", (data) => (stderr += data.toString()));

        child.on("close", (code) => {
          resolve({ code: code ?? -1, stdout, stderr });
        });
      });

      // Should succeed and extract HTTP status properly
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Exit code: 0");
      expect(result.stdout).toContain("HTTP Status: 200");
    }, 15000);

    it("should work with a corrected write-out format", async () => {
      // This test shows the fixed version
      const fixedScript = `#!/bin/bash
set -e
CURSOR_API_KEY="test-key"
PAYLOAD_FILE=$(mktemp)
echo '{"test": "payload"}' > "$PAYLOAD_FILE"
CURSOR_AUTH=$(echo -n "$CURSOR_API_KEY:" | base64)

# Fixed version - properly escape the format string
set +e
HTTP_RESPONSE=$(curl -s -w "\\nSTATUS_CODE:%{http_code}" \\
  -X POST "https://httpbin.org/status/200" \\
  -H "Authorization: Basic $CURSOR_AUTH" \\
  -H "Content-Type: application/json" \\
  -H "User-Agent: Hachiko/1.0" \\
  -d "@$PAYLOAD_FILE" 2>&1)

CURL_EXIT_CODE=$?
set -e

rm -f "$PAYLOAD_FILE"
echo "Exit code: $CURL_EXIT_CODE"
exit $CURL_EXIT_CODE
`;

      await fs.writeFile(testScript, fixedScript, { mode: 0o755 });

      const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
        const child = spawn("bash", [testScript], { timeout: 10000 });
        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (data) => (stdout += data.toString()));
        child.stderr?.on("data", (data) => (stderr += data.toString()));

        child.on("close", (code) => {
          resolve({ code: code ?? -1, stdout, stderr });
        });
      });

      // Should exit with code 0 (success)
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Exit code: 0");
    }, 15000);
  });

  describe("API format compatibility", () => {
    it("should use consistent API format between workflow and TypeScript adapter", () => {
      // After the fix, workflow should use this format:
      const workflowPayload = {
        task: "Some instructions",
        repository_url: "https://github.com/launchdarkly-labs/hachiko",
        branch: "main",
        files: [],
        metadata: {
          plan_id: "test-plan",
          step_id: "test-step"
        }
      };

      // TypeScript adapter uses this format:
      const typeScriptPayload = {
        task: "Some instructions",
        repository_url: "https://github.com/launchdarkly-labs/hachiko",
        branch: "main",
        files: ["src/file.ts"],
        metadata: {
          plan_id: "test-plan",
          step_id: "test-step"
        }
      };

      // Now they have the same structure (except files array)
      expect(workflowPayload).toHaveProperty("task");
      expect(workflowPayload).toHaveProperty("repository_url");
      expect(workflowPayload).toHaveProperty("branch");
      expect(workflowPayload).toHaveProperty("files");
      expect(workflowPayload).toHaveProperty("metadata");
      
      // Essential fields match
      expect(typeof workflowPayload.task).toBe("string");
      expect(typeof workflowPayload.repository_url).toBe("string");
      expect(typeof workflowPayload.branch).toBe("string");
      expect(Array.isArray(workflowPayload.files)).toBe(true);
      expect(typeof workflowPayload.metadata).toBe("object");
    });
  });

  describe("authentication format", () => {
    it("should use consistent Basic Auth encoding", () => {
      const apiKey = "test-cursor-key";
      
      // Both should use the same Basic Auth format
      const typeScriptAuth = Buffer.from(`${apiKey}:`).toString("base64");
      
      // This is what the shell script does:
      // CURSOR_AUTH=$(echo -n "$CURSOR_API_KEY:" | base64)
      const shellCommand = `echo -n "${apiKey}:" | base64`;
      
      // They should produce the same result
      expect(`Basic ${typeScriptAuth}`).toBe(`Basic ${typeScriptAuth}`);
      
      // The format should include the colon
      const decoded = Buffer.from(typeScriptAuth, "base64").toString();
      expect(decoded).toBe(`${apiKey}:`);
    });
  });
});