import type { Octokit } from "@octokit/rest";

/**
 * Context object containing GitHub API client and repository information
 * Used by services to interact with GitHub API without depending on Probot
 */
export interface ContextWithRepository {
  octokit: Octokit;
  payload: {
    repository: {
      owner: { login: string };
      name: string;
      full_name?: string;
      html_url?: string;
    };
    sender?: {
      login: string;
    };
  };
}

/**
 * Repository information extracted from context
 */
export interface RepositoryInfo {
  owner: string;
  repo: string;
  fullName: string;
}

/**
 * Extract repository information from a context with repository
 */
export function extractRepositoryInfo(context: ContextWithRepository): RepositoryInfo {
  const { owner, name, full_name } = context.payload.repository;
  return {
    owner: owner.login,
    repo: name,
    fullName: full_name || `${owner.login}/${name}`,
  };
}
