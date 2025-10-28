jest.mock("../config", () => ({
	readConfiguration: jest.fn(),
}));

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

import { generateCommitMessagePrompt, getConfigDrivenPrompt } from "../prompts";
const { readConfiguration } = require("../config") as { readConfiguration: jest.Mock };

beforeEach(() => {
	readConfiguration.mockReset();
	readConfiguration.mockReturnValue({
		success: true,
		data: "Follow Conventional Commits for {{branch}} by {{author}}.",
	});
});

describe("generateCommitMessagePrompt", () => {
	it("returns a rendered config-driven prompt with git-derived values", () => {
		const prompt = generateCommitMessagePrompt();

		expect(prompt).toContain("File: src/file1.ts");
		expect(prompt).toContain("diff --git a/src/file1.ts...");
		expect(prompt).toContain("File: src/file2.ts");
		expect(prompt).toContain("feature/charming-upgrade");
		expect(prompt).toContain("Grace Hopper");
		expect(prompt).toContain("Follow Conventional Commits for");
		expect(prompt).not.toContain("{{branch}}");
		expect(prompt).not.toContain("{{author}}");
	});
});

describe("getConfigDrivenPrompt", () => {
	it("falls back to default prompt when configuration read fails", () => {
		readConfiguration.mockReturnValueOnce({ success: false, data: "ignored" });

		const prompt = getConfigDrivenPrompt();

		expect(prompt).toContain(
			"You are a helpful assistant that generates commit messages for a Git repository."
		);
		expect(prompt).toContain("{{changes}}");
	});
});
