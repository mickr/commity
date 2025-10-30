import { readConfiguration } from "./config";
import { getCurrentAuthor, getCurrentBranch, getStagedDiff } from "./git";

const templateVariables = {
	changes: "{{changes}}",
	branch: "{{branch}}",
	author: "{{author}}",
};

export const defaultCommitMessagePrompt = `
Here are some examples of good commit messages for different types of changes:
- "Add user authentication system"
- "Fix memory leak in data processing"
- "Update dependencies to latest versions"
- "Remove deprecated API endpoints"
- "Refactor database connection logic"
- "Add unit tests for payment module"

Analyze the provided changes and determine the primary purpose or effect of the modifications. Consider:
- What functionality is being added, modified, or removed?
- Are these bug fixes, new features, refactoring, or maintenance changes?
- What is the most important change if there are multiple modifications?

Return only the commit message without any additional text, explanations, or formatting.
    `;

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
