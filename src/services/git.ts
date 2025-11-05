import * as vscode from "vscode";
import * as path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import type { API, Repository, Change } from "../types/git";

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

export function getStagedChangesPaths(): Change[] {
	const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
	const git = gitExtension?.getAPI(1) as API | undefined;

	const repository: Repository | undefined = git?.repositories[0];

	if (!repository) {
		return [];
	}

	const changes: Change[] = repository.state.workingTreeChanges;
	const cwd = repository.rootUri.fsPath;

	return changes.filter((change) => {
		const rel = toPosixRelative(cwd, change.uri.fsPath);
		return !shouldIgnore(rel);
	});
}

export function getStagedDiff(): StagedDiffs {
	const changes = getStagedChangesPaths();

	if (changes.length === 0) {
		return {};
	}

	const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
	const git = gitExtension?.getAPI(1) as API | undefined;
	const repository: Repository | undefined = git?.repositories[0];

	if (!repository) {
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
					["diff", "--no-color", "--no-ext-diff", "--", filePath],
					{ cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }
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

export function getCurrentBranch(): string {
	const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
	const git = gitExtension?.getAPI(1) as API | undefined;

	const repository: Repository | undefined = git?.repositories[0];

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
