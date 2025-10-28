import * as vscode from "vscode";
import { generateCommitMessage } from "./commands/generateCommitMessage";

export function activate(context: vscode.ExtensionContext) {
	vscode.window.showInformationMessage("Commity extension is now active");

	const disposable = vscode.commands.registerCommand("commity.generateCommitMessage", () =>
		generateCommitMessage()
	);

	context.subscriptions.push(disposable);
}

export function deactivate() {}
