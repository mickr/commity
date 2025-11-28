import * as path from "node:path";
import { tmpdir } from "node:os";
import { writeFile, unlink } from "node:fs/promises";
import { execFile, execFileSync, execSync } from "node:child_process";
import { promisify } from "node:util";
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

export function getStagedChangesPaths(repository: Repository): Change[] {
	const changes: Change[] = repository.state.workingTreeChanges;
	const stagedChanges: Change[] = repository.state.indexChanges;
	const allChanges = [...changes, ...stagedChanges];
	const cwd = repository.rootUri.fsPath;

	return allChanges.filter((change) => {
		const rel = toPosixRelative(cwd, change.uri.fsPath);
		return !shouldIgnore(rel);
	});
}

export function getStagedDiff(repository: Repository): StagedDiffs {
	const changes = getStagedChangesPaths(repository);

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

export function getCurrentAuthor(): string {
	try {
		const gitConfig = execSync("git config user.name", { encoding: "utf-8" });
		return gitConfig.trim();
	} catch (error) {
		console.error("Error getting current author:", error);
		return "";
	}
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
	const cwd = repository.rootUri.fsPath;
	try {
		return await runGit(["rev-parse", "HEAD"], cwd);
	} catch {
		return "";
	}
}

export async function getActualCurrentBranch(repository: Repository): Promise<string> {
	const cwd = repository.rootUri.fsPath;
	try {
		const branch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
		return branch === "HEAD" ? "" : branch;
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
	const isClean = await ensureCleanWorkingTree(repository);
	if (!isClean) {
		throw new SquashError(
			"Cannot squash: you have uncommitted changes. Commit or stash them first."
		);
	}

	const cwd = repository.rootUri.fsPath;
	await runGit(["reset", "--soft", `${oldestCommitHash}^`], cwd);
	await runGit(["commit", "-m", message], cwd);
	const shortCommitHash = await runGit(["rev-parse", "--short", "HEAD"], cwd);
	const newCommitHash = await runGit(["rev-parse", "HEAD"], cwd);
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
	const cwd = repository.rootUri.fsPath;
	const oldestCommit = commitHashes[commitHashes.length - 1];
	const newestCommit = commitHashes[0];

	const commitBeforeOldest = `${oldestCommit}^`;

	const todoScript = commitHashes
		.reverse()
		.map((hash, index) => {
			const action = index === 0 ? "pick" : "squash";
			return `${action} ${hash}`;
		})
		.join("\n");

	const todoFile = path.join(tmpdir(), `commity-rebase-${Date.now()}.txt`);
	const msgFile = path.join(tmpdir(), `commity-msg-${Date.now()}.txt`);

	try {
		await writeFile(todoFile, todoScript, "utf8");
		await writeFile(msgFile, message, "utf8");

		const env = {
			...process.env,
			GIT_SEQUENCE_EDITOR: `cat "${todoFile}" >`,
			GIT_EDITOR: `cat "${msgFile}" >`,
		};

		await execFileAsync("git", ["rebase", "-i", "--autosquash", commitBeforeOldest], {
			cwd,
			env,
		});

		const shortCommitHash = await runGit(["rev-parse", "--short", newestCommit], cwd);
		const newCommitHash = await runGit(["rev-parse", newestCommit], cwd);

		return { newCommitHash, shortCommitHash };
	} catch (error) {
		let abortError: Error | undefined;
		try {
			await runGit(["rebase", "--abort"], cwd);
		} catch (abortErr) {
			abortError = abortErr instanceof Error ? abortErr : new Error(String(abortErr));
			console.error("Failed to abort rebase after squash failure:", abortError);
		}

		if (error instanceof Error && "stderr" in error) {
			const stderr =
				typeof (error as { stderr?: string }).stderr === "string"
					? (error as { stderr?: string }).stderr
					: undefined;
			const combinedStderr = abortError
				? `${stderr || ""}\n\nWarning: Failed to abort rebase: ${abortError.message}`.trim()
				: stderr;
			throw new SquashError("Interactive rebase failed", combinedStderr);
		}
		throw error;
	} finally {
		try {
			await unlink(todoFile);
		} catch (cleanupError) {
			console.error("Failed to cleanup todo file:", cleanupError);
		}
		try {
			await unlink(msgFile);
		} catch (cleanupError) {
			console.error("Failed to cleanup message file:", cleanupError);
		}
	}
}

export async function performAmendCommit({
	repository,
	message,
}: {
	repository: Repository;
	message: string;
}): Promise<{ newCommitHash: string; shortCommitHash: string }> {
	const cwd = repository.rootUri.fsPath;
	await runGit(["commit", "--amend", "-m", message], cwd);
	const shortCommitHash = await runGit(["rev-parse", "--short", "HEAD"], cwd);
	const newCommitHash = await runGit(["rev-parse", "HEAD"], cwd);
	return { newCommitHash, shortCommitHash };
}

export type CommitType = "feat" | "fix" | "docs" | "style" | "refactor" | "perf" | "test" | "chore" | "ci" | "build" | "revert" | "merge" | "other";

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
		const validTypes: CommitType[] = ["feat", "fix", "docs", "style", "refactor", "perf", "test", "chore", "ci", "build", "revert"];
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
