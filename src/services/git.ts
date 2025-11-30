import * as path from "node:path";
import * as fs from "node:fs";
import { execFile, execFileSync, execSync } from "node:child_process";
import { promisify } from "node:util";
import * as git from "isomorphic-git";
import type { Repository, Change } from "../types/git";

const execFileAsync = promisify(execFile);

export type FileDiff = {
	diff: string;
	summary?: string;
};

export type StagedDiffs = Record<string, FileDiff>;

function toPosixRelative(cwd: string, fsPath: string): string {
	const rel = path.relative(cwd, fsPath);
	return rel.replace(/\\/g, "/");
}

function shouldIgnore(relPosix: string): boolean {
	const base = relPosix.split("/").pop() || "";

	if (relPosix.includes("node_modules/")) {
		return true;
	}
	if (relPosix.includes("vendor/")) {
		return true;
	}
	if (relPosix.startsWith("dist/") || relPosix.startsWith("build/")) {
		return true;
	}

	const lockFiles = [
		"package-lock.json",
		"pnpm-lock.yaml",
		"yarn.lock",
		"composer.lock",
		"Cargo.lock",
		"Gemfile.lock",
		"poetry.lock",
	];

	if (lockFiles.includes(base)) {
		return true;
	}

	if (/\.(min\.js|min\.css)$/.test(base)) {
		return true;
	}

	return false;
}

export function getChanges(repository: Repository): Change[] {
	const workingTree: Change[] = repository.state.workingTreeChanges;
	const staged: Change[] = repository.state.indexChanges;
	const cwd = repository.rootUri.fsPath;

	return [...workingTree, ...staged].filter((change) => {
		const rel = toPosixRelative(cwd, change.uri.fsPath);
		return !shouldIgnore(rel);
	});
}

export function getDiffs(repository: Repository): StagedDiffs {
	const changes = getChanges(repository);

	if (changes.length === 0) {
		return {};
	}

	const cwd = repository.rootUri.fsPath;
	const diffs: StagedDiffs = {};

	for (const change of changes) {
		try {
			const filePath = change.uri.fsPath;
			const rel = toPosixRelative(cwd, filePath);

			const isDeleted = change.status === 6;

			if (isDeleted) {
				diffs[rel] = {
					diff: "deleted",
					summary: undefined,
				};
			} else {
				const diff = execFileSync(
					"git",
					["diff", "HEAD", "--no-color", "--no-ext-diff", "--", filePath],
					{
						cwd,
						encoding: "utf8",
						maxBuffer: 32 * 1024 * 1024,
					}
				);

				diffs[rel] = {
					diff,
					summary: undefined,
				};
			}
		} catch (error) {
			console.error(`Error getting diff for ${change.uri.fsPath}:`, error);
		}
	}

	return diffs;
}

export function getCurrentBranch(repository: Repository): string {
	if (!repository) {
		return "";
	}

	return repository.state?.HEAD?.name || "";
}

function getGitConfigValue(key: string, fallback: string): string {
	try {
		return execSync(`git config ${key}`, { encoding: "utf-8" }).trim();
	} catch {
		return fallback;
	}
}

export function getCurrentAuthor(): string {
	return getGitConfigValue("user.name", "");
}

function getAuthor(): { name: string; email: string } {
	return {
		name: getGitConfigValue("user.name", "Unknown"),
		email: getGitConfigValue("user.email", "unknown@unknown"),
	};
}

export class SquashError extends Error {
	constructor(
		message: string,
		public readonly stderr?: string
	) {
		super(message);
		this.name = "SquashError";
	}
}

async function runGit(args: string[], cwd: string): Promise<string> {
	try {
		const { stdout } = await execFileAsync("git", args, { cwd });
		return stdout.trim();
	} catch (error) {
		if (error instanceof Error && "stderr" in error) {
			const stderr =
				typeof (error as { stderr?: string }).stderr === "string"
					? (error as { stderr?: string }).stderr
					: undefined;
			throw new SquashError(`git ${args.join(" ")} failed`, stderr);
		}
		throw error;
	}
}

export async function getHeadHash(repository: Repository): Promise<string> {
	const dir = repository.rootUri.fsPath;
	try {
		return await git.resolveRef({ fs, dir, ref: "HEAD" });
	} catch {
		return "";
	}
}

export async function getActualCurrentBranch(repository: Repository): Promise<string> {
	const dir = repository.rootUri.fsPath;
	try {
		const branch = await git.currentBranch({ fs, dir });
		return branch || "";
	} catch {
		return "";
	}
}

export async function ensureCleanWorkingTree(repository: Repository): Promise<boolean> {
	if (repository.status) {
		try {
			await repository.status();
		} catch {
			return false;
		}
	}

	const state = repository.state;
	const hasChanges =
		state.indexChanges.length > 0 ||
		state.workingTreeChanges.length > 0 ||
		state.untrackedChanges.length > 0 ||
		state.mergeChanges.length > 0;

	return !hasChanges;
}

