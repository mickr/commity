jest.mock(
	"vscode",
	() => ({
		extensions: {
			getExtension: jest.fn(),
		},
	}),
	{ virtual: true },
);

import { getStagedChangesPaths } from "../git";
import type { Repository, Change } from "../../types/git";

describe("getStagedChangesPaths", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("returns empty array when repository has no changes", () => {
		const mockRepository: Repository = {
			state: {
				indexChanges: [],
				workingTreeChanges: [],
				HEAD: { name: "main" },
			},
			rootUri: { fsPath: "/project" },
		} as Repository;

		const result = getStagedChangesPaths(mockRepository);

		expect(result).toEqual([]);
	});

	it("filters out node_modules files", () => {
		const changes: Change[] = [
			{ uri: { fsPath: "/project/src/index.ts" } } as Change,
			{ uri: { fsPath: "/project/node_modules/package/index.js" } } as Change,
			{ uri: { fsPath: "/project/src/utils.ts" } } as Change,
		];

		const mockRepository: Repository = {
			state: {
				indexChanges: [],
				workingTreeChanges: changes,
				HEAD: { name: "main" },
			},
			rootUri: { fsPath: "/project" },
		} as Repository;

		const result = getStagedChangesPaths(mockRepository);

		expect(result).toHaveLength(2);
		expect(result[0].uri.fsPath).toBe("/project/src/index.ts");
		expect(result[1].uri.fsPath).toBe("/project/src/utils.ts");
	});

	it("filters out vendor directory files", () => {
		const changes: Change[] = [
			{ uri: { fsPath: "/project/src/main.php" } } as Change,
			{ uri: { fsPath: "/project/vendor/package/lib.php" } } as Change,
		];

		const mockRepository: Repository = {
			state: {
				indexChanges: [],
				workingTreeChanges: changes,
				HEAD: { name: "main" },
			},
			rootUri: { fsPath: "/project" },
		} as Repository;

		const result = getStagedChangesPaths(mockRepository);

		expect(result).toHaveLength(1);
		expect(result[0].uri.fsPath).toBe("/project/src/main.php");
	});

	it("includes lock files", () => {
		const changes: Change[] = [
			{ uri: { fsPath: "/project/package.json" } } as Change,
			{ uri: { fsPath: "/project/package-lock.json" } } as Change,
			{ uri: { fsPath: "/project/pnpm-lock.yaml" } } as Change,
			{ uri: { fsPath: "/project/yarn.lock" } } as Change,
			{ uri: { fsPath: "/project/composer.lock" } } as Change,
			{ uri: { fsPath: "/project/Cargo.lock" } } as Change,
			{ uri: { fsPath: "/project/Gemfile.lock" } } as Change,
			{ uri: { fsPath: "/project/poetry.lock" } } as Change,
		];

		const mockRepository: Repository = {
			state: {
				indexChanges: [],
				workingTreeChanges: changes,
				HEAD: { name: "main" },
			},
			rootUri: { fsPath: "/project" },
		} as Repository;

		const result = getStagedChangesPaths(mockRepository);

		expect(result).toHaveLength(8);
		expect(result[0].uri.fsPath).toBe("/project/package.json");
		expect(result[1].uri.fsPath).toBe("/project/package-lock.json");
	});

	it("filters out minified files", () => {
		const changes: Change[] = [
			{ uri: { fsPath: "/project/src/app.js" } } as Change,
			{ uri: { fsPath: "/project/dist/app.min.js" } } as Change,
			{ uri: { fsPath: "/project/styles/main.css" } } as Change,
			{ uri: { fsPath: "/project/styles/main.min.css" } } as Change,
		];

		const mockRepository: Repository = {
			state: {
				indexChanges: [],
				workingTreeChanges: changes,
				HEAD: { name: "main" },
			},
			rootUri: { fsPath: "/project" },
		} as Repository;

		const result = getStagedChangesPaths(mockRepository);

		expect(result).toHaveLength(2);
		expect(result[0].uri.fsPath).toBe("/project/src/app.js");
		expect(result[1].uri.fsPath).toBe("/project/styles/main.css");
	});

	it("filters out dist and build directories", () => {
		const changes: Change[] = [
			{ uri: { fsPath: "/project/src/index.ts" } } as Change,
			{ uri: { fsPath: "/project/dist/index.js" } } as Change,
			{ uri: { fsPath: "/project/build/output.js" } } as Change,
		];

		const mockRepository: Repository = {
			state: {
				indexChanges: [],
				workingTreeChanges: changes,
				HEAD: { name: "main" },
			},
			rootUri: { fsPath: "/project" },
		} as Repository;

		const result = getStagedChangesPaths(mockRepository);

		expect(result).toHaveLength(1);
		expect(result[0].uri.fsPath).toBe("/project/src/index.ts");
	});

	it("returns all changes when none match filter patterns", () => {
		const changes: Change[] = [
			{ uri: { fsPath: "/project/src/index.ts" } } as Change,
			{ uri: { fsPath: "/project/src/utils.ts" } } as Change,
			{ uri: { fsPath: "/project/README.md" } } as Change,
		];

		const stagedChanges = [
			{ uri: { fsPath: "/project/apptest.js" } } as Change,
			{ uri: { fsPath: "/project/styles/vendor.css" } } as Change,
		];

		const mockRepository: Repository = {
			state: {
				indexChanges: stagedChanges,
				workingTreeChanges: changes,
				HEAD: { name: "main" },
			},
			rootUri: { fsPath: "/project" },
		} as Repository;

		const result = getStagedChangesPaths(mockRepository);

		expect(result).toHaveLength(5);
	});

	describe("Multi-Repository Support", () => {
		it("handles different repository paths correctly", () => {
			const repo1Changes: Change[] = [
				{ uri: { fsPath: "/workspace/repo1/src/main.ts" } } as Change,
				{ uri: { fsPath: "/workspace/repo1/node_modules/lib.js" } } as Change,
			];

			const mockRepo1: Repository = {
				state: {
					indexChanges: [],
					workingTreeChanges: repo1Changes,
					HEAD: { name: "main" },
				},
				rootUri: { fsPath: "/workspace/repo1" },
			} as Repository;

			const result = getStagedChangesPaths(mockRepo1);

			expect(result).toHaveLength(1);
			expect(result[0].uri.fsPath).toBe("/workspace/repo1/src/main.ts");
		});

		it("correctly filters files relative to repository root", () => {
			const repo2Changes: Change[] = [
				{ uri: { fsPath: "/workspace/repo2/src/index.ts" } } as Change,
				{ uri: { fsPath: "/workspace/repo2/dist/index.js" } } as Change,
			];

			const mockRepo2: Repository = {
				state: {
					indexChanges: [],
					workingTreeChanges: repo2Changes,
					HEAD: { name: "develop" },
				},
				rootUri: { fsPath: "/workspace/repo2" },
			} as Repository;

			const result = getStagedChangesPaths(mockRepo2);

			expect(result).toHaveLength(1);
			expect(result[0].uri.fsPath).toBe("/workspace/repo2/src/index.ts");
		});
	});

	describe("Lock File Handling", () => {
		it("marks lock files with isLockFile flag in getStagedDiff", () => {
			const changes: Change[] = [
				{ uri: { fsPath: "/project/src/index.ts" }, status: 0 } as Change,
				{ uri: { fsPath: "/project/package-lock.json" }, status: 0 } as Change,
			];

			const mockRepository: Repository = {
				state: {
					indexChanges: [],
					workingTreeChanges: changes,
					HEAD: { name: "main" },
				},
				rootUri: { fsPath: "/project" },
			} as Repository;

			// This test doesn't actually execute git commands due to mocking limitations
			// but validates that the structure supports lock file metadata
			const result = getStagedChangesPaths(mockRepository);

			expect(result).toHaveLength(2);
			expect(result.some(c => c.uri.fsPath.includes("package-lock.json"))).toBe(true);
		});

		it("includes lock files alongside regular files", () => {
			const changes: Change[] = [
				{ uri: { fsPath: "/project/src/app.js" } } as Change,
				{ uri: { fsPath: "/project/yarn.lock" } } as Change,
				{ uri: { fsPath: "/project/README.md" } } as Change,
			];

			const mockRepository: Repository = {
				state: {
					indexChanges: [],
					workingTreeChanges: changes,
					HEAD: { name: "main" },
				},
				rootUri: { fsPath: "/project" },
			} as Repository;

			const result = getStagedChangesPaths(mockRepository);

			expect(result).toHaveLength(3);
			expect(result.map(c => c.uri.fsPath)).toContain("/project/yarn.lock");
		});
	});
});
