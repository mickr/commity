jest.mock("../git", () => ({
	getStagedDiff: jest.fn(() => ({
		"src/file1.ts": { diff: "diff --git a/src/file1.ts...", summary: undefined },
		"src/file2.ts": { diff: "diff --git a/src/file2.ts...", summary: undefined },
	})),
	getCurrentBranch: jest.fn(() => "feature/charming-upgrade"),
	getCurrentAuthor: jest.fn(() => "Grace Hopper"),
}));

jest.mock(
	"vscode",
	() => ({
		workspace: { workspaceFolders: [] },
	}),
	{ virtual: true }
);

import { parseTemplate } from "../prompts";

describe("parseTemplate", () => {
	it("replaces git-derived tokens and leaves unknown placeholders untouched", () => {
		const template = [
			"Changes: {{changes}}",
			"Branch: {{branch}}",
			"Author: {{author}}",
			"Email: {{email}}",
		].join("\n");

		const parsed = parseTemplate(template);

		expect(parsed).toContain("File: src/file1.ts");
		expect(parsed).toContain("diff --git a/src/file1.ts...");
		expect(parsed).toContain("File: src/file2.ts");
		expect(parsed).toContain("diff --git a/src/file2.ts...");
		expect(parsed).toContain("Branch: feature/charming-upgrade");
		expect(parsed).toContain("Author: Grace Hopper");
		expect(parsed).toContain("Email: {{email}}");
	});
});