export function formatCommitRange(hashes: string[]): string {
	if (hashes.length === 0) {
		return "";
	}

	if (hashes.length === 1) {
		return hashes[0];
	}

	const newest = hashes[0];
	const oldest = hashes[hashes.length - 1];
	return `${newest} → ${oldest}`;
}

export async function performSoftResetSquash({
	repository,
	oldestCommitHash,
	message,
}: {
	repository: Repository;
	oldestCommitHash: string;
	message: string;
}): Promise<{ newCommitHash: string; shortCommitHash: string }> {
	const dir = repository.rootUri.fsPath;

	// Get the parent of the oldest commit (what we're resetting to)
	const [parentCommit] = await git.log({
		fs,
		dir,
		ref: oldestCommitHash,
		depth: 2,
	});

	const parentOid = parentCommit.commit.parent[0];
	if (!parentOid) {
		throw new SquashError("Cannot squash: oldest commit has no parent");
	}

	// Get current HEAD's tree (the state we want to keep)
	const headOid = await git.resolveRef({ fs, dir, ref: "HEAD" });
	const headCommit = await git.readCommit({ fs, dir, oid: headOid });
	const treeOid = headCommit.commit.tree;

	// Create new commit with the current tree but parent of oldest commit
	const newCommitHash = await git.commit({
		fs,
		dir,
		message,
		author: getAuthor(),
		tree: treeOid,
		parent: [parentOid],
	});

	const shortCommitHash = newCommitHash.substring(0, 7);
	return { newCommitHash, shortCommitHash };
}

export async function performRebaseSquash({
	repository,
	commitHashes,
	message,
}: {
	repository: Repository;
	commitHashes: string[];
	message: string;
}): Promise<{ newCommitHash: string; shortCommitHash: string }> {
	const dir = repository.rootUri.fsPath;
	const oldestCommit = commitHashes[commitHashes.length - 1];

	// Get the parent of the oldest commit (the base we're rebasing onto)
	const [oldestCommitInfo] = await git.log({
		fs,
		dir,
		ref: oldestCommit,
		depth: 2,
	});

	const baseParentOid = oldestCommitInfo.commit.parent[0];
	if (!baseParentOid) {
		throw new SquashError("Cannot squash: oldest commit has no parent");
	}

	// Get current HEAD to find commits between oldest and HEAD that are NOT in the squash range
	const headOid = await git.resolveRef({ fs, dir, ref: "HEAD" });

	// Get all commits from HEAD back to the oldest commit's parent
	const allCommits = await git.log({
		fs,
		dir,
		ref: headOid,
	});

	const newestSquashCommit = commitHashes[0];
	const commitsToReplay: Array<{
		oid: string;
		commit: { tree: string; message: string; parent: string[] };
	}> = [];

	for (const commit of allCommits) {
		if (commit.oid === newestSquashCommit) {
			break;
		}

		commitsToReplay.unshift(commit);
	}

	// Get the tree from the newest commit being squashed (preserves the final state of squashed commits)
	const newestSquashCommitInfo = await git.readCommit({ fs, dir, oid: newestSquashCommit });
	const squashedTreeOid = newestSquashCommitInfo.commit.tree;
	const author = getAuthor();

	// Create the squashed commit with the tree from newest squash commit
	let newCommitHash = await git.commit({
		fs,
		dir,
		message,
		author,
		tree: squashedTreeOid,
		parent: [baseParentOid],
	});

	// Replay any commits that came after the squashed commits
	for (const commit of commitsToReplay) {
		newCommitHash = await git.commit({
			fs,
			dir,
			message: commit.commit.message,
			author,
			tree: commit.commit.tree,
			parent: [newCommitHash],
		});
	}

	const shortCommitHash = newCommitHash.substring(0, 7);
	return { newCommitHash, shortCommitHash };
}

export async function performAmendCommit({
	repository,
	message,
}: {
	repository: Repository;
	message: string;
}): Promise<{ newCommitHash: string; shortCommitHash: string }> {
	const dir = repository.rootUri.fsPath;

	const headOid = await git.resolveRef({ fs, dir, ref: "HEAD" });
	const headCommit = await git.readCommit({ fs, dir, oid: headOid });
	const treeOid = headCommit.commit.tree;
	const parentOids = headCommit.commit.parent;

	const newCommitHash = await git.commit({
		fs,
		dir,
		message,
		author: getAuthor(),
		tree: treeOid,
		parent: parentOids,
	});

	const shortCommitHash = newCommitHash.substring(0, 7);
	return { newCommitHash, shortCommitHash };
}

export async function performUndoLastCommit({
	repository,
}: {
	repository: Repository;
}): Promise<{ undoneCommitHash: string }> {
	const cwd = repository.rootUri.fsPath;
	const undoneCommitHash = await runGit(["rev-parse", "--short", "HEAD"], cwd);
	await runGit(["reset", "--soft", "HEAD~1"], cwd);
	return { undoneCommitHash };
}

export type ResetMode = "soft" | "mixed" | "hard";

