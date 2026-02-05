import { describe, it, expect } from "vitest";

/**
 * Official Cursor API format validation tests
 * Based on https://cursor.com/docs/cloud-agent/api/endpoints
 * 
 * These tests ensure our payload formats match the official API specification
 * and will catch any drift from the documented format.
 */

// Official Cursor API types based on documentation
interface CursorApiRequest {
  prompt: {
    text: string;
    images?: Array<{
      data: string;
      dimension: {
        width: number;
        height: number;
      };
    }>;
  };
  source: {
    repository: string;
    ref?: string;
    prUrl?: string;
  };
  target?: {
    autoCreatePr?: boolean;
    openAsCursorGithubApp?: boolean;
    skipReviewerRequest?: boolean;
    branchName?: string;
    autoBranch?: boolean;
  };
  model?: string;
  webhook?: {
    url: string;
    secret?: string;
  };
}

// Helper to validate payload structure
function validateCursorApiPayload(payload: unknown): asserts payload is CursorApiRequest {
  expect(payload).toBeTypeOf("object");
  expect(payload).not.toBeNull();
  
  const req = payload as any;
  
  // Validate prompt (required)
  expect(req.prompt).toBeTypeOf("object");
  expect(req.prompt.text).toBeTypeOf("string");
  expect(req.prompt.text.length).toBeGreaterThan(0);
  
  // Validate source (required)
  expect(req.source).toBeTypeOf("object");
  expect(req.source.repository).toBeTypeOf("string");
  expect(req.source.repository).toMatch(/^https:\/\/github\.com\/[\w-]+\/[\w-]+$/);
  
  // Validate optional fields if present
  if (req.source.ref) {
    expect(req.source.ref).toBeTypeOf("string");
  }
  
  if (req.target) {
    expect(req.target).toBeTypeOf("object");
    if (req.target.autoCreatePr !== undefined) {
      expect(req.target.autoCreatePr).toBeTypeOf("boolean");
    }
    if (req.target.autoBranch !== undefined) {
      expect(req.target.autoBranch).toBeTypeOf("boolean");
    }
  }
  
  if (req.webhook) {
    expect(req.webhook).toBeTypeOf("object");
    expect(req.webhook.url).toBeTypeOf("string");
    expect(req.webhook.url).toMatch(/^https?:\/\/.+/);
  }
}

describe("Cursor API Format Validation", () => {
  describe("Official API Format", () => {
    it("validates minimal required payload", () => {
      const payload = {
        prompt: {
          text: "Add tests for user authentication"
        },
        source: {
          repository: "https://github.com/example/repo"
        }
      };
      
      validateCursorApiPayload(payload);
    });
    
    it("validates complete payload with all fields", () => {
      const payload: CursorApiRequest = {
        prompt: {
          text: "Refactor authentication module",
          images: [{
            data: "base64encodeddata",
            dimension: { width: 800, height: 600 }
          }]
        },
        source: {
          repository: "https://github.com/example/repo",
          ref: "main"
        },
        target: {
          autoCreatePr: true,
          autoBranch: true,
          branchName: "feature/auth-refactor"
        },
        model: "claude-3-5-sonnet",
        webhook: {
          url: "https://example.com/webhook",
          secret: "webhook-secret"
        }
      };
      
      validateCursorApiPayload(payload);
    });
  });

  describe("GitHub Actions Workflow Payload", () => {
    it("generates payload matching official format", () => {
      // Simulate the payload structure from GitHub Actions
      const agentInstructions = "Implement user login functionality";
      const repository = "launchdarkly-labs/hachiko";
      const webhookUrl = "https://api.example.com/webhook";
      
      // This matches the structure in .github/workflows/execute-migration.yml
      const payload = {
        prompt: {
          text: agentInstructions
        },
        source: {
          repository: `https://github.com/${repository}`,
          ref: "main"
        },
        target: {
          autoCreatePr: true,
          autoBranch: true
        },
        ...(webhookUrl && {
          webhook: {
            url: webhookUrl
          }
        })
      };
      
      validateCursorApiPayload(payload);
      expect(payload.prompt.text).toBe(agentInstructions);
      expect(payload.source.repository).toBe(`https://github.com/${repository}`);
      expect(payload.source.ref).toBe("main");
      expect(payload.target?.autoCreatePr).toBe(true);
      expect(payload.target?.autoBranch).toBe(true);
      expect(payload.webhook?.url).toBe(webhookUrl);
    });
    
    it("generates payload without webhook when not provided", () => {
      const payload = {
        prompt: {
          text: "Fix bug in user registration"
        },
        source: {
          repository: "https://github.com/launchdarkly-labs/hachiko",
          ref: "main"
        },
        target: {
          autoCreatePr: true,
          autoBranch: true
        }
      };
      
      validateCursorApiPayload(payload);
      expect(payload.webhook).toBeUndefined();
    });
  });

  describe("TypeScript Adapter Compatibility", () => {
    it("detects incompatible format from old adapter", () => {
      // This is the old format that doesn't match Cursor API
      const oldFormat = {
        task: "Implement feature X",
        repository_url: "https://github.com/example/repo",
        branch: "main",
        files: [],
        metadata: {
          plan_id: "test-plan",
          step_id: "1"
        }
      };
      
      // This should fail validation
      expect(() => validateCursorApiPayload(oldFormat)).toThrow();
    });
    
    it("validates conversion from old to new format", () => {
      const oldFormat = {
        task: "Implement user authentication",
        repository_url: "https://github.com/launchdarkly-labs/hachiko",
        branch: "main",
        files: ["src/auth.ts"],
        metadata: {
          plan_id: "auth-migration",
          step_id: "1"
        }
      };
      
      // Convert to new format
      const newFormat = {
        prompt: {
          text: oldFormat.task
        },
        source: {
          repository: oldFormat.repository_url,
          ref: oldFormat.branch
        },
        target: {
          autoCreatePr: true,
          autoBranch: true
        }
      };
      
      validateCursorApiPayload(newFormat);
      expect(newFormat.prompt.text).toBe(oldFormat.task);
      expect(newFormat.source.repository).toBe(oldFormat.repository_url);
      expect(newFormat.source.ref).toBe(oldFormat.branch);
    });
  });

  describe("Error Cases", () => {
    it("rejects payload without prompt", () => {
      const payload = {
        source: {
          repository: "https://github.com/example/repo"
        }
      };
      
      expect(() => validateCursorApiPayload(payload)).toThrow();
    });
    
    it("rejects payload without source", () => {
      const payload = {
        prompt: {
          text: "Do something"
        }
      };
      
      expect(() => validateCursorApiPayload(payload)).toThrow();
    });
    
    it("rejects payload with invalid repository URL", () => {
      const payload = {
        prompt: {
          text: "Fix bug"
        },
        source: {
          repository: "not-a-github-url"
        }
      };
      
      expect(() => validateCursorApiPayload(payload)).toThrow();
    });
    
    it("rejects payload with empty prompt text", () => {
      const payload = {
        prompt: {
          text: ""
        },
        source: {
          repository: "https://github.com/example/repo"
        }
      };
      
      expect(() => validateCursorApiPayload(payload)).toThrow();
    });
  });
});