jest.mock(
	"vscode",
	() => ({
		extensions: {
			getExtension: jest.fn(),
		},
		Uri: {
			file: jest.fn((path: string) => ({ fsPath: path })),
		},
	}),
	{ virtual: true }
);

import * as vscode from "vscode";
import { getStagedChangesPaths } from "../git";
import type { Repository, Change, Status } from "../../types/git";

describe("getStagedChangesPaths", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("returns empty array when repository has no changes", () => {
		const mockRepository = {
			state: {
				indexChanges: [],
				workingTreeChanges: [],
				HEAD: { name: "main" },
			},
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = getStagedChangesPaths(mockRepository);

		expect(result).toEqual([]);
	});

	it("filters out node_modules files", () => {
		const changes: Change[] = [
			{
				uri: vscode.Uri.file("/project/src/index.ts"),
				originalUri: vscode.Uri.file("/project/src/index.ts"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/node_modules/package/index.js"),
				originalUri: vscode.Uri.file("/project/node_modules/package/index.js"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/src/utils.ts"),
				originalUri: vscode.Uri.file("/project/src/utils.ts"),
				renameUri: undefined,
				status: 5 as Status,
			},
		] as Change[];

		const mockRepository = {
			state: {
				indexChanges: [],
				workingTreeChanges: changes,
				HEAD: { name: "main" },
			},
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = getStagedChangesPaths(mockRepository);

		expect(result).toHaveLength(2);
		expect(result[0].uri.fsPath).toBe("/project/src/index.ts");
		expect(result[1].uri.fsPath).toBe("/project/src/utils.ts");
	});

	it("filters out vendor directory files", () => {
		const changes: Change[] = [
			{
				uri: vscode.Uri.file("/project/src/main.php"),
				originalUri: vscode.Uri.file("/project/src/main.php"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/vendor/package/lib.php"),
				originalUri: vscode.Uri.file("/project/vendor/package/lib.php"),
				renameUri: undefined,
				status: 5 as Status,
			},
		] as Change[];

		const mockRepository = {
			state: {
				indexChanges: [],
				workingTreeChanges: changes,
				HEAD: { name: "main" },
			},
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = getStagedChangesPaths(mockRepository);

		expect(result).toHaveLength(1);
		expect(result[0].uri.fsPath).toBe("/project/src/main.php");
	});

	it("filters out lock files", () => {
		const changes: Change[] = [
			{
				uri: vscode.Uri.file("/project/package.json"),
				originalUri: vscode.Uri.file("/project/package.json"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/package-lock.json"),
				originalUri: vscode.Uri.file("/project/package-lock.json"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/pnpm-lock.yaml"),
				originalUri: vscode.Uri.file("/project/pnpm-lock.yaml"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/yarn.lock"),
				originalUri: vscode.Uri.file("/project/yarn.lock"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/composer.lock"),
				originalUri: vscode.Uri.file("/project/composer.lock"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/Cargo.lock"),
				originalUri: vscode.Uri.file("/project/Cargo.lock"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/Gemfile.lock"),
				originalUri: vscode.Uri.file("/project/Gemfile.lock"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/poetry.lock"),
				originalUri: vscode.Uri.file("/project/poetry.lock"),
				renameUri: undefined,
				status: 5 as Status,
			},
		] as Change[];

		const mockRepository = {
			state: {
				indexChanges: [],
				workingTreeChanges: changes,
				HEAD: { name: "main" },
			},
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = getStagedChangesPaths(mockRepository);

		expect(result).toHaveLength(1);
		expect(result[0].uri.fsPath).toBe("/project/package.json");
	});

	it("filters out minified files", () => {
		const changes: Change[] = [
			{
				uri: vscode.Uri.file("/project/src/app.js"),
				originalUri: vscode.Uri.file("/project/src/app.js"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/dist/app.min.js"),
				originalUri: vscode.Uri.file("/project/dist/app.min.js"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/styles/main.css"),
				originalUri: vscode.Uri.file("/project/styles/main.css"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/styles/main.min.css"),
				originalUri: vscode.Uri.file("/project/styles/main.min.css"),
				renameUri: undefined,
				status: 5 as Status,
			},
		] as Change[];

		const mockRepository = {
			state: {
				indexChanges: [],
				workingTreeChanges: changes,
				HEAD: { name: "main" },
			},
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = getStagedChangesPaths(mockRepository);

		expect(result).toHaveLength(2);
		expect(result[0].uri.fsPath).toBe("/project/src/app.js");
		expect(result[1].uri.fsPath).toBe("/project/styles/main.css");
	});

	it("filters out dist and build directories", () => {
		const changes: Change[] = [
			{
				uri: vscode.Uri.file("/project/src/index.ts"),
				originalUri: vscode.Uri.file("/project/src/index.ts"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/dist/index.js"),
				originalUri: vscode.Uri.file("/project/dist/index.js"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/build/output.js"),
				originalUri: vscode.Uri.file("/project/build/output.js"),
				renameUri: undefined,
				status: 5 as Status,
			},
		] as Change[];

		const mockRepository = {
			state: {
				indexChanges: [],
				workingTreeChanges: changes,
				HEAD: { name: "main" },
			},
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = getStagedChangesPaths(mockRepository);

		expect(result).toHaveLength(1);
		expect(result[0].uri.fsPath).toBe("/project/src/index.ts");
	});

	it("returns all changes when none match filter patterns", () => {
		const changes: Change[] = [
			{
				uri: vscode.Uri.file("/project/src/index.ts"),
				originalUri: vscode.Uri.file("/project/src/index.ts"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/src/utils.ts"),
				originalUri: vscode.Uri.file("/project/src/utils.ts"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/README.md"),
				originalUri: vscode.Uri.file("/project/README.md"),
				renameUri: undefined,
				status: 5 as Status,
			},
		] as Change[];

		const stagedChanges = [
			{
				uri: vscode.Uri.file("/project/apptest.js"),
				originalUri: vscode.Uri.file("/project/apptest.js"),
				renameUri: undefined,
				status: 5 as Status,
			},
			{
				uri: vscode.Uri.file("/project/styles/vendor.css"),
				originalUri: vscode.Uri.file("/project/styles/vendor.css"),
				renameUri: undefined,
				status: 5 as Status,
			},
		] as Change[];

		const mockRepository = {
			state: {
				indexChanges: stagedChanges,
				workingTreeChanges: changes,
				HEAD: { name: "main" },
			},
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = getStagedChangesPaths(mockRepository);

		expect(result).toHaveLength(5);
	});

	describe("Multi-Repository Support", () => {
		it("handles different repository paths correctly", () => {
			const repo1Changes: Change[] = [
				{
					uri: vscode.Uri.file("/workspace/repo1/src/main.ts"),
					originalUri: vscode.Uri.file("/workspace/repo1/src/main.ts"),
					renameUri: undefined,
					status: 5 as Status,
				},
				{
					uri: vscode.Uri.file("/workspace/repo1/node_modules/lib.js"),
					originalUri: vscode.Uri.file("/workspace/repo1/node_modules/lib.js"),
					renameUri: undefined,
					status: 5 as Status,
				},
			] as Change[];

			const mockRepo1 = {
				state: {
					indexChanges: [],
					workingTreeChanges: repo1Changes,
					HEAD: { name: "main" },
				},
				rootUri: vscode.Uri.file("/workspace/repo1"),
			} as unknown as Repository;

			const result = getStagedChangesPaths(mockRepo1);

			expect(result).toHaveLength(1);
			expect(result[0].uri.fsPath).toBe("/workspace/repo1/src/main.ts");
		});

		it("correctly filters files relative to repository root", () => {
			const repo2Changes: Change[] = [
				{
					uri: vscode.Uri.file("/workspace/repo2/src/index.ts"),
					originalUri: vscode.Uri.file("/workspace/repo2/src/index.ts"),
					renameUri: undefined,
					status: 5 as Status,
				},
				{
					uri: vscode.Uri.file("/workspace/repo2/dist/index.js"),
					originalUri: vscode.Uri.file("/workspace/repo2/dist/index.js"),
					renameUri: undefined,
					status: 5 as Status,
				},
			] as Change[];

			const mockRepo2 = {
				state: {
					indexChanges: [],
					workingTreeChanges: repo2Changes,
					HEAD: { name: "develop" },
				},
				rootUri: vscode.Uri.file("/workspace/repo2"),
			} as unknown as Repository;

			const result = getStagedChangesPaths(mockRepo2);

			expect(result).toHaveLength(1);
			expect(result[0].uri.fsPath).toBe("/workspace/repo2/src/index.ts");
		});
	});
});
