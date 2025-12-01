import * as vscode from "vscode";
import { generateCommitMessage } from "./commands/generateCommitMessage";

import { ReflogWebviewProvider } from "./providers/reflogWebviewProvider";
import { GitContentProvider } from "./providers/gitContentProvider";
import { initFireworksProvider } from "./services/ai-providers/fireworks";

export function activate(context: vscode.ExtensionContext) {
	initFireworksProvider(context.extensionMode === vscode.ExtensionMode.Development);
	const disposable = vscode.commands.registerCommand(
		"commity.generateCommitMessage",
		(sourceControl: vscode.SourceControl) => generateCommitMessage(sourceControl, context)
	);

	const reflogProvider = new ReflogWebviewProvider(context.extensionUri, context);
	const reflogView = vscode.window.registerWebviewViewProvider(
		ReflogWebviewProvider.viewType,
		reflogProvider
	);

	const gitContentProvider = new GitContentProvider(context);

	const refreshReflogCommand = vscode.commands.registerCommand("commity.refreshReflog", () => {
		reflogProvider.refresh();
	});

	const focusUpCommand = vscode.commands.registerCommand("commity.reflog.focusUp", () => {
		reflogProvider.focusUp();
	});

	const focusDownCommand = vscode.commands.registerCommand("commity.reflog.focusDown", () => {
		reflogProvider.focusDown();
	});

	const selectEntryCommand = vscode.commands.registerCommand("commity.reflog.select", () => {
		reflogProvider.selectEntry();
	});

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(
			GitContentProvider.scheme,
			gitContentProvider
		),
		disposable,
		refreshReflogCommand,
		reflogView,
		focusUpCommand,
		focusDownCommand,
		selectEntryCommand
	);
}

export function deactivate() {}
