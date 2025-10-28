jest.mock("../git", () => ({
	getStagedDiff: jest.fn(() => "diff --stat"),
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

		expect(parsed).toBe(
			[
				"Changes: diff --stat",
				"Branch: feature/charming-upgrade",
				"Author: Grace Hopper",
				"Email: {{email}}",
			].join("\n")
		);
	});
});
