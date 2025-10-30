export const defaultGeneralPrompt = `
You will be generating a Git commit message based on a list of file changes and their diffs. Here are the changes that have been made to the repository:
They will be separated by a File and include a patch of the changes. Additons will be prepended with a "+" and subtractions with a "-". If a file is deleted, it will be listed as "deleted". You must summarize the entire change set.

Your task is to analyze these changes and generate a single, concise commit message that accurately describes what was modified, added, or removed. It is acceptable to use multiple lines if the changes span multiple files or directories.
use the following format:

- <change description>
- <change description>
- <change description>

Analyze the provided changes and determine the primary purpose or effect of the modifications. Consider:
- What functionality is being added, modified, or removed?
- Are these bug fixes, new features, refactoring, or maintenance changes?
- What is the most important change if there are multiple modifications?

There may be multiple changes in the diff, so focus on all the changes and use bullet points to describe the changes deemed as significant.
<changes>
{{changes}}
</changes>


Follow these guidelines for creating an effective commit message:

- Keep it short and concise (ideally under 50 characters, but up to 72 is acceptable)
- Use the imperative mood (e.g., "Add feature" not "Added feature" or "Adding feature")
- Start with a capital letter
- Do not end with a period
- Focus on what the change accomplishes, not how it was implemented
- If multiple files were changed for a single logical purpose, describe that purpose
- If changes span multiple unrelated areas, try to identify the most significant change
- Never sign the commit or state it was generated with an LLM
`;

export const defaultCommitMessagePrompt = `
${defaultGeneralPrompt}

Here are some examples of good commit messages for different types of changes:
- "Add user authentication system"
- "Fix memory leak in data processing"
- "Update dependencies to latest versions"
- "Remove deprecated API endpoints"
- "Refactor database connection logic"
- "Add unit tests for payment module"

Return only the commit message without any additional text, explanations, or formatting.
`;

interface DiffEntry {
	path: string;
	diff: string;
}

export function buildPrompt(
	diffs: DiffEntry[],
	branch: string,
	author: string,
	override?: string
): string {
	const changesText = diffs
		.map(({ path, diff }) => `File: ${path}\n${diff}`)
		.join("\n\n");

	const systemPrompt = override
		? `${defaultGeneralPrompt}\n\n${override}`
		: defaultCommitMessagePrompt;
		
	return  systemPrompt
		.replace(/\{\{changes\}\}/g, changesText)
		.replace(/\{\{branch\}\}/g, branch)
		.replace(/\{\{author\}\}/g, author);
}
