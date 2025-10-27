import * as vscode from "vscode";
import { readConfiguration } from "./services/config";
import { generateCommitMessage } from "./commands/generateCommitMessage";

export function activate(context: vscode.ExtensionContext) {
	vscode.window.showInformationMessage("Commity extension is now active");

	const configuration = readConfiguration(context);
	const configurationTemplate = configuration.success
		? (configuration.data ?? "Default commit message prompt")
		: "Default commit message prompt	";

	const disposable = vscode.commands.registerCommand("commity.generateCommitMessage", () =>
		generateCommitMessage(configurationTemplate)
	);

	context.subscriptions.push(disposable);
}

export function deactivate() {}
