import { 
	buildPrompt, 
	buildFolderPrompt,
	buildSynthesisPrompt,
	defaultGeneralPrompt, 
	defaultCommitMessagePrompt 
} from "../prompts";

describe("buildPrompt", () => {
	const mockDiffs = [
		{
			path: "src/index.ts",
			diff: `@@ -1,3 +1,4 @@
+import { newFunction } from './utils';
 export function main() {
   console.log('Hello');
 }`
		},
		{
			path: "src/utils.ts",
			diff: `@@ -0,0 +1,3 @@
+export function newFunction() {
+  return true;
+}`
		}
	];

	it("replaces {{changes}} placeholder with formatted diffs", () => {
		const result = buildPrompt(mockDiffs, "main", "test@example.com");

		expect(result).toContain("File: src/index.ts");
		expect(result).toContain(mockDiffs[0].diff);
		expect(result).toContain("File: src/utils.ts");
		expect(result).toContain(mockDiffs[1].diff);
	});

	it("uses defaultCommitMessagePrompt when no override provided", () => {
		const result = buildPrompt(mockDiffs, "main", "test@example.com");

		expect(result).toContain("You will be generating a Git commit message");
		expect(result).toContain("Add user authentication system");
		expect(result).toContain("Fix memory leak in data processing");
	});

	it("interpolates {{branch}} in user override", () => {
		const override = "Focus on changes for the {{branch}} branch";
		const result = buildPrompt(mockDiffs, "feature/auth-system", "test@example.com", override);

		expect(result).toContain("Focus on changes for the feature/auth-system branch");
		expect(result).not.toContain("{{branch}}");
	});

	it("interpolates {{author}} in user override", () => {
		const override = "Generate commit as {{author}} would write it";
		const result = buildPrompt(mockDiffs, "main", "john@company.com", override);

		expect(result).toContain("Generate commit as john@company.com would write it");
		expect(result).not.toContain("{{author}}");
	});

	it("interpolates multiple template variables in user override", () => {
		const override = "Branch: {{branch}}, Author: {{author}}, Changes: {{changes}}";
		const result = buildPrompt(mockDiffs, "develop", "jane@company.com", override);

		expect(result).toContain("Branch: develop");
		expect(result).toContain("Author: jane@company.com");
		expect(result).toContain("File: src/index.ts");
		expect(result).not.toContain("{{branch}}");
		expect(result).not.toContain("{{author}}");
		expect(result).not.toContain("{{changes}}");
	});

	it("interpolates all variables in complex user configuration", () => {
		const userConfig = `
Create a commit message following these rules:
- Project branch: {{branch}}
- Commit author: {{author}}
- Use conventional commits format
- Focus on business impact

Changes to process:
{{changes}}

Return only the commit message, no explanation.
`;
		const result = buildPrompt(
			[{ path: "api/users.ts", diff: "+export function getUser() {}" }],
			"feature/user-api",
			"dev@startup.io",
			userConfig
		);

		expect(result).toContain("Project branch: feature/user-api");
		expect(result).toContain("Commit author: dev@startup.io");
		expect(result).toContain("File: api/users.ts");
		expect(result).toContain("+export function getUser() {}");
		expect(result).not.toContain("{{branch}}");
		expect(result).not.toContain("{{author}}");
		expect(result).not.toContain("{{changes}}");
	});

	it("prepends defaultGeneralPrompt when user override is provided", () => {
		const override = "Use conventional commits with type prefix.";
		const result = buildPrompt(mockDiffs, "main", "test@example.com", override);

		expect(result).toContain("unified diff format");
		expect(result).toContain("+ = added line");
		expect(result).toContain("Use conventional commits with type prefix");
	});

	it("ensures user override still has access to {{changes}}, {{branch}}, {{author}}", () => {
		const override = `Context: branch={{branch}}, author={{author}}

{{changes}}

Generate a conventional commit message.`;
		const result = buildPrompt(
			[{ path: "test.ts", diff: "+const x = 1;" }],
			"develop",
			"alice@example.com",
			override
		);

		expect(result).toContain("Context: branch=develop, author=alice@example.com");
		expect(result).toContain("File: test.ts");
		expect(result).toContain("+const x = 1;");
		expect(result).toContain("unified diff format"); // from defaultGeneralPrompt
	});

	it("handles empty diffs array", () => {
		const result = buildPrompt([], "main", "test@example.com");

		expect(result).toBeDefined();
		expect(result).toContain("You will be generating a Git commit message");
	});

	it("handles single diff entry", () => {
		const singleDiff = [mockDiffs[0]];
		const result = buildPrompt(singleDiff, "main", "test@example.com");

		expect(result).toContain("File: src/index.ts");
		expect(result).toContain(mockDiffs[0].diff);
		expect(result).not.toContain("File: src/utils.ts");
	});

	it("formats multiple diffs with double newlines between them", () => {
		const result = buildPrompt(mockDiffs, "main", "test@example.com");

		expect(result).toMatch(/File: src\/index\.ts\n.*\n\nFile: src\/utils\.ts/s);
	});
});

