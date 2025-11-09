import * as path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import type { Repository, Change } from "../types/git";

export type FileDiff = {
	diff: string;
	summary?: string;
	isLockFile?: boolean;
};

export type StagedDiffs = Record<string, FileDiff>;

type IgnoreResult = {
	ignore: boolean;
	type?: "lockfile" | "generated" | "vendor";
};

function toPosixRelative(cwd: string, fsPath: string): string {
	const rel = path.relative(cwd, fsPath);
	return rel.replace(/\\/g, "/");
}

function shouldIgnore(relPosix: string): IgnoreResult {
	const base = relPosix.split("/").pop() || "";

	if (relPosix.includes("node_modules/")) {
		return { ignore: true, type: "vendor" };
	}
	if (relPosix.includes("vendor/")) {
		return { ignore: true, type: "vendor" };
	}
	if (relPosix.startsWith("dist/") || relPosix.startsWith("build/")) {
		return { ignore: true, type: "generated" };
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
		return { ignore: false, type: "lockfile" };
	}

	if (/\.(min\.js|min\.css)$/.test(base)) {
		return { ignore: true, type: "generated" };
	}

	return { ignore: false };
}

function summarizeLockFileChanges(cwd: string, filePath: string): string {
	try {
		// Get the diff statistics for the lock file
		const diffStat = execFileSync(
			"git",
			["diff", "--numstat", "--", filePath],
			{ cwd, encoding: "utf8" },
		).trim();

		if (!diffStat) {
			return "Lock file modified";
		}

		const [added, removed] = diffStat.split("\t").map(Number);
		const fileName = path.basename(filePath);

		// Simple heuristic: if many lines changed, likely dependency updates
		if (added > 0 && removed > 0) {
			return `Updated dependencies in ${fileName}`;
		} else if (added > 0) {
			return `Added dependencies in ${fileName}`;
		} else if (removed > 0) {
			return `Removed dependencies from ${fileName}`;
		}

		return `Modified ${fileName}`;
	} catch (error) {
		return `Lock file modified: ${path.basename(filePath)}`;
	}
}

export function getStagedChangesPaths(repository: Repository): Change[] {
	const changes: Change[] = repository.state.workingTreeChanges;
	const stagedChanges: Change[] = repository.state.indexChanges;
	const allChanges = [...changes, ...stagedChanges];
	const cwd = repository.rootUri.fsPath;

	return allChanges.filter((change) => {
		const rel = toPosixRelative(cwd, change.uri.fsPath);
		const ignoreResult = shouldIgnore(rel);
		return !ignoreResult.ignore;
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
			const ignoreResult = shouldIgnore(rel);
			const isLockFile = ignoreResult.type === "lockfile";

			const isDeleted = change.status === 6;

			if (isDeleted) {
				diffs[rel] = {
					diff: "deleted",
					summary: undefined,
					isLockFile,
				};
			} else if (isLockFile) {
				// For lock files, provide a summary instead of the full diff
				const summary = summarizeLockFileChanges(cwd, filePath);
				diffs[rel] = {
					diff: "",
					summary,
					isLockFile: true,
				};
			} else {
				const diff = execFileSync(
					"git",
					["diff", "--no-color", "--no-ext-diff", "--", filePath],
					{ cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
				);

				diffs[rel] = {
					diff,
					summary: undefined,
					isLockFile: false,
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
