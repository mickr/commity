import { buildPrompt, defaultGeneralPrompt, defaultCommitMessagePrompt } from "../prompts";

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
	it("contains {{changes}} placeholder", () => {
		expect(defaultGeneralPrompt).toContain("{{changes}}");
	});

	it("includes guidance on commit message format", () => {
		expect(defaultGeneralPrompt).toContain("imperative mood");
		expect(defaultGeneralPrompt).toContain("capital letter");
	});

	it("warns against signing commits", () => {
		expect(defaultGeneralPrompt).toContain("Never sign the commit");
	});
});

describe("defaultCommitMessagePrompt", () => {
	it("includes the general prompt", () => {
		expect(defaultCommitMessagePrompt).toContain(defaultGeneralPrompt);
	});

	it("includes example commit messages", () => {
		expect(defaultCommitMessagePrompt).toContain("Add user authentication system");
		expect(defaultCommitMessagePrompt).toContain("Fix memory leak in data processing");
		expect(defaultCommitMessagePrompt).toContain("Refactor database connection logic");
	});

	it("instructs to return only the commit message", () => {
		expect(defaultCommitMessagePrompt).toContain("Return only the commit message");
	});
});