describe("defaultGeneralPrompt", () => {
	it("explains unified diff format", () => {
		expect(defaultGeneralPrompt).toContain("unified diff format");
		expect(defaultGeneralPrompt).toContain("+ = added line");
		expect(defaultGeneralPrompt).toContain("- = removed line");
	});

	it("includes guidance on commit message format", () => {
		expect(defaultGeneralPrompt).toContain("imperative mood");
		expect(defaultGeneralPrompt).toContain("capital letter");
	});

	it("warns against signing commits", () => {
		expect(defaultGeneralPrompt).toContain("Never sign the commit");
	});

	it("mentions deleted files", () => {
		expect(defaultGeneralPrompt).toContain("deleted");
	});

	it("mentions binary files", () => {
		expect(defaultGeneralPrompt).toContain("Binary files");
	});
});

describe("defaultCommitMessagePrompt", () => {
	it("includes the general prompt", () => {
		expect(defaultCommitMessagePrompt).toContain("unified diff format");
	});

	it("includes example commit messages", () => {
		expect(defaultCommitMessagePrompt).toContain("Add user authentication system");
		expect(defaultCommitMessagePrompt).toContain("Fix memory leak in data processing");
	});

	it("specifies output format", () => {
		expect(defaultCommitMessagePrompt).toContain("Output format:");
		expect(defaultCommitMessagePrompt).toContain("Subject line");
		expect(defaultCommitMessagePrompt).toContain("50-72 characters");
	});

	it("instructs to return only the commit message", () => {
		expect(defaultCommitMessagePrompt).toContain("Return only the commit message");
	});
});

describe("buildFolderPrompt", () => {
	const mockFiles = [
		{
			path: "src/auth/login.ts",
			diff: `@@ -1,3 +1,5 @@
+import bcrypt from 'bcrypt';
+
 export function login(user: string, password: string) {
-  return user === 'admin' && password === 'admin';
+  return verifyPassword(user, password);
 }`
		},
		{
			path: "src/auth/logout.ts",
			diff: `@@ -0,0 +1,3 @@
+export function logout(sessionId: string) {
+  return clearSession(sessionId);
+}`
		}
	];

	it("includes folder path in prompt", () => {
		const result = buildFolderPrompt("src/auth", mockFiles);

		expect(result).toContain("Folder: src/auth");
	});

	it("includes number of files", () => {
		const result = buildFolderPrompt("src/auth", mockFiles);

		expect(result).toContain("Number of files: 2");
	});

	it("formats all files with paths and diffs", () => {
		const result = buildFolderPrompt("src/auth", mockFiles);

		expect(result).toContain("File: src/auth/login.ts");
		expect(result).toContain(mockFiles[0].diff);
		expect(result).toContain("File: src/auth/logout.ts");
		expect(result).toContain(mockFiles[1].diff);
	});

	it("requests concise summary", () => {
		const result = buildFolderPrompt("src/auth", mockFiles);

		expect(result).toContain("concise summary");
		expect(result).toContain("overall functional purpose");
	});

	it("provides examples", () => {
		const result = buildFolderPrompt("src/auth", mockFiles);

		expect(result).toContain("Add authentication middleware");
		expect(result).toContain("Refactor API routes");
	});

	it("instructs to return only summary", () => {
		const result = buildFolderPrompt("src/auth", mockFiles);

		expect(result).toContain("Return only the summary");
	});

	it("handles single file in folder", () => {
		const result = buildFolderPrompt("src/utils", [mockFiles[0]]);

		expect(result).toContain("Folder: src/utils");
		expect(result).toContain("Number of files: 1");
		expect(result).toContain("File: src/auth/login.ts");
	});

	it("handles root directory", () => {
		const rootFiles = [
			{ path: "package.json", diff: "+dependency" },
			{ path: "README.md", diff: "+docs" }
		];
		const result = buildFolderPrompt(".", rootFiles);

		expect(result).toContain("Folder: .");
		expect(result).toContain("Number of files: 2");
	});

	it("separates files with double newlines", () => {
		const result = buildFolderPrompt("src/auth", mockFiles);

		expect(result).toMatch(/File: src\/auth\/login\.ts\n.*\n\nFile: src\/auth\/logout\.ts/s);
	});
});

