import type { Context } from "probot"

/**
 * Context types that have a repository property in their payload
 */
export type ContextWithRepository =
  | Context<"push">
  | Context<"pull_request">
  | Context<"pull_request.closed">
  | Context<"pull_request.opened">
  | Context<"pull_request.synchronize">
  | Context<"issue_comment">
  | Context<"issue_comment.created">
  | Context<"issue_comment.edited">
  | Context<"issue_comment.deleted">
  | Context<"workflow_run">
  | Context<"workflow_run.completed">
  | Context<"workflow_run.requested">

/**
 * Repository information extracted from context
 */
export interface RepositoryInfo {
  owner: string
  repo: string
  fullName: string
}

/**
 * Extract repository information from a context with repository
 */
export function extractRepositoryInfo(context: ContextWithRepository): RepositoryInfo {
  return {
    owner: context.payload.repository.owner.login,
    repo: context.payload.repository.name,
    fullName: context.payload.repository.full_name,
  }
}
