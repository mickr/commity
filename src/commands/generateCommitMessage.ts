import * as vscode from "vscode";
import { FireworksProvider } from "../services/ai-providers/fireworks";
import { generateCommitMessagePrompt } from "../services/prompts";

export const generateCommitMessage = async (context: vscode.ExtensionContext) => {
	const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
	const git = gitExtension?.getAPI(1);

	const repository = git.repositories[0];
	const client = new FireworksProvider(context.extensionMode === vscode.ExtensionMode.Development);

	if (!repository) {
		vscode.window.showWarningMessage("No Git repository found");
		return;
	}

	const message = await client.generateText(generateCommitMessagePrompt());

	console.log(message);

	const commitMessage = message;

	repository.inputBox.value = commitMessage;

	vscode.window.showInformationMessage("Commit message generated!");
};
