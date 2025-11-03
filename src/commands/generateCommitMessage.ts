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
					
					let formatted = accumulatedMessage;
					if (formatted.includes("- ")) {
						formatted = formatted
							.replace(/^(.+?)- /, "$1\n\n- ")
							.replace(/- ([^-]+?)- /g, "- $1\n- ");
					}
					
					repository.inputBox.value = formatted;
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

			if (error.message.includes("400") || error.message.includes("401") || error.message.includes("403")) {
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
