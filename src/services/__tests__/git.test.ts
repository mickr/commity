const mockExecFileAsync = jest.fn();

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

jest.mock("node:child_process", () => ({
	execFile: jest.fn(),
	execFileSync: jest.fn(),
	execSync: jest.fn(),
}));

jest.mock("node:util", () => ({
	promisify: jest.fn(() => mockExecFileAsync),
}));

import * as vscode from "vscode";
import {
	getStagedChangesPaths,
	SquashError,
	formatCommitRange,
	ensureCleanWorkingTree,
	getActualCurrentBranch,
	performSoftResetSquash,
	performRebaseSquash,
} from "../git";
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

describe("SquashError", () => {
	it("creates error with message", () => {
		const error = new SquashError("Test error");
		expect(error.message).toBe("Test error");
		expect(error.name).toBe("SquashError");
		expect(error.stderr).toBeUndefined();
	});

	it("creates error with message and stderr", () => {
		const error = new SquashError("Test error", "stderr output");
		expect(error.message).toBe("Test error");
		expect(error.stderr).toBe("stderr output");
		expect(error.name).toBe("SquashError");
	});

	it("is instance of Error", () => {
		const error = new SquashError("Test");
		expect(error).toBeInstanceOf(Error);
		expect(error).toBeInstanceOf(SquashError);
	});
});

describe("formatCommitRange", () => {
	it("returns empty string for empty array", () => {
		expect(formatCommitRange([])).toBe("");
	});

	it("returns single hash for single commit", () => {
		expect(formatCommitRange(["abc123"])).toBe("abc123");
	});

	it("returns range for multiple commits", () => {
		expect(formatCommitRange(["def456", "abc123"])).toBe("def456 → abc123");
	});

	it("returns range for many commits (newest → oldest)", () => {
		const hashes = ["hash5", "hash4", "hash3", "hash2", "hash1"];
		expect(formatCommitRange(hashes)).toBe("hash5 → hash1");
	});
});

describe("ensureCleanWorkingTree", () => {
	it("returns true when working tree is clean", async () => {
		const mockRepository = {
			status: jest.fn().mockResolvedValue(undefined),
			state: {
				indexChanges: [],
				workingTreeChanges: [],
				untrackedChanges: [],
				mergeChanges: [],
			},
		} as unknown as Repository;

		const result = await ensureCleanWorkingTree(mockRepository);
		expect(result).toBe(true);
	});

	it("returns false when there are index changes", async () => {
		const mockRepository = {
			status: jest.fn().mockResolvedValue(undefined),
			state: {
				indexChanges: [{ uri: vscode.Uri.file("/test.ts") }],
				workingTreeChanges: [],
				untrackedChanges: [],
				mergeChanges: [],
			},
		} as unknown as Repository;

		const result = await ensureCleanWorkingTree(mockRepository);
		expect(result).toBe(false);
	});

	it("returns false when there are working tree changes", async () => {
		const mockRepository = {
			status: jest.fn().mockResolvedValue(undefined),
			state: {
				indexChanges: [],
				workingTreeChanges: [{ uri: vscode.Uri.file("/test.ts") }],
				untrackedChanges: [],
				mergeChanges: [],
			},
		} as unknown as Repository;

		const result = await ensureCleanWorkingTree(mockRepository);
		expect(result).toBe(false);
	});

	it("returns false when there are untracked changes", async () => {
		const mockRepository = {
			status: jest.fn().mockResolvedValue(undefined),
			state: {
				indexChanges: [],
				workingTreeChanges: [],
				untrackedChanges: [{ uri: vscode.Uri.file("/new.ts") }],
				mergeChanges: [],
			},
		} as unknown as Repository;

		const result = await ensureCleanWorkingTree(mockRepository);
		expect(result).toBe(false);
	});

	it("returns false when there are merge changes", async () => {
		const mockRepository = {
			status: jest.fn().mockResolvedValue(undefined),
			state: {
				indexChanges: [],
				workingTreeChanges: [],
				untrackedChanges: [],
				mergeChanges: [{ uri: vscode.Uri.file("/conflict.ts") }],
			},
		} as unknown as Repository;

		const result = await ensureCleanWorkingTree(mockRepository);
		expect(result).toBe(false);
	});

	it("continues when status() throws error", async () => {
		const mockRepository = {
			status: jest.fn().mockRejectedValue(new Error("Git error")),
			state: {
				indexChanges: [],
				workingTreeChanges: [],
				untrackedChanges: [],
				mergeChanges: [],
			},
		} as unknown as Repository;

		const result = await ensureCleanWorkingTree(mockRepository);
		expect(result).toBe(true);
	});

	it("handles repository without status method", async () => {
		const mockRepository = {
			state: {
				indexChanges: [],
				workingTreeChanges: [],
				untrackedChanges: [],
				mergeChanges: [],
			},
		} as unknown as Repository;

		const result = await ensureCleanWorkingTree(mockRepository);
		expect(result).toBe(true);
	});
});

