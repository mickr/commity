import * as vscode from "vscode";
import { generateCommitMessagePrompt } from "../services/prompts";

export const generateCommitMessage = async () => {
	const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
	const git = gitExtension?.getAPI(1);

	const repository = git.repositories[0];

	if (!repository) {
		vscode.window.showWarningMessage("No Git repository found");
		return;
	}

	const testMessage = generateCommitMessagePrompt();

	repository.inputBox.value = testMessage;
	vscode.window.showInformationMessage("Commit message generated!");
};
