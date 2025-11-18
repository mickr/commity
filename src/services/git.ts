import * as path from "node:path";
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
				const diff = execFileSync("git", ["diff", "--no-color", "--no-ext-diff", "--", filePath], {
					cwd,
					encoding: "utf8",
					maxBuffer: 32 * 1024 * 1024,
				});

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
			// ignore status errors and continue with current snapshot
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

	const { writeFile, unlink } = await import("node:fs/promises");
	const { tmpdir } = await import("node:os");
	const { join } = await import("node:path");

	const todoFile = join(tmpdir(), `commity-rebase-${Date.now()}.txt`);
	const msgFile = join(tmpdir(), `commity-msg-${Date.now()}.txt`);

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

export interface ReflogEntry {
	hash: string;
	selector: string;
	message: string;
	timestamp: string;
}

export async function getReflogEntries(repository: Repository): Promise<ReflogEntry[]> {
	const cwd = repository.rootUri.fsPath;

	try {
		const logOutput = await runGit(
			["log", "--format=%H|%s|%ci", "-n", "100"],
			cwd
		);

		const entries = logOutput
			.split("\n")
			.filter((line) => line.trim().length > 0)
			.map((line, index) => {
				const [hash, message, timestamp] = line.split("|");
				return {
					hash: hash || "",
					selector: `${index}`,
					message: message || "",
					timestamp: timestamp || "",
				};
			});

		return entries;
	} catch (error) {
		console.error("Failed to get reflog entries:", error);
		return [];
	}
}