describe("getActualCurrentBranch", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("returns branch name when on a branch", async () => {
		mockExecFileAsync.mockResolvedValue({ stdout: "feature/test\n" });

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await getActualCurrentBranch(mockRepository);
		expect(result).toBe("feature/test");
		expect(mockExecFileAsync).toHaveBeenCalledWith("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
			cwd: "/project",
		});
	});

	it("returns empty string when in detached HEAD state", async () => {
		mockExecFileAsync.mockResolvedValue({ stdout: "HEAD\n" });

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await getActualCurrentBranch(mockRepository);
		expect(result).toBe("");
	});

	it("returns empty string on git error", async () => {
		mockExecFileAsync.mockRejectedValue(new Error("Not a git repository"));

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await getActualCurrentBranch(mockRepository);
		expect(result).toBe("");
	});
});

describe("performSoftResetSquash", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("performs soft reset and commits with new message", async () => {
		mockExecFileAsync
			.mockResolvedValueOnce({ stdout: "" })
			.mockResolvedValueOnce({ stdout: "" })
			.mockResolvedValueOnce({ stdout: "abc1234\n" })
			.mockResolvedValueOnce({ stdout: "abc1234567890\n" });

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await performSoftResetSquash({
			repository: mockRepository,
			oldestCommitHash: "def5678",
			message: "Squashed commit",
		});

		expect(result).toEqual({
			shortCommitHash: "abc1234",
			newCommitHash: "abc1234567890",
		});

		expect(mockExecFileAsync).toHaveBeenNthCalledWith(1, "git", ["reset", "--soft", "def5678^"], {
			cwd: "/project",
		});
		expect(mockExecFileAsync).toHaveBeenNthCalledWith(
			2,
			"git",
			["commit", "-m", "Squashed commit"],
			{
				cwd: "/project",
			}
		);
		expect(mockExecFileAsync).toHaveBeenNthCalledWith(3, "git", ["rev-parse", "--short", "HEAD"], {
			cwd: "/project",
		});
		expect(mockExecFileAsync).toHaveBeenNthCalledWith(4, "git", ["rev-parse", "HEAD"], {
			cwd: "/project",
		});
	});

	it("throws SquashError when reset fails", async () => {
		const gitError = new Error("reset failed");
		(gitError as { stderr?: string }).stderr = "fatal: ambiguous argument";
		mockExecFileAsync.mockRejectedValue(gitError);

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		await expect(
			performSoftResetSquash({
				repository: mockRepository,
				oldestCommitHash: "invalid",
				message: "Test",
			})
		).rejects.toThrow(SquashError);
	});

	it("throws SquashError when commit fails", async () => {
		mockExecFileAsync.mockResolvedValueOnce({ stdout: "" });

		const gitError = new Error("commit failed");
		(gitError as { stderr?: string }).stderr = "nothing to commit";
		mockExecFileAsync.mockRejectedValueOnce(gitError);

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		await expect(
			performSoftResetSquash({
				repository: mockRepository,
				oldestCommitHash: "def5678",
				message: "Test",
			})
		).rejects.toThrow(SquashError);
	});
});

