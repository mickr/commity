import * as vscode from "vscode";
import { FireworksProvider } from "../services/ai-providers/fireworks";
import { getStagedDiff, getCurrentBranch, getCurrentAuthor } from "../services/git";
import { readConfiguration } from "../services/config";
import type { CommitMessageRequest, DiffEntry } from "../types/ai";
import type { Repository } from "../types/git";

export const generateCommitMessage = async (
	sourceControl: vscode.SourceControl,
	context: vscode.ExtensionContext
) => {
	const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
	const git = gitExtension?.getAPI(1);

	const repository = git?.repositories.find(
		(repo: Repository) => repo.rootUri.fsPath === sourceControl?.rootUri?.fsPath
	);

	if (!repository) {
		vscode.window.showWarningMessage("No Git repository found");
		return;
	}

	const client = new FireworksProvider(context.extensionMode === vscode.ExtensionMode.Development);

	const stagedDiffs = getStagedDiff(repository);
	const branch = getCurrentBranch(repository);
	const author = getCurrentAuthor();

	const diffs: DiffEntry[] = Object.entries(stagedDiffs).map(([path, { diff, summary, isLockFile }]) => ({
		path,
		diff: isLockFile && summary ? summary : diff,
	}));

	if (diffs.length === 0) {
		vscode.window.setStatusBarMessage("Commity: No staged changes", 5000);
		return;
	}

	const configResult = readConfiguration();
	const override = configResult.success ? configResult.data : undefined;

	const request: CommitMessageRequest = {
		diffs,
		branch,
		author,
		override,
	};

	try {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "Generating commit message...",
				cancellable: true,
			},
			async (progress, token) => {
				const abortController = new AbortController();

				token.onCancellationRequested(() => {
					abortController.abort();
				});

				repository.inputBox.value = "";
				let accumulatedMessage = "";

				for await (const chunk of client.streamCommitMessage(request, abortController.signal)) {
					accumulatedMessage += chunk;
					repository.inputBox.value = accumulatedMessage;
				}
			}
		);

		vscode.window.setStatusBarMessage("Commity: Commit message generated!", 5000);
	} catch (error) {
		if (error instanceof Error) {
			if (error.name === "AbortError") {
				vscode.window.setStatusBarMessage("Commity: Generation cancelled", 5000);
				return;
			}

			if (/(ECONNREFUSED|ENOTFOUND|fetch failed|network)/i.test(error.message)) {
				vscode.window.showErrorMessage(
					"Commity: Unable to reach Commity service. Check your internet connection or base URL."
				);
				return;
			}

			if (error.message.includes("429") || error.message.toLowerCase().includes("rate limit")) {
				vscode.window.showErrorMessage(
					"Commity: Rate limit exceeded. Please try again in a moment."
				);
				return;
			}

			if (error.message.includes("500") || error.message.includes("503")) {
				vscode.window.showErrorMessage(
					"Commity: Service temporarily unavailable. Please try again later."
				);
				return;
			}

			if (
				error.message.includes("400") ||
				error.message.includes("401") ||
				error.message.includes("403")
			) {
				vscode.window.showErrorMessage(
					"Commity: Invalid request. Please check your configuration."
				);
				return;
			}
		}

		vscode.window.showErrorMessage(
			`Commity: Failed to generate commit message. ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
};
