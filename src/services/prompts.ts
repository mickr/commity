import { readConfiguration } from "./config";
import { getCurrentAuthor, getCurrentBranch, getStagedDiff } from "./git";

const templateVariables = {
	changes: "{{changes}}",
	branch: "{{branch}}",
	author: "{{author}}",
};
export function parseTemplate(template: string) {
	const diffs = getStagedDiff();
	const branch = getCurrentBranch();
	const author = getCurrentAuthor();

	const changesText = Object.entries(diffs)
		.map(([filePath, { diff }]) => `File: ${filePath}\n${diff}`)
		.join("\n\n");

	return template
		.replace(templateVariables.changes, changesText)
		.replace(templateVariables.branch, branch)
		.replace(templateVariables.author, author);
}

export const defaultCommitMessagePrompt = `
    You are a helpful assistant that generates commit messages for a Git repository.
    You are given a list of changes that have been made to the repository. Each change is a file and the diff of the changes.
    You need to generate a commit message for the changes. Keep it short and concise but still descriptive of the changes in the diff.
    {{changes}} 
    `;

export function getConfigDrivenPrompt() {
	const configDrivenPrompt = readConfiguration();

	if (!configDrivenPrompt.success) {
		return defaultCommitMessagePrompt;
	}

	const systemPrompt = `
    You are a helpful assistant that generates commit messages for a Git repository.
    You are given a list of changes that have been made to the repository. Each change is a file and the diff of the changes.
    You need to generate a commit message for the changes.
    The commit message should follow the following instructions:
    ${configDrivenPrompt.data}

    {{changes}} 
    `;

	return parseTemplate(systemPrompt);
}

export const generateCommitMessagePrompt = () => {
	return parseTemplate(getConfigDrivenPrompt());
};