export async function performReset({
	repository,
	targetHash,
	mode,
}: {
	repository: Repository;
	targetHash: string;
	mode: ResetMode;
}): Promise<void> {
	const cwd = repository.rootUri.fsPath;
	await runGit(["reset", `--${mode}`, targetHash], cwd);
}

export async function performRevertCommit({
	repository,
	targetHash,
	message,
}: {
	repository: Repository;
	targetHash: string;
	message: string;
}): Promise<{ newCommitHash: string; shortCommitHash: string }> {
	const cwd = repository.rootUri.fsPath;

	await runGit(["revert", "--no-commit", targetHash], cwd);
	await runGit(["commit", "-m", message], cwd);

	const newCommitHash = await runGit(["rev-parse", "HEAD"], cwd);
	const shortCommitHash = newCommitHash.substring(0, 7);
	return { newCommitHash, shortCommitHash };
}

export async function performCherryPick({
	repository,
	targetHash,
}: {
	repository: Repository;
	targetHash: string;
}): Promise<{ newCommitHash: string; shortCommitHash: string }> {
	const cwd = repository.rootUri.fsPath;

	await runGit(["cherry-pick", targetHash], cwd);

	const newCommitHash = await runGit(["rev-parse", "HEAD"], cwd);
	const shortCommitHash = newCommitHash.substring(0, 7);
	return { newCommitHash, shortCommitHash };
}

export type CommitType =
	| "feat"
	| "fix"
	| "docs"
	| "style"
	| "refactor"
	| "perf"
	| "test"
	| "chore"
	| "ci"
	| "build"
	| "revert"
	| "merge"
	| "other";

export interface ReflogEntry {
	hash: string;
	message: string;
	timestamp: string;
	filesChanged?: number;
	repoRoot?: string;
	author?: {
		name: string;
		email?: string;
	};
	isMerge?: boolean;
	totalAdditions?: number;
	totalDeletions?: number;
	commitType?: CommitType;
}

function parseCommitType(message: string): CommitType | undefined {
	const lowerMessage = message.toLowerCase();
	if (lowerMessage.startsWith("merge")) {
		return "merge";
	}
	const match = message.match(/^(\w+)(?:\(.+?\))?:/);
	if (match) {
		const type = match[1].toLowerCase();
		const validTypes: CommitType[] = [
			"feat",
			"fix",
			"docs",
			"style",
			"refactor",
			"perf",
			"test",
			"chore",
			"ci",
			"build",
			"revert",
		];
		if (validTypes.includes(type as CommitType)) {
			return type as CommitType;
		}
	}
	return undefined;
}

export async function getReflogEntries(repository: Repository): Promise<ReflogEntry[]> {
	const cwd = repository.rootUri.fsPath;

	try {
		// Format: hash|subject|date|author name|author email|parent count
		const logOutput = await runGit(
			["log", "--format=BEGIN_COMMIT|%H|%s|%ci|%an|%ae|%P", "--numstat", "-n", "100"],
			cwd
		);

		const entries: ReflogEntry[] = [];
		const lines = logOutput.split("\n");
		let currentEntry: Partial<ReflogEntry> | null = null;
		let filesCount = 0;
		let totalAdditions = 0;
		let totalDeletions = 0;

		for (const line of lines) {
			if (line.startsWith("BEGIN_COMMIT|")) {
				if (currentEntry) {
					currentEntry.filesChanged = filesCount;
					currentEntry.totalAdditions = totalAdditions;
					currentEntry.totalDeletions = totalDeletions;
					entries.push(currentEntry as ReflogEntry);
				}
				const parts = line.split("|");
				const hash = parts[1] || "";
				const message = parts[2] || "";
				const timestamp = parts[3] || "";
				const authorName = parts[4] || "";
				const authorEmail = parts[5] || "";
				const parents = parts[6] || "";
				const isMerge = parents.trim().split(" ").length > 1;

				currentEntry = {
					hash,
					message,
					timestamp,
					author: {
						name: authorName,
						email: authorEmail || undefined,
					},
					isMerge,
					commitType: isMerge ? "merge" : parseCommitType(message),
				};
				filesCount = 0;
				totalAdditions = 0;
				totalDeletions = 0;
			} else if (line.trim().length > 0 && currentEntry) {
				// numstat lines look like: "1       2       path/to/file"
				const parts = line.split("\t");
				if (parts.length >= 3) {
					const additions = parts[0] === "-" ? 0 : parseInt(parts[0], 10) || 0;
					const deletions = parts[1] === "-" ? 0 : parseInt(parts[1], 10) || 0;
					totalAdditions += additions;
					totalDeletions += deletions;
					filesCount++;
				}
			}
		}

		// Push the last entry
		if (currentEntry) {
			currentEntry.filesChanged = filesCount;
			currentEntry.totalAdditions = totalAdditions;
			currentEntry.totalDeletions = totalDeletions;
			entries.push(currentEntry as ReflogEntry);
		}

		return entries;
	} catch (error) {
		console.error("Failed to get reflog entries:", error);
		return [];
	}
}
