/**
 * Extract repository information from a context with repository
 */
export function extractRepositoryInfo(context) {
  return {
    owner: context.payload.repository.owner.login,
    repo: context.payload.repository.name,
    fullName: context.payload.repository.full_name,
  };
}
//# sourceMappingURL=context.js.map
