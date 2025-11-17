import * as vscode from "vscode";
import { generateCommitMessage } from "./commands/generateCommitMessage";
import { ReflogWebviewProvider } from "./providers/reflogWebviewProvider";

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand(
		"commity.generateCommitMessage",
		(sourceControl: vscode.SourceControl) => generateCommitMessage(sourceControl, context)
	);

	const reflogProvider = new ReflogWebviewProvider(context.extensionUri, context);
	const reflogView = vscode.window.registerWebviewViewProvider(
		ReflogWebviewProvider.viewType,
		reflogProvider
	);

	const refreshReflogCommand = vscode.commands.registerCommand("commity.refreshReflog", () => {
		reflogProvider.refresh();
	});

	context.subscriptions.push(disposable, refreshReflogCommand, reflogView);
}

export function deactivate() {}
