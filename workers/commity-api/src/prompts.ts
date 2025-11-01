export const defaultGeneralPrompt = `
You will be generating a Git commit message based on file changes presented in unified diff format.

Input format:
- Each file section starts with: File: <path>
- Followed by either the word "deleted" (for removed files) or a unified diff patch
- Diff line prefixes:
  + = added line
  - = removed line
  (space) = context line (unchanged)
  @@, +++, --- = metadata headers
- Binary files may show "Binary files differ"

Your task is to analyze these changes and generate a commit message that describes what was modified, added, or removed. Focus on the user-visible purpose and logical intent of the changes.

Consider:
- What functionality is being added, modified, or removed?
- Are these bug fixes, new features, refactoring, or maintenance changes?
- Group related changes by logical intent rather than listing every file

Commit message guidelines:
- Use the imperative mood (e.g., "Add feature" not "Added feature")
- Start with a capital letter
- Do not end lines with a period
- Focus on what the change accomplishes, not how it was implemented
- Never sign the commit or state it was generated with an LLM
`;

export const defaultCommitMessagePrompt = `
${defaultGeneralPrompt}

<changes>
{{changes}}
</changes>

Output format:
- Subject line (one line, 50-72 characters)
- Optionally, a blank line followed by bullet points for significant changes
- Each bullet starts with "- ", capitalized, no trailing period

Examples:
Add user authentication system

Fix memory leak in data processing
- Release resources after processing each batch
- Add cleanup handler for interrupted operations

Update dependencies to latest versions
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
	override?: string,
): string {
	const changesText = diffs
		.map(({ path, diff }) => `File: ${path}\n${diff}`)
		.join("\n\n");

	const systemPrompt = override
		? `${defaultGeneralPrompt}\n\n${override}`
		: defaultCommitMessagePrompt;

	return systemPrompt
		.replace(/\{\{changes\}\}/g, changesText)
		.replace(/\{\{branch\}\}/g, branch)
		.replace(/\{\{author\}\}/g, author);
}

export function buildChunkPrompt(files: DiffEntry[]): string {
	const changesText = files
		.map(({ path, diff }) => `File: ${path}\n${diff}`)
		.join("\n\n");

	return `Analyze file changes presented in unified diff format and provide a detailed explanation.

Input format:
- Each file section starts with: File: <path>
- Followed by either the word "deleted" (for removed files) or a unified diff patch
- Diff line prefixes:
  + = added line
  - = removed line
  (space) = context line (unchanged)
  @@, +++, --- = metadata headers
- Binary files may show "Binary files differ"

<changes>
${changesText}
</changes>

Provide a detailed explanation of the changes. For each significant change, describe:
- What changed and why it matters
- The functional impact or purpose
- Group related changes together

Use bullet points (starting with "- ", capitalized, no trailing period) for clarity. Be thorough but concise.

Return only the explanation without any additional text or formatting.`;
}

export function buildFinalPrompt(
	summaries: string[],
	branch: string,
	author: string,
	override?: string,
): string {
	const combinedSummaries = summaries
		.map((s, i) => `Chunk ${i + 1}:\n${s}`)
		.join("\n\n");

	const basePrompt =
		override ||
		`Generate a Git commit message based on detailed explanations of file changes.

Below are explanations from different parts of the changeset:

<summaries>
${combinedSummaries}
</summaries>

Your task is to create a cohesive commit message that captures all the changes.

Output format:
- Subject line (one line, 50-72 characters, imperative mood)
- Optionally, a blank line followed by bullet points for significant changes
- Each bullet starts with "- ", capitalized, no trailing period

Guidelines:
- Use the imperative mood (e.g., "Add feature" not "Added feature")
- Start with a capital letter
- Focus on what the change accomplishes
- Group related changes logically
- Never sign the commit or state it was generated with an LLM

Return only the commit message without any additional text, explanations, or formatting.`;

	return basePrompt;
}
