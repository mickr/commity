export const multilineCommitMessages = {
	simple: {
		raw: "Add user authentication",
		escaped: "Add user authentication",
		lines: ["Add user authentication"],
	},
	withBullets: {
		raw: "Add user authentication\n\n- Implement JWT validation\n- Add session middleware\n- Update error handling",
		escaped: "Add user authentication\\n\\n- Implement JWT validation\\n- Add session middleware\\n- Update error handling",
		lines: [
			"Add user authentication",
			"",
			"- Implement JWT validation",
			"- Add session middleware",
			"- Update error handling",
		],
	},
	refactoring: {
		raw: "Refactor API endpoints\n\n- Migrate to REST architecture\n- Add proper error responses\n- Implement rate limiting\n- Update documentation",
		escaped: "Refactor API endpoints\\n\\n- Migrate to REST architecture\\n- Add proper error responses\\n- Implement rate limiting\\n- Update documentation",
		lines: [
			"Refactor API endpoints",
			"",
			"- Migrate to REST architecture",
			"- Add proper error responses",
			"- Implement rate limiting",
			"- Update documentation",
		],
	},
	bugFix: {
		raw: "Fix memory leak in data processing\n\n- Release resources after each batch\n- Add cleanup handler for interruptions\n- Update resource pooling logic",
		escaped: "Fix memory leak in data processing\\n\\n- Release resources after each batch\\n- Add cleanup handler for interruptions\\n- Update resource pooling logic",
		lines: [
			"Fix memory leak in data processing",
			"",
			"- Release resources after each batch",
			"- Add cleanup handler for interruptions",
			"- Update resource pooling logic",
		],
	},
	withDescription: {
		raw: "Update authentication system\n\n- Replace session-based auth with JWT\n- Add refresh token rotation\n- Implement RBAC\n\nThis improves security and scalability",
		escaped: "Update authentication system\\n\\n- Replace session-based auth with JWT\\n- Add refresh token rotation\\n- Implement RBAC\\n\\nThis improves security and scalability",
		lines: [
			"Update authentication system",
			"",
			"- Replace session-based auth with JWT",
			"- Add refresh token rotation",
			"- Implement RBAC",
			"",
			"This improves security and scalability",
		],
	},
	manyBullets: {
		raw: "Update dependencies\n\n- Upgrade React to v18\n- Update TypeScript to v5\n- Bump ESLint to latest\n- Update testing libraries\n- Migrate to Vitest\n- Update build tools\n- Upgrade Node dependencies",
		escaped: "Update dependencies\\n\\n- Upgrade React to v18\\n- Update TypeScript to v5\\n- Bump ESLint to latest\\n- Update testing libraries\\n- Migrate to Vitest\\n- Update build tools\\n- Upgrade Node dependencies",
		lines: [
			"Update dependencies",
			"",
			"- Upgrade React to v18",
			"- Update TypeScript to v5",
			"- Bump ESLint to latest",
			"- Update testing libraries",
			"- Migrate to Vitest",
			"- Update build tools",
			"- Upgrade Node dependencies",
		],
	},
	multipleBlankLines: {
		raw: "Add feature flag system\n\n\n- Create feature flag service\n\n\n- Add configuration management\n\n\n- Update deployment pipeline",
		escaped: "Add feature flag system\\n\\n\\n- Create feature flag service\\n\\n\\n- Add configuration management\\n\\n\\n- Update deployment pipeline",
		lines: [
			"Add feature flag system",
			"",
			"",
			"- Create feature flag service",
			"",
			"",
			"- Add configuration management",
			"",
			"",
			"- Update deployment pipeline",
		],
	},
};

export const sseChunks = {
	simple: {
		chunks: ["data: Add user authentication\n"],
		expected: "Add user authentication",
	},
	withNewlines: {
		chunks: [
			"data: Add feature\n",
			"data: \\n\n",
			"data: \\n\n",
			"data: - First bullet\n",
			"data: \\n\n",
			"data: - Second bullet\n",
		],
		expected: "Add feature\n\n- First bullet\n- Second bullet",
	},
	splitAcrossReads: {
		reads: [
			["data: Update API\n", "data: \\n\n"],
			["data: \\n\n", "data: - Refactor\n"],
			["data: \\n\n", "data: - Add tests\n"],
		],
		expected: "Update API\n\n- Refactor\n- Add tests",
	},
	partialLines: {
		reads: [
			["data: Fix bug"],
			["s\n", "data: \\n\n"],
			["data: - Clean up\n"],
		],
		expected: "Fix bugs\n- Clean up",
	},
	realWorldExample: {
		chunks: [
			"data: Implement user profile management\n",
			"data: \\n\n",
			"data: \\n\n",
			"data: - Add profile CRUD operations\n",
			"data: \\n\n",
			"data: - Implement avatar upload\n",
			"data: \\n\n",
			"data: - Add profile validation\n",
			"data: \\n\n",
			"data: - Update API documentation\n",
		],
		expected: "Implement user profile management\n\n- Add profile CRUD operations\n- Implement avatar upload\n- Add profile validation\n- Update API documentation",
	},
};

export const edgeCases = {
	onlyNewlines: {
		raw: "\n\n\n",
		escaped: "\\n\\n\\n",
		sse: ["data: \\n\n", "data: \\n\n", "data: \\n\n"],
	},
	literalBackslashN: {
		raw: "Text with \\n literal backslash\nand real newline",
		note: "Server should only escape actual newlines, not literal \\n in text",
	},
	trailingNewline: {
		raw: "Commit message\n",
		escaped: "Commit message\\n",
		sse: ["data: Commit message\n", "data: \\n\n"],
	},
	leadingNewline: {
		raw: "\nCommit message",
		escaped: "\\nCommit message",
		sse: ["data: \\n\n", "data: Commit message\n"],
	},
	emptyString: {
		raw: "",
		escaped: "",
		sse: [],
	},
	singleNewline: {
		raw: "\n",
		escaped: "\\n",
		sse: ["data: \\n\n"],
	},
};

export const promptFormatExamples = {
	format1: {
		description: "Subject only",
		example: "Add user authentication",
	},
	format2: {
		description: "Subject with bullets",
		example: "Add user authentication\n\n- Implement JWT validation\n- Add session middleware",
	},
	format3: {
		description: "Subject, bullets, and description",
		example: "Update API structure\n\n- Refactor endpoints\n- Add versioning\n\nThis modernizes the API",
	},
	format4: {
		description: "Complex multi-section",
		example: "Major refactoring\n\n- Update architecture\n- Migrate database\n- Refactor services\n\nBreaking changes:\n- Old API removed\n- New auth required",
	},
};

export function createSSEStream(message: string): string {
	return message
		.split("\n")
		.map((line) => `data: ${line}\ndata: \\n\n`)
		.slice(0, -1)
		.join("");
}

export function createSSEChunks(message: string): string[] {
	const chunks: string[] = [];
	for (const char of message) {
		if (char === "\n") {
			chunks.push("data: \\n\n");
		} else {
			chunks.push(`data: ${char}\n`);
		}
	}
	return chunks;
}

export function simulateIncrementalSSE(message: string, chunkSize: number = 5): string[][] {
	const allChunks = createSSEChunks(message);
	const reads: string[][] = [];

	for (let i = 0; i < allChunks.length; i += chunkSize) {
		reads.push(allChunks.slice(i, i + chunkSize));
	}

	return reads;
}
