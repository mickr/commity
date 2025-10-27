import * as vscode from "vscode";
import { execSync } from "node:child_process";
import type { API, Repository, Change } from "../types/git";

export function getStagedChangesPaths(): Change[] {
	const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
	const git = gitExtension?.getAPI(1) as API | undefined;

	const repository: Repository | undefined = git?.repositories[0];

	if (!repository) {
		return [];
	}

	const changes: Change[] = repository.state.indexChanges;

	return changes;
}

export function getStagedDiff(): string {
	const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
	const git = gitExtension?.getAPI(1) as API | undefined;

	const repository: Repository | undefined = git?.repositories[0];

	if (!repository) {
		return "";
	}

	const cwd = repository.rootUri.fsPath;

	try {
		const diff = execSync("git diff --cached", { cwd, encoding: "utf-8" });
		return diff;
	} catch (error) {
		console.error("Error getting staged diff:", error);
		return "";
	}
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
