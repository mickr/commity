import * as vscode from "vscode";
import { generateCommitMessage } from "./commands/generateCommitMessage";

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand("commity.generateCommitMessage", () =>
		generateCommitMessage(context)
	);

	context.subscriptions.push(disposable);
}

export function deactivate() {}