describe("buildSynthesisPrompt", () => {
	it("handles folder summaries", () => {
		const folderSummaries = [
			{ folder: "src/auth", summary: "Add authentication middleware and session handling" },
			{ folder: "src/api", summary: "Update API routes to use new error handling" }
		];

		const result = buildSynthesisPrompt(folderSummaries);

		expect(result).toContain("src/auth: Add authentication middleware");
		expect(result).toContain("src/api: Update API routes");
	});

	it("handles file summaries (backward compatibility)", () => {
		const fileSummaries = [
			{ path: "src/auth/login.ts", summary: "Add bcrypt password hashing" },
			{ path: "src/auth/logout.ts", summary: "Implement session clearing" }
		];

		const result = buildSynthesisPrompt(fileSummaries);

		expect(result).toContain("src/auth/login.ts: Add bcrypt");
		expect(result).toContain("src/auth/logout.ts: Implement session");
	});

	it("handles mixed folder and path summaries", () => {
		const mixedSummaries = [
			{ folder: "src/auth", summary: "Authentication updates" },
			{ path: "README.md", summary: "Documentation changes" }
		];

		const result = buildSynthesisPrompt(mixedSummaries);

		expect(result).toContain("src/auth: Authentication updates");
		expect(result).toContain("README.md: Documentation changes");
	});

	it("specifies commit message format", () => {
		const summaries = [{ folder: "src", summary: "Changes" }];
		const result = buildSynthesisPrompt(summaries);

		expect(result).toContain("Subject line: 50-72 chars");
		expect(result).toContain("imperative mood");
		expect(result).toContain("capitalize");
	});

	it("includes guidelines", () => {
		const summaries = [{ folder: "src", summary: "Changes" }];
		const result = buildSynthesisPrompt(summaries);

		expect(result).toContain("Focus on WHAT changed");
		expect(result).toContain("Keep bullets concise");
	});

	it("includes formatting instructions", () => {
		const summaries = [{ folder: "src", summary: "Changes" }];
		const result = buildSynthesisPrompt(summaries);

		expect(result).toContain("Format:");
		expect(result).toContain("Subject line:");
	});

	it("handles empty summaries array", () => {
		const result = buildSynthesisPrompt([]);

		expect(result).toBeDefined();
		expect(result).toContain("Generate a Git commit message");
	});

	it("instructs to return only commit message", () => {
		const summaries = [{ folder: "src", summary: "Changes" }];
		const result = buildSynthesisPrompt(summaries);

		expect(result).toContain("Return only the commit message");
	});

	it("handles summary without folder or path (fallback)", () => {
		const summaries = [{ summary: "Some changes" }];
		const result = buildSynthesisPrompt(summaries);

		expect(result).toContain("unknown: Some changes");
	});

	it("replaces {{branch}} template variable in override", () => {
		const summaries = [{ folder: "src", summary: "Changes" }];
		const override = "Generate commit for branch: {{branch}}";
		const result = buildSynthesisPrompt(summaries, "feature/auth", "test@example.com", override);

		expect(result).toContain("Generate commit for branch: feature/auth");
		expect(result).not.toContain("{{branch}}");
	});

	it("replaces {{author}} template variable in override", () => {
		const summaries = [{ folder: "src", summary: "Changes" }];
		const override = "Author: {{author}} - create a commit";
		const result = buildSynthesisPrompt(summaries, "main", "john@example.com", override);

		expect(result).toContain("Author: john@example.com");
		expect(result).not.toContain("{{author}}");
	});

	it("replaces both template variables in override", () => {
		const summaries = [{ folder: "src", summary: "Changes" }];
		const override = "Branch: {{branch}}, Author: {{author}}";
		const result = buildSynthesisPrompt(summaries, "develop", "alice@company.com", override);

		expect(result).toContain("Branch: develop");
		expect(result).toContain("Author: alice@company.com");
		expect(result).not.toContain("{{branch}}");
		expect(result).not.toContain("{{author}}");
	});

	it("replaces {{changes}} template variable in override", () => {
		const summaries = [
			{ folder: "src/auth", summary: "Add authentication" },
			{ folder: "src/api", summary: "Update API routes" }
		];
		const override = "Changes:\n{{changes}}\n\nGenerate commit message.";
		const result = buildSynthesisPrompt(summaries, "main", "test@example.com", override);

		expect(result).toContain("src/auth: Add authentication");
		expect(result).toContain("src/api: Update API routes");
		expect(result).not.toContain("{{changes}}");
	});

	it("replaces all template variables ({{changes}}, {{branch}}, {{author}}) in override", () => {
		const summaries = [{ folder: "src", summary: "Refactor authentication" }];
		const override = `Branch: {{branch}}
Author: {{author}}
Changes: {{changes}}

Generate conventional commit.`;
		const result = buildSynthesisPrompt(summaries, "feature/auth", "dev@example.com", override);

		expect(result).toContain("Branch: feature/auth");
		expect(result).toContain("Author: dev@example.com");
		expect(result).toContain("src: Refactor authentication");
		expect(result).not.toContain("{{branch}}");
		expect(result).not.toContain("{{author}}");
		expect(result).not.toContain("{{changes}}");
	});

	it("uses custom override when provided", () => {
		const summaries = [{ folder: "src", summary: "Changes" }];
		const override = "Custom prompt with {{changes}} placeholder";
		const result = buildSynthesisPrompt(summaries, "main", "test@example.com", override);

		expect(result).toContain("Custom prompt");
		expect(result).toContain("src: Changes");
		expect(result).not.toContain("{{changes}}");
	});
});
