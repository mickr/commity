import * as vscode from "vscode";

export const generateCommitMessage = async () => {
	const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
	const git = gitExtension?.getAPI(1);

	const repository = git.repositories[0];

	if (!repository) {
		vscode.window.showWarningMessage("No Git repository found");
		return;
	}

	const testMessage = "test message";

	repository.inputBox.value = testMessage;
	vscode.window.showInformationMessage("Commit message generated!");
};
