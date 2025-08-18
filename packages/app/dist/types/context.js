"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractRepositoryInfo = extractRepositoryInfo;
/**
 * Extract repository information from a context with repository
 */
function extractRepositoryInfo(context) {
    return {
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        fullName: context.payload.repository.full_name,
    };
}
//# sourceMappingURL=context.js.map