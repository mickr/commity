import * as vscode from "vscode";
import { FireworksProvider } from "../services/ai-providers/fireworks";
import { getStagedDiff, getCurrentBranch, getCurrentAuthor } from "../services/git";
import { readConfiguration } from "../services/config";
import type { CommitMessageRequest, DiffEntry } from "../types/ai";

export const generateCommitMessage = async (context: vscode.ExtensionContext) => {
	const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
	const git = gitExtension?.getAPI(1);

	const repository = git.repositories[0];
	const client = new FireworksProvider(context.extensionMode === vscode.ExtensionMode.Development);

	if (!repository) {
		vscode.window.showWarningMessage("No Git repository found");
		return;
	}

	const stagedDiffs = getStagedDiff();
	const branch = getCurrentBranch();
	const author = getCurrentAuthor();

	const diffs: DiffEntry[] = Object.entries(stagedDiffs).map(([path, { diff }]) => ({
		path,
		diff,
	}));

	const configResult = readConfiguration();
	const override = configResult.success ? configResult.data : undefined;

	const request: CommitMessageRequest = {
		diffs,
		branch,
		author,
		override,
	};

	const message = await vscode.window.withProgress(
		{
			location: vscode.ProgressLocation.Notification,
			title: "Generating commit message...",
			cancellable: false,
		},
		async () => {
			return await client.generateCommitMessage(request);
		}
	);

	repository.inputBox.value = message;

	vscode.window.showInformationMessage("Commit message generated!");
};
