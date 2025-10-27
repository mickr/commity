import * as vscode from "vscode";
import { getStagedDiff, getCurrentBranch } from "../services/git";

export const generateCommitMessage = async (promptTemplate: string) => {
	const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
	const git = gitExtension?.getAPI(1);

	const repository = git.repositories[0];

	if (!repository) {
		vscode.window.showWarningMessage("No Git repository found");
		return;
	}

	const stagedDiff = getStagedDiff();
	const currentBranch = getCurrentBranch();

	console.log("Current branch:", currentBranch);
	console.log("Staged diff:", stagedDiff);

	const testMessage = promptTemplate;

	repository.inputBox.value = testMessage;
	vscode.window.showInformationMessage("Commit message generated!");
};
