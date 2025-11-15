import * as vscode from "vscode";
import { generateCommitMessage } from "./commands/generateCommitMessage";
import { CommitsViewProvider, CommitItem } from "./providers/commitsView";

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand(
		"commity.generateCommitMessage",
		(sourceControl: vscode.SourceControl) => generateCommitMessage(sourceControl, context)
	);

	const commitsViewProvider = new CommitsViewProvider(context);
	const commitsView = vscode.window.createTreeView("commity.commits", {
		treeDataProvider: commitsViewProvider,
		canSelectMany: true,
	});

	let selectionToken = 0;
	let singleSelectionTimer: NodeJS.Timeout | undefined;

	const selectionListener = commitsView.onDidChangeSelection(({ selection }) => {
		selectionToken += 1;

		if (singleSelectionTimer) {
			clearTimeout(singleSelectionTimer);
		}

		if (selection.length === 1) {
			const token = selectionToken;
			const commit = selection[0];

			singleSelectionTimer = setTimeout(() => {
				if (token === selectionToken) {
					void commitsViewProvider.showCommitDiff(commit, { preserveFocus: true });
				}
			}, 120);
		} else {
			singleSelectionTimer = undefined;
		}
	});

	const getSelection = (
		commit?: CommitItem,
		multiSelection?: readonly CommitItem[]
	): readonly CommitItem[] => {
		return (
			(multiSelection && multiSelection.length > 0 && multiSelection) ||
			(commitsView.selection.length > 0 && commitsView.selection) ||
			(commit ? [commit] : [])
		);
	};

	const refreshCommand = vscode.commands.registerCommand("commity.refreshCommits", () => {
		commitsViewProvider.refresh();
	});

	const showCommitDiffCommand = vscode.commands.registerCommand(
		"commity.showCommitDiff",
		(commit?: CommitItem, multiSelection?: readonly CommitItem[]) => {
			const selection = getSelection(commit, multiSelection);

			if (!selection || selection.length === 0) {
				void vscode.window.showWarningMessage("No commits selected");
				return;
			}

			void commitsViewProvider.showCommitDiff(selection);
		}
	);

	const squashCommitsCommand = vscode.commands.registerCommand(
		"commity.squashCommits",
		(commit?: CommitItem, multiSelection?: readonly CommitItem[]) => {
			const selection = getSelection(commit, multiSelection);

			if (!selection || selection.length === 0) {
				void vscode.window.showWarningMessage("No commits selected");
				return;
			}

			if (!commitsViewProvider.areCommitsContiguous(selection)) {
				void vscode.window.showWarningMessage("Select contiguous commits to squash");
				return;
			}

			const commitRange =
				selection.length === 1
					? selection[0].hash
					: `${selection[0].hash} → ${selection[selection.length - 1].hash}`;

			void vscode.window
				.showWarningMessage(
					`Squash ${selection.length} commit(s) (${commitRange})?`,
					"Squash",
					"Cancel"
				)
				.then((choice) => {
					if (choice !== "Squash") {
						return;
					}
					void vscode.window.showInformationMessage("Squashing commits not implemented yet.");
				});
		}
	);

	context.subscriptions.push(
		disposable,
		commitsView,
		refreshCommand,
		showCommitDiffCommand,
		squashCommitsCommand,
		selectionListener
	);

	context.subscriptions.push({
		dispose: () => {
			if (singleSelectionTimer) {
				clearTimeout(singleSelectionTimer);
			}
		},
	});
}

export function deactivate() {}
