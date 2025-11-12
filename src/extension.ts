import * as vscode from "vscode";
import { generateCommitMessage } from "./commands/generateCommitMessage";
import { CommitsViewProvider } from "./providers/commitsView";

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

	const refreshCommand = vscode.commands.registerCommand("commity.refreshCommits", () => {
		commitsViewProvider.refresh();
	});

	const showCommitDiffCommand = vscode.commands.registerCommand(
		"commity.showCommitDiff",
		(commit) => commitsViewProvider.showCommitDiff(commitsView.selection.length > 0 ? commitsView.selection : commit)
	);

	context.subscriptions.push(disposable, commitsView, refreshCommand, showCommitDiffCommand);
}

export function deactivate() {}
