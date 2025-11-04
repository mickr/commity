jest.mock("vscode", () => ({
	extensions: {
		getExtension: jest.fn(),
	},
}), { virtual: true });

import * as vscode from "vscode";
import { getStagedChangesPaths } from "../git";
import type { API, Repository, Change } from "../../types/git";

describe("getStagedChangesPaths", () => {
	const mockGetExtension = vscode.extensions.getExtension as jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("returns empty array when git extension is not available", () => {
		mockGetExtension.mockReturnValue(undefined);

		const result = getStagedChangesPaths();

		expect(result).toEqual([]);
	});

	it("returns empty array when no repository is available", () => {
		const mockGit: API = {
			repositories: [],
		} as API;

		mockGetExtension.mockReturnValue({
			exports: { getAPI: () => mockGit },
		});

		const result = getStagedChangesPaths();

		expect(result).toEqual([]);
	});

	it("filters out node_modules files", () => {
		const changes: Change[] = [
			{ uri: { fsPath: "/project/src/index.ts" } } as Change,
			{ uri: { fsPath: "/project/node_modules/package/index.js" } } as Change,
			{ uri: { fsPath: "/project/src/utils.ts" } } as Change,
		];

		const mockRepository: Repository = {
			state: { indexChanges: [], workingTreeChanges: changes, HEAD: { name: "main" } },
			rootUri: { fsPath: "/project" },
		} as Repository;

		const mockGit: API = {
			repositories: [mockRepository],
		} as API;

		mockGetExtension.mockReturnValue({
			exports: { getAPI: () => mockGit },
		});

		const result = getStagedChangesPaths();

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
			state: { indexChanges: [], workingTreeChanges: changes, HEAD: { name: "main" } },
			rootUri: { fsPath: "/project" },
		} as Repository;

		const mockGit: API = {
			repositories: [mockRepository],
		} as API;

		mockGetExtension.mockReturnValue({
			exports: { getAPI: () => mockGit },
		});

		const result = getStagedChangesPaths();

		expect(result).toHaveLength(1);
		expect(result[0].uri.fsPath).toBe("/project/src/main.php");
	});

	it("filters out lock files", () => {
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
			state: { indexChanges: [], workingTreeChanges: changes, HEAD: { name: "main" } },
			rootUri: { fsPath: "/project" },
		} as Repository;

		const mockGit: API = {
			repositories: [mockRepository],
		} as API;

		mockGetExtension.mockReturnValue({
			exports: { getAPI: () => mockGit },
		});

		const result = getStagedChangesPaths();

		expect(result).toHaveLength(1);
		expect(result[0].uri.fsPath).toBe("/project/package.json");
	});

	it("filters out minified files", () => {
		const changes: Change[] = [
			{ uri: { fsPath: "/project/src/app.js" } } as Change,
			{ uri: { fsPath: "/project/dist/app.min.js" } } as Change,
			{ uri: { fsPath: "/project/styles/main.css" } } as Change,
			{ uri: { fsPath: "/project/styles/main.min.css" } } as Change,
		];

		const mockRepository: Repository = {
			state: { indexChanges: [], workingTreeChanges: changes, HEAD: { name: "main" } },
			rootUri: { fsPath: "/project" },
		} as Repository;

		const mockGit: API = {
			repositories: [mockRepository],
		} as API;

		mockGetExtension.mockReturnValue({
			exports: { getAPI: () => mockGit },
		});

		const result = getStagedChangesPaths();

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
			state: { indexChanges: [], workingTreeChanges: changes, HEAD: { name: "main" } },
			rootUri: { fsPath: "/project" },
		} as Repository;

		const mockGit: API = {
			repositories: [mockRepository],
		} as API;

		mockGetExtension.mockReturnValue({
			exports: { getAPI: () => mockGit },
		});

		const result = getStagedChangesPaths();

		expect(result).toHaveLength(1);
		expect(result[0].uri.fsPath).toBe("/project/src/index.ts");
	});

	it("returns all changes when none match filter patterns", () => {
		const changes: Change[] = [
			{ uri: { fsPath: "/project/src/index.ts" } } as Change,
			{ uri: { fsPath: "/project/src/utils.ts" } } as Change,
			{ uri: { fsPath: "/project/README.md" } } as Change,
		];

		const mockRepository: Repository = {
			state: { indexChanges: [], workingTreeChanges: changes, HEAD: { name: "main" } },
			rootUri: { fsPath: "/project" },
		} as Repository;

		const mockGit: API = {
			repositories: [mockRepository],
		} as API;

		mockGetExtension.mockReturnValue({
			exports: { getAPI: () => mockGit },
		});

		const result = getStagedChangesPaths();

		expect(result).toHaveLength(3);
	});
});
