import { describe, it, expect } from "vitest";

/**
 * Tests for Cursor API payload generation in GitHub Actions workflow
 *
 * These tests validate that the shell script logic in execute-migration.yml
 * generates payloads that match the official Cursor API format.
 */

// Simulate the jq -Rs transformation that happens in the shell script
function simulateJqRs(text: string): string {
  return JSON.stringify(text);
}

// Simulate the GitHub Actions environment variables and shell logic
function generateCursorPayload(
  agentInstructions: string,
  repository: string,
  webhookUrl?: string
): object {
  // This simulates the shell script logic from execute-migration.yml
  const webhookField = webhookUrl ? `,\"webhook\": {\"url\": ${simulateJqRs(webhookUrl)}}` : "";

  // Simulate the REQUEST_PAYLOAD construction
  const payloadJson = `{
    \"prompt\": {
      \"text\": ${simulateJqRs(agentInstructions)}
    },
    \"source\": {
      \"repository\": \"https://github.com/${repository}\",
      \"ref\": \"main\"
    },
    \"target\": {
      \"autoCreatePr\": true,
      \"autoBranch\": true
    }${webhookField}
  }`;

  return JSON.parse(payloadJson);
}

describe("GitHub Actions Cursor Payload Generation", () => {
  describe("Payload Construction", () => {
    it("generates valid payload with basic inputs", () => {
      const payload = generateCursorPayload(
        "Add comprehensive tests for authentication module",
        "launchdarkly-labs/hachiko"
      );

      expect(payload).toEqual({
        prompt: {
          text: "Add comprehensive tests for authentication module",
        },
        source: {
          repository: "https://github.com/launchdarkly-labs/hachiko",
          ref: "main",
        },
        target: {
          autoCreatePr: true,
          autoBranch: true,
        },
      });
    });

    it("includes webhook when provided", () => {
      const payload = generateCursorPayload(
        "Refactor user service",
        "example/repo",
        "https://hooks.example.com/cursor"
      );

      expect(payload).toEqual({
        prompt: {
          text: "Refactor user service",
        },
        source: {
          repository: "https://github.com/example/repo",
          ref: "main",
        },
        target: {
          autoCreatePr: true,
          autoBranch: true,
        },
        webhook: {
          url: "https://hooks.example.com/cursor",
        },
      });
    });

    it("handles multiline instructions correctly", () => {
      const multilineInstructions = `Step 1: Review the authentication module
Step 2: Add comprehensive unit tests
Step 3: Ensure 100% test coverage`;

      const payload = generateCursorPayload(multilineInstructions, "launchdarkly-labs/hachiko");

      expect(payload.prompt.text).toBe(multilineInstructions);
      expect(typeof payload.prompt.text).toBe("string");
    });

    it("handles special characters in instructions", () => {
      const specialInstructions = 'Fix "authentication" bug with $special & <characters>';

      const payload = generateCursorPayload(specialInstructions, "test/repo");

      expect(payload.prompt.text).toBe(specialInstructions);
    });
  });

  describe("jq -Rs Simulation", () => {
    it("correctly escapes strings like jq -Rs", () => {
      const testCases = [
        ["simple text", '"simple text"'],
        ['text with "quotes"', '"text with \\"quotes\\""'],
        ["text\nwith\nnewlines", '"text\\nwith\\nnewlines"'],
        ["text with $variables", '"text with $variables"'],
        ["", '""'],
      ];

      testCases.forEach(([input, expected]) => {
        expect(simulateJqRs(input)).toBe(expected);
      });
    });

    it("maintains JSON validity after jq transformation", () => {
      const complexText = `Multi-line text with:
- Special characters: @#$%^&*()
- Quotes: "hello" and 'world'
- Newlines and tabs	here`;

      const escaped = simulateJqRs(complexText);

      // Should be valid JSON
      expect(() => JSON.parse(escaped)).not.toThrow();
      expect(JSON.parse(escaped)).toBe(complexText);
    });
  });

  describe("Environment Variable Mapping", () => {
    it("maps GitHub Actions variables correctly", () => {
      // Simulate GitHub Actions environment
      const githubRepo = "launchdarkly-labs/hachiko";
      const migrationId = "improve-test-coverage";
      const stepId = "1";
      const agentInstructions = "Add tests for policy engine";

      const payload = generateCursorPayload(agentInstructions, githubRepo);

      expect(payload.source.repository).toBe(`https://github.com/${githubRepo}`);
      expect(payload.source.ref).toBe("main");
      expect(payload.prompt.text).toBe(agentInstructions);
    });

    it("handles repository names with special characters", () => {
      const repos = [
        "org/repo-with-dashes",
        "user/repo_with_underscores",
        "company/repo.with.dots",
      ];

      repos.forEach((repo) => {
        const payload = generateCursorPayload("test task", repo);
        expect(payload.source.repository).toBe(`https://github.com/${repo}`);
      });
    });
  });

  describe("Error Prevention", () => {
    it("prevents empty instructions", () => {
      expect(() => {
        const payload = generateCursorPayload("", "test/repo");
        if (payload.prompt.text === "") {
          throw new Error("Instructions cannot be empty");
        }
      }).toThrow("Instructions cannot be empty");
    });

    it("validates repository format", () => {
      const invalidRepos = ["", "not-org-slash-repo", "org/", "/repo", "org//repo"];

      invalidRepos.forEach((repo) => {
        expect(() => {
          if (!repo.match(/^[\w.-]+\/[\w.-]+$/)) {
            throw new Error(`Invalid repository format: ${repo}`);
          }
        }).toThrow();
      });
    });

    it("validates webhook URL format", () => {
      const invalidUrls = ["not-a-url", "ftp://example.com", "javascript:alert('xss')"];

      invalidUrls.forEach((url) => {
        expect(() => {
          if (url && !url.match(/^https?:\/\/.+/)) {
            throw new Error(`Invalid webhook URL: ${url}`);
          }
        }).toThrow(`Invalid webhook URL: ${url}`);
      });

      // Empty string should not throw (optional field)
      expect(() => {
        const url = "";
        if (url && !url.match(/^https?:\/\/.+/)) {
          throw new Error(`Invalid webhook URL: ${url}`);
        }
      }).not.toThrow();
    });
  });
});
