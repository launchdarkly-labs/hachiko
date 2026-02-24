/**
 * GitHubSimulator — a stateful in-memory fake that implements the subset of
 * GitHub APIs Hachiko uses, compatible with the ContextWithRepository interface
 * so services work unchanged.
 *
 * Usage:
 *   const sim = new GitHubSimulator();
 *   sim.addMigrationFile("my-migration", { title: "My Migration", agent: "cursor", totalSteps: 3 });
 *   const ctx = sim.context();
 *   const state = await getMigrationState(ctx, "my-migration");
 */
// ---------------------------------------------------------------------------
// GitHubSimulator
// ---------------------------------------------------------------------------
export class GitHubSimulator {
    // Internal state
    issues = new Map();
    pullRequests = new Map();
    files = new Map();
    workflowDispatches = [];
    workflowRuns = [];
    nextNumber = 1;
    nextRunId = 1000;
    // -------------------------------------------------------------------------
    // Convenience methods for test scenarios
    // -------------------------------------------------------------------------
    /** Create a migration .md in the files map with frontmatter */
    addMigrationFile(id, opts) {
        const schemaVersion = opts.schemaVersion ?? 1;
        const now = new Date().toISOString();
        let frontmatter;
        if (schemaVersion === 1) {
            frontmatter = [
                "---",
                `schema_version: 1`,
                `id: ${id}`,
                `title: ${opts.title}`,
                `agent: ${opts.agent}`,
                ...(opts.reviewers ? [`reviewers: [${opts.reviewers.join(", ")}]`] : []),
                `status: ${opts.status ?? "pending"}`,
                `current_step: ${opts.currentStep ?? 1}`,
                `total_steps: ${opts.totalSteps ?? 1}`,
                `created: ${now}`,
                `last_updated: ${now}`,
                "---",
            ].join("\n");
        }
        else {
            frontmatter = [
                "---",
                `schema_version: 2`,
                `id: ${id}`,
                `title: ${opts.title}`,
                `agent: ${opts.agent}`,
                ...(opts.reviewers ? [`reviewers: [${opts.reviewers.join(", ")}]`] : []),
                `created: ${now}`,
                "---",
            ].join("\n");
        }
        const body = opts.bodyContent ?? `\n# ${opts.title}\n`;
        this.files.set(`.hachiko/migrations/${id}.md`, frontmatter + body);
    }
    /** Add a PR in open state */
    createPR(opts) {
        const num = this.nextNumber++;
        const pr = {
            number: num,
            title: opts.title,
            body: opts.body ?? "",
            branch: opts.branch,
            labels: opts.labels ?? [],
            state: "open",
            merged: false,
            merged_at: null,
            html_url: `https://github.com/test-owner/test-repo/pull/${num}`,
            commits: opts.commits ?? [{ sha: `sha-${num}`, message: opts.title }],
        };
        this.pullRequests.set(num, pr);
        return pr;
    }
    /**
     * Create a PR matching the shape a hachiko-native agent would produce.
     * Branch: hachiko/{migrationId}-step-{step}, title: [{migrationId}] Step {step}: {description}
     */
    createHachikoPR(opts) {
        const desc = opts.description ?? `Step ${opts.step}`;
        return this.createPR({
            branch: `hachiko/${opts.migrationId}-step-${opts.step}`,
            title: `[${opts.migrationId}] Step ${opts.step}: ${desc}`,
            labels: ["hachiko:migration"],
        });
    }
    /**
     * Create a PR matching the shape Cursor (cloud) would produce.
     * Branch: cursor/{slug}-{hash}, body contains tracking token, label hachiko:migration.
     */
    createCursorPR(opts) {
        const hash = opts.hash ?? Math.random().toString(16).slice(2, 6);
        const slug = opts.description?.toLowerCase().replace(/\s+/g, "-") ?? `step-${opts.step}`;
        return this.createPR({
            branch: `cursor/${slug}-${hash}`,
            title: opts.description ?? `Migration step ${opts.step}`,
            body: `<!-- hachiko-track:${opts.migrationId}:${opts.step} -->\n## Migration Progress\nCursor automated changes.`,
            labels: ["hachiko:migration"],
        });
    }
    /**
     * Create a PR matching the shape Devin (cloud) would produce.
     * Branch: devin/{slug}-{hash}, tracking token in first commit message, label hachiko:migration.
     */
    createDevinPR(opts) {
        const hash = opts.hash ?? Math.random().toString(16).slice(2, 6);
        const slug = opts.description?.toLowerCase().replace(/\s+/g, "-") ?? `step-${opts.step}`;
        return this.createPR({
            branch: `devin/${slug}-${hash}`,
            title: opts.description ?? `Apply migration changes`,
            labels: ["hachiko:migration"],
            commits: [
                {
                    sha: `sha-devin-${hash}`,
                    message: `hachiko-track:${opts.migrationId}:${opts.step} ${opts.description ?? "apply changes"}`,
                },
            ],
        });
    }
    /** Merge a PR (set state=closed, merged=true, merged_at=now) */
    mergePR(number) {
        const pr = this.pullRequests.get(number);
        if (!pr)
            throw new Error(`PR #${number} not found in simulator`);
        pr.state = "closed";
        pr.merged = true;
        pr.merged_at = new Date().toISOString();
    }
    /** Close a PR without merging */
    closePR(number) {
        const pr = this.pullRequests.get(number);
        if (!pr)
            throw new Error(`PR #${number} not found in simulator`);
        pr.state = "closed";
    }
    /** Create an issue with the hachiko:migration-dashboard label */
    createDashboardIssue(body) {
        const num = this.nextNumber++;
        const issue = {
            number: num,
            title: "Hachiko Migration Dashboard",
            body,
            labels: ["hachiko:migration-dashboard"],
            state: "open",
            comments: [],
        };
        this.issues.set(num, issue);
        return issue;
    }
    /** Add a workflow run to the simulator */
    addWorkflowRun(run) {
        const id = this.nextRunId++;
        const fullRun = { id, ...run };
        this.workflowRuns.push(fullRun);
        return fullRun;
    }
    /** Get a file from the simulator's file store */
    getFile(path) {
        return this.files.get(path);
    }
    /** Set a file in the simulator's file store */
    setFile(path, content) {
        this.files.set(path, content);
    }
    /** Return a ContextWithRepository wired to this simulator */
    context(owner = "test-owner", repo = "test-repo") {
        return {
            octokit: this.buildOctokit(owner, repo),
            payload: {
                repository: {
                    owner: { login: owner },
                    name: repo,
                    full_name: `${owner}/${repo}`,
                },
            },
        };
    }
    // -------------------------------------------------------------------------
    // Octokit-compatible surface (private)
    // -------------------------------------------------------------------------
    buildOctokit(_owner, _repo) {
        return {
            issues: {
                create: this.issuesCreate.bind(this),
                get: this.issuesGet.bind(this),
                update: this.issuesUpdate.bind(this),
                listForRepo: this.issuesListForRepo.bind(this),
                addLabels: this.issuesAddLabels.bind(this),
                createComment: this.issuesCreateComment.bind(this),
            },
            pulls: {
                list: this.pullsList.bind(this),
                get: this.pullsGet.bind(this),
                listCommits: this.pullsListCommits.bind(this),
            },
            repos: {
                getContent: this.reposGetContent.bind(this),
                listCommits: this.reposListCommits.bind(this),
                createOrUpdateFileContents: this.reposCreateOrUpdateFileContents.bind(this),
            },
            actions: {
                createWorkflowDispatch: this.actionsCreateWorkflowDispatch.bind(this),
                listWorkflowRuns: this.actionsListWorkflowRuns.bind(this),
            },
        };
    }
    // -- issues ---------------------------------------------------------------
    async issuesCreate(params) {
        const num = this.nextNumber++;
        const issue = {
            number: num,
            title: params.title,
            body: params.body ?? "",
            labels: params.labels ?? [],
            state: "open",
            comments: [],
        };
        this.issues.set(num, issue);
        return {
            data: {
                number: num,
                title: issue.title,
                body: issue.body,
                labels: issue.labels.map((name) => ({ name })),
                state: issue.state,
                html_url: `https://github.com/${params.owner}/${params.repo}/issues/${num}`,
            },
        };
    }
    async issuesGet(params) {
        const issue = this.issues.get(params.issue_number);
        if (!issue) {
            const error = new Error("Not Found");
            error.status = 404;
            throw error;
        }
        return {
            data: {
                number: issue.number,
                title: issue.title,
                body: issue.body,
                labels: issue.labels.map((name) => ({ name })),
                state: issue.state,
            },
        };
    }
    async issuesUpdate(params) {
        const issue = this.issues.get(params.issue_number);
        if (!issue) {
            const error = new Error("Not Found");
            error.status = 404;
            throw error;
        }
        if (params.body !== undefined)
            issue.body = params.body;
        if (params.labels !== undefined)
            issue.labels = params.labels;
        if (params.state !== undefined)
            issue.state = params.state;
        if (params.title !== undefined)
            issue.title = params.title;
        return {
            data: {
                number: issue.number,
                title: issue.title,
                body: issue.body,
                labels: issue.labels.map((name) => ({ name })),
                state: issue.state,
            },
        };
    }
    async issuesListForRepo(params) {
        let issues = Array.from(this.issues.values());
        if (params.state && params.state !== "all") {
            issues = issues.filter((i) => i.state === params.state);
        }
        if (params.labels) {
            const requiredLabels = params.labels.split(",").map((l) => l.trim());
            issues = issues.filter((i) => requiredLabels.every((rl) => i.labels.includes(rl)));
        }
        return {
            data: issues.map((issue) => ({
                number: issue.number,
                title: issue.title,
                body: issue.body,
                labels: issue.labels.map((name) => ({ name })),
                state: issue.state,
            })),
        };
    }
    async issuesAddLabels(params) {
        // GitHub's addLabels works on both issues and PRs (PRs are issues)
        const issue = this.issues.get(params.issue_number);
        const pr = this.pullRequests.get(params.issue_number);
        const target = issue ?? pr;
        if (!target) {
            const error = new Error("Not Found");
            error.status = 404;
            throw error;
        }
        for (const label of params.labels) {
            if (!target.labels.includes(label)) {
                target.labels.push(label);
            }
        }
        return {
            data: target.labels.map((name) => ({ name })),
        };
    }
    async issuesCreateComment(params) {
        // GitHub's comment API works on both issues and PRs (PRs are issues)
        const issue = this.issues.get(params.issue_number);
        if (issue) {
            const comment = { body: params.body, created_at: new Date().toISOString() };
            issue.comments.push(comment);
            return { data: { id: issue.comments.length, body: comment.body } };
        }
        // Check if it's a PR number — PRs don't have comments array, but we can
        // still accept the call (GitHub treats PRs as issues for comments)
        const pr = this.pullRequests.get(params.issue_number);
        if (pr) {
            // Store the comment — create a synthetic issue entry for comment tracking
            if (!this.issues.has(params.issue_number)) {
                this.issues.set(params.issue_number, {
                    number: params.issue_number,
                    title: pr.title,
                    body: pr.body,
                    labels: [...pr.labels],
                    state: pr.state,
                    comments: [],
                });
            }
            const syntheticIssue = this.issues.get(params.issue_number);
            const comment = { body: params.body, created_at: new Date().toISOString() };
            syntheticIssue.comments.push(comment);
            return { data: { id: syntheticIssue.comments.length, body: comment.body } };
        }
        const error = new Error("Not Found");
        error.status = 404;
        throw error;
    }
    // -- pulls ----------------------------------------------------------------
    async pullsList(params) {
        let prs = Array.from(this.pullRequests.values());
        if (params.state && params.state !== "all") {
            prs = prs.filter((pr) => pr.state === params.state);
        }
        return {
            data: prs.map((pr) => this.serializePR(pr)),
        };
    }
    async pullsGet(params) {
        const pr = this.pullRequests.get(params.pull_number);
        if (!pr) {
            const error = new Error("Not Found");
            error.status = 404;
            throw error;
        }
        return { data: this.serializePR(pr) };
    }
    async pullsListCommits(params) {
        const pr = this.pullRequests.get(params.pull_number);
        if (!pr) {
            const error = new Error("Not Found");
            error.status = 404;
            throw error;
        }
        return {
            data: pr.commits.map((c) => ({
                sha: c.sha,
                commit: { message: c.message },
            })),
        };
    }
    serializePR(pr) {
        return {
            number: pr.number,
            title: pr.title,
            body: pr.body,
            state: pr.state,
            head: { ref: pr.branch },
            labels: pr.labels.map((name) => ({ name })),
            html_url: pr.html_url,
            merged_at: pr.merged_at,
        };
    }
    // -- repos ----------------------------------------------------------------
    async reposGetContent(params) {
        const content = this.files.get(params.path);
        if (content === undefined) {
            const error = new Error("Not Found");
            error.status = 404;
            throw error;
        }
        return {
            data: {
                type: "file",
                content: Buffer.from(content).toString("base64"),
                encoding: "base64",
                path: params.path,
                sha: `sha-${params.path}`,
            },
        };
    }
    async reposListCommits(params) {
        // Return a synthetic commit for the file
        return {
            data: [
                {
                    sha: `commit-sha-${params.path ?? "default"}`,
                    commit: {
                        message: `Update ${params.path ?? "unknown"}`,
                        committer: { date: new Date().toISOString() },
                    },
                },
            ],
        };
    }
    async reposCreateOrUpdateFileContents(params) {
        // params.content is base64-encoded
        const decoded = Buffer.from(params.content, "base64").toString("utf-8");
        this.files.set(params.path, decoded);
        return {
            data: {
                content: {
                    path: params.path,
                    sha: `sha-${Date.now()}`,
                },
                commit: {
                    sha: `commit-${Date.now()}`,
                    message: params.message,
                },
            },
        };
    }
    // -- actions --------------------------------------------------------------
    async actionsCreateWorkflowDispatch(params) {
        this.workflowDispatches.push({
            workflow: params.workflow_id,
            ref: params.ref,
            inputs: params.inputs ?? {},
        });
        // GitHub returns 204 No Content — nothing meaningful in data
        return { status: 204 };
    }
    async actionsListWorkflowRuns(params) {
        let runs = this.workflowRuns.filter((r) => r.workflow_id === params.workflow_id);
        if (params.status) {
            runs = runs.filter((r) => r.status === params.status);
        }
        return {
            data: {
                total_count: runs.length,
                workflow_runs: runs.map((r) => ({
                    id: r.id,
                    name: r.name,
                    status: r.status,
                    conclusion: r.conclusion,
                    head_branch: r.head_branch,
                    created_at: r.created_at,
                })),
            },
        };
    }
}
//# sourceMappingURL=github-simulator.js.map