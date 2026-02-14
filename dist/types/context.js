/**
 * Extract repository information from a context with repository
 */
export function extractRepositoryInfo(context) {
    const { owner, name, full_name } = context.payload.repository;
    return {
        owner: owner.login,
        repo: name,
        fullName: full_name || `${owner.login}/${name}`,
    };
}
//# sourceMappingURL=context.js.map