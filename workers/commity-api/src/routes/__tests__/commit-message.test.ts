import type { DiffEntry } from "../../types";

describe("Folder grouping logic", () => {
	it("groups files by directory path", () => {
		const diffs: Array<{ path: string; diff: string }> = [
			{ path: "src/auth/login.ts", diff: "+login code" },
			{ path: "src/auth/logout.ts", diff: "+logout code" },
			{ path: "src/utils/helpers.ts", diff: "+helper code" },
			{ path: "README.md", diff: "+readme" },
		];

		const folderGroups = diffs.reduce((acc, diff) => {
			const folder = diff.path.includes("/")
				? diff.path.substring(0, diff.path.lastIndexOf("/"))
				: ".";
			if (!acc[folder]) {
				acc[folder] = [];
			}
			acc[folder].push(diff);
			return acc;
		}, {} as Record<string, Array<{ path: string; diff: string }>>);

		expect(Object.keys(folderGroups)).toHaveLength(3);
		expect(folderGroups["src/auth"]).toHaveLength(2);
		expect(folderGroups["src/utils"]).toHaveLength(1);
		expect(folderGroups["."]).toHaveLength(1);
	});

	it("handles files in root directory", () => {
		const diffs = [
			{ path: "package.json", diff: "+json" },
			{ path: "README.md", diff: "+readme" },
		];

		const folderGroups = diffs.reduce((acc, diff) => {
			const folder = diff.path.includes("/")
				? diff.path.substring(0, diff.path.lastIndexOf("/"))
				: ".";
			if (!acc[folder]) {
				acc[folder] = [];
			}
			acc[folder].push(diff);
			return acc;
		}, {} as Record<string, Array<{ path: string; diff: string }>>);

		expect(Object.keys(folderGroups)).toHaveLength(1);
		expect(folderGroups["."]).toHaveLength(2);
	});

	it("handles deeply nested paths", () => {
		const diffs = [
			{ path: "src/components/auth/login/LoginForm.tsx", diff: "+form" },
			{ path: "src/components/auth/login/LoginButton.tsx", diff: "+button" },
			{ path: "src/components/auth/logout/LogoutButton.tsx", diff: "+logout" },
		];

		const folderGroups = diffs.reduce((acc, diff) => {
			const folder = diff.path.includes("/")
				? diff.path.substring(0, diff.path.lastIndexOf("/"))
				: ".";
			if (!acc[folder]) {
				acc[folder] = [];
			}
			acc[folder].push(diff);
			return acc;
		}, {} as Record<string, Array<{ path: string; diff: string }>>);

		expect(Object.keys(folderGroups)).toHaveLength(2);
		expect(folderGroups["src/components/auth/login"]).toHaveLength(2);
		expect(folderGroups["src/components/auth/logout"]).toHaveLength(1);
	});

	it("handles single file", () => {
		const diffs = [{ path: "src/index.ts", diff: "+code" }];

		const folderGroups = diffs.reduce((acc, diff) => {
			const folder = diff.path.includes("/")
				? diff.path.substring(0, diff.path.lastIndexOf("/"))
				: ".";
			if (!acc[folder]) {
				acc[folder] = [];
			}
			acc[folder].push(diff);
			return acc;
		}, {} as Record<string, Array<{ path: string; diff: string }>>);

		expect(Object.keys(folderGroups)).toHaveLength(1);
		expect(folderGroups["src"]).toHaveLength(1);
	});

	it("handles empty diffs array", () => {
		const diffs: Array<{ path: string; diff: string }> = [];

		const folderGroups = diffs.reduce((acc, diff) => {
			const folder = diff.path.includes("/")
				? diff.path.substring(0, diff.path.lastIndexOf("/"))
				: ".";
			if (!acc[folder]) {
				acc[folder] = [];
			}
			acc[folder].push(diff);
			return acc;
		}, {} as Record<string, Array<{ path: string; diff: string }>>);

		expect(Object.keys(folderGroups)).toHaveLength(0);
	});

	it("handles mixed root and nested files", () => {
		const diffs = [
			{ path: "package.json", diff: "+json" },
			{ path: "src/index.ts", diff: "+index" },
			{ path: "src/utils/helper.ts", diff: "+helper" },
			{ path: "README.md", diff: "+readme" },
		];

		const folderGroups = diffs.reduce((acc, diff) => {
			const folder = diff.path.includes("/")
				? diff.path.substring(0, diff.path.lastIndexOf("/"))
				: ".";
			if (!acc[folder]) {
				acc[folder] = [];
			}
			acc[folder].push(diff);
			return acc;
		}, {} as Record<string, Array<{ path: string; diff: string }>>);

		expect(Object.keys(folderGroups)).toHaveLength(3);
		expect(folderGroups["."]).toHaveLength(2);
		expect(folderGroups["src"]).toHaveLength(1);
		expect(folderGroups["src/utils"]).toHaveLength(1);
	});

	it("preserves file order within folders", () => {
		const diffs = [
			{ path: "src/a.ts", diff: "+a" },
			{ path: "src/b.ts", diff: "+b" },
			{ path: "src/c.ts", diff: "+c" },
		];

		const folderGroups = diffs.reduce((acc, diff) => {
			const folder = diff.path.includes("/")
				? diff.path.substring(0, diff.path.lastIndexOf("/"))
				: ".";
			if (!acc[folder]) {
				acc[folder] = [];
			}
			acc[folder].push(diff);
			return acc;
		}, {} as Record<string, Array<{ path: string; diff: string }>>);

		expect(folderGroups["src"][0].path).toBe("src/a.ts");
		expect(folderGroups["src"][1].path).toBe("src/b.ts");
		expect(folderGroups["src"][2].path).toBe("src/c.ts");
	});

	it("handles paths with multiple dots", () => {
		const diffs = [
			{ path: "src/test.spec.ts", diff: "+test" },
			{ path: "src/utils/helper.util.ts", diff: "+helper" },
		];

		const folderGroups = diffs.reduce((acc, diff) => {
			const folder = diff.path.includes("/")
				? diff.path.substring(0, diff.path.lastIndexOf("/"))
				: ".";
			if (!acc[folder]) {
				acc[folder] = [];
			}
			acc[folder].push(diff);
			return acc;
		}, {} as Record<string, Array<{ path: string; diff: string }>>);

		expect(Object.keys(folderGroups)).toHaveLength(2);
		expect(folderGroups["src"]).toHaveLength(1);
		expect(folderGroups["src/utils"]).toHaveLength(1);
	});
});
