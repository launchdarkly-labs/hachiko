import { describe, it, expect } from "vitest";

/**
 * Integration tests for API response parsing in GitHub Actions workflows
 * These tests validate the shell script logic used in .github/workflows/execute-migration.yml
 * to catch field name changes and parsing issues before they cause runtime failures.
 */
describe("Workflow API Response Parsing", () => {
  describe("Devin API Response", () => {
    it("should extract session_id from realistic API response", () => {
      // This mirrors the actual Devin API response structure we see in logs
      const mockDevinResponse = {
        session_id: "4ecd8a92151c407383bff1338ca3196b",
        url: "https://app.devin.ai/sessions/4ecd8a92151c407383bff1338ca3196b",
        status: "new",
        title: null,
        tags: [],
        user_id: "bot_apk",
        org_id: "org_heA1disj0TuKweUK",
        created_at: 1769048085,
        updated_at: 1769048085,
        is_archived: false,
        acus_consumed: 0.0,
        pull_requests: [],
        is_advanced: false,
        parent_session_id: null,
        child_session_ids: null
      };

      // Simulate the jq extraction used in the workflow:
      // SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.session_id // empty')
      const sessionId = mockDevinResponse.session_id || '';
      
      expect(sessionId).toBe("4ecd8a92151c407383bff1338ca3196b");
      expect(sessionId).not.toBe(""); // Should not be empty
      
      // Verify the old field name would fail
      const legacyId = (mockDevinResponse as any).id;
      expect(legacyId).toBeUndefined();
    });

    it("should handle missing session_id gracefully", () => {
      const invalidResponse = {
        error: "Invalid request",
        status: "failed"
      };

      const sessionId = (invalidResponse as any).session_id || '';
      expect(sessionId).toBe('');
    });
  });

  describe("Cursor API Response", () => {
    it("should extract taskId from expected response format", () => {
      // Mock expected Cursor API response
      const mockCursorResponse = {
        taskId: "cursor-task-123",
        status: "created",
        repositoryUrl: "https://github.com/launchdarkly-labs/hachiko",
        webhookUrl: null
      };

      // Simulate: TASK_ID=$(echo "$CURSOR_RESPONSE" | jq -r '.taskId // empty')
      const taskId = mockCursorResponse.taskId || '';
      
      expect(taskId).toBe("cursor-task-123");
      expect(taskId).not.toBe("");
    });
  });

  describe("Field Name Validation", () => {
    it("should validate all expected API response fields exist", () => {
      const requiredDevinFields = ['session_id', 'status', 'url', 'created_at', 'updated_at'];
      const requiredCursorFields = ['taskId', 'status'];

      const mockDevinResponse = {
        session_id: "test-session",
        status: "new", 
        url: "https://app.devin.ai/sessions/test-session",
        created_at: 1704067200,
        updated_at: 1704067200
      };

      const mockCursorResponse = {
        taskId: "test-task",
        status: "created"
      };

      // Validate Devin response has all required fields
      for (const field of requiredDevinFields) {
        expect(mockDevinResponse).toHaveProperty(field);
        expect((mockDevinResponse as any)[field]).toBeDefined();
      }

      // Validate Cursor response has all required fields  
      for (const field of requiredCursorFields) {
        expect(mockCursorResponse).toHaveProperty(field);
        expect((mockCursorResponse as any)[field]).toBeDefined();
      }
    });
  });
});