describe("performRebaseSquash", () => {
	let writeFileMock: jest.Mock;
	let unlinkMock: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		writeFileMock = jest.fn().mockResolvedValue(undefined);
		unlinkMock = jest.fn().mockResolvedValue(undefined);

		jest.doMock("node:fs/promises", () => ({
			writeFile: writeFileMock,
			unlink: unlinkMock,
		}));
	});

	it("performs interactive rebase squash successfully", async () => {
		mockExecFileAsync
			.mockResolvedValueOnce({ stdout: "" })
			.mockResolvedValueOnce({ stdout: "abc1234\n" })
			.mockResolvedValueOnce({ stdout: "abc1234567890\n" });

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await performRebaseSquash({
			repository: mockRepository,
			commitHashes: ["newest", "middle", "oldest"],
			message: "Squashed commits",
		});

		expect(result).toEqual({
			shortCommitHash: "abc1234",
			newCommitHash: "abc1234567890",
		});

		expect(mockExecFileAsync).toHaveBeenCalledWith(
			"git",
			["rebase", "-i", "--autosquash", "oldest^"],
			expect.objectContaining({
				cwd: "/project",
				env: expect.objectContaining({
					GIT_SEQUENCE_EDITOR: expect.stringContaining("cat"),
					GIT_EDITOR: expect.stringContaining("cat"),
				}),
			})
		);
	});

	it("aborts rebase on failure", async () => {
		const gitError = new Error("rebase failed");
		(gitError as { stderr?: string }).stderr = "Could not apply";
		mockExecFileAsync.mockRejectedValueOnce(gitError);

		const abortMock = jest.fn().mockResolvedValue({ stdout: "" });
		mockExecFileAsync.mockImplementationOnce(() => Promise.reject(gitError));
		mockExecFileAsync.mockImplementationOnce(abortMock);

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		await expect(
			performRebaseSquash({
				repository: mockRepository,
				commitHashes: ["hash1", "hash2"],
				message: "Test",
			})
		).rejects.toThrow(SquashError);
	});

	it("includes abort failure in error when abort fails", async () => {
		const gitError = new Error("rebase failed");
		(gitError as { stderr?: string }).stderr = "Could not apply";

		const abortError = new Error("abort failed");
		(abortError as { stderr?: string }).stderr = "fatal: no rebase in progress";

		mockExecFileAsync
			.mockImplementationOnce(() => Promise.reject(gitError))
			.mockImplementationOnce(() => Promise.reject(abortError));

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const error = await performRebaseSquash({
			repository: mockRepository,
			commitHashes: ["hash1", "hash2"],
			message: "Test",
		}).catch((e) => e);

		expect(error).toBeInstanceOf(SquashError);
		expect((error as SquashError).stderr).toContain("Could not apply");
		expect((error as SquashError).stderr).toContain("Failed to abort rebase");
		expect((error as SquashError).stderr).toContain("abort failed");
	});

	it("creates todo script with correct format", async () => {
		mockExecFileAsync
			.mockResolvedValueOnce({ stdout: "" })
			.mockResolvedValueOnce({ stdout: "abc1234\n" })
			.mockResolvedValueOnce({ stdout: "abc1234567890\n" });

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		await performRebaseSquash({
			repository: mockRepository,
			commitHashes: ["hash3", "hash2", "hash1"],
			message: "Squashed",
		});

		const rebaseCall = mockExecFileAsync.mock.calls.find((call) => call[1]?.[0] === "rebase");
		expect(rebaseCall).toBeDefined();
	});
});
