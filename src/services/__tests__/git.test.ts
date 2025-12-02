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

const mockIsomorphicGit = {
	log: jest.fn(),
	resolveRef: jest.fn(),
	readCommit: jest.fn(),
	getConfig: jest.fn(),
	commit: jest.fn(),
	currentBranch: jest.fn(),
};

jest.mock("isomorphic-git", () => mockIsomorphicGit);

import * as vscode from "vscode";
import {
	getChanges,
	SquashError,
	formatCommitRange,
	ensureCleanWorkingTree,
	getActualCurrentBranch,
	performSoftResetSquash,
	performRebaseSquash,
	performRevertCommit,
	getMergeBaseHash,
} from "../git";
import type { Repository, Change, Status } from "../../types/git";

describe("getChanges", () => {
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

		const result = getChanges(mockRepository);

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

		const result = getChanges(mockRepository);

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

		const result = getChanges(mockRepository);

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

		const result = getChanges(mockRepository);

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

		const result = getChanges(mockRepository);

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

		const result = getChanges(mockRepository);

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

		const result = getChanges(mockRepository);

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

			const result = getChanges(mockRepo1);

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

			const result = getChanges(mockRepo2);

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

	it("returns false when status() throws error", async () => {
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
		expect(result).toBe(false);
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
		mockIsomorphicGit.currentBranch.mockResolvedValue("feature/test");

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await getActualCurrentBranch(mockRepository);
		expect(result).toBe("feature/test");
		expect(mockIsomorphicGit.currentBranch).toHaveBeenCalledWith({
			fs: expect.anything(),
			dir: "/project",
		});
	});

	it("returns empty string when in detached HEAD state", async () => {
		mockIsomorphicGit.currentBranch.mockResolvedValue(undefined);

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await getActualCurrentBranch(mockRepository);
		expect(result).toBe("");
	});

	it("returns empty string on git error", async () => {
		mockIsomorphicGit.currentBranch.mockRejectedValue(new Error("Not a git repository"));

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

		mockIsomorphicGit.log.mockResolvedValue([
			{
				oid: "def5678",
				commit: {
					parent: ["parent123"],
					tree: "tree456",
				},
			},
		]);
		mockIsomorphicGit.resolveRef.mockResolvedValue("headcommit789");
		mockIsomorphicGit.readCommit.mockResolvedValue({
			oid: "headcommit789",
			commit: {
				tree: "currenttree123",
				parent: ["parent123"],
			},
		});
		mockIsomorphicGit.getConfig.mockImplementation(({ path }: { path: string }) => {
			if (path === "user.name") {
				return Promise.resolve("Test User");
			}
			if (path === "user.email") {
				return Promise.resolve("test@example.com");
			}
			return Promise.resolve(undefined);
		});
		mockIsomorphicGit.commit.mockResolvedValue("newcommit1234567890");
	});

	it("performs squash using isomorphic-git", async () => {
		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await performSoftResetSquash({
			repository: mockRepository,
			oldestCommitHash: "def5678",
			message: "Squashed commit",
		});

		expect(result).toEqual({
			shortCommitHash: "newcomm",
			newCommitHash: "newcommit1234567890",
		});

		expect(mockIsomorphicGit.log).toHaveBeenCalledWith(
			expect.objectContaining({
				dir: "/project",
				ref: "def5678",
				depth: 2,
			})
		);

		expect(mockIsomorphicGit.commit).toHaveBeenCalledWith(
			expect.objectContaining({
				dir: "/project",
				message: "Squashed commit",
				tree: "currenttree123",
				parent: ["parent123"],
			})
		);
	});

	it("throws SquashError when oldest commit has no parent", async () => {
		mockIsomorphicGit.log.mockResolvedValue([
			{
				oid: "def5678",
				commit: {
					parent: [],
					tree: "tree456",
				},
			},
		]);

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		await expect(
			performSoftResetSquash({
				repository: mockRepository,
				oldestCommitHash: "def5678",
				message: "Test",
			})
		).rejects.toThrow("oldest commit has no parent");
	});

	it("throws when isomorphic-git fails", async () => {
		mockIsomorphicGit.log.mockRejectedValue(new Error("git log failed"));

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		await expect(
			performSoftResetSquash({
				repository: mockRepository,
				oldestCommitHash: "invalid",
				message: "Test",
			})
		).rejects.toThrow("git log failed");
	});
});

describe("performRebaseSquash", () => {
	beforeEach(() => {
		jest.clearAllMocks();

		mockIsomorphicGit.log.mockResolvedValue([
			{
				oid: "oldest123",
				commit: {
					parent: ["parent123"],
					tree: "oldtree456",
					message: "old commit",
				},
			},
		]);
		mockIsomorphicGit.resolveRef.mockResolvedValue("headcommit789");
		mockIsomorphicGit.readCommit.mockResolvedValue({
			oid: "newest123",
			commit: {
				tree: "newesttree123",
				parent: ["middle123"],
				message: "newest commit",
			},
		});
		mockIsomorphicGit.getConfig.mockImplementation(({ path }: { path: string }) => {
			if (path === "user.name") {
				return Promise.resolve("Test User");
			}
			if (path === "user.email") {
				return Promise.resolve("test@example.com");
			}
			return Promise.resolve(undefined);
		});
		mockIsomorphicGit.commit.mockResolvedValue("newcommit1234567890");
	});

	it("performs rebase squash using isomorphic-git", async () => {
		mockIsomorphicGit.log
			.mockResolvedValueOnce([
				{
					oid: "oldest123",
					commit: {
						parent: ["parent123"],
						tree: "oldtree456",
						message: "old commit",
					},
				},
			])
			.mockResolvedValueOnce([
				{
					oid: "newest123",
					commit: { tree: "tree1", message: "newest", parent: ["middle123"] },
				},
				{
					oid: "middle123",
					commit: { tree: "tree2", message: "middle", parent: ["oldest123"] },
				},
				{
					oid: "oldest123",
					commit: { tree: "tree3", message: "oldest", parent: ["parent123"] },
				},
			]);

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await performRebaseSquash({
			repository: mockRepository,
			commitHashes: ["newest123", "middle123", "oldest123"],
			message: "Squashed commits",
		});

		expect(result).toEqual({
			shortCommitHash: "newcomm",
			newCommitHash: "newcommit1234567890",
		});

		expect(mockIsomorphicGit.log).toHaveBeenCalledWith(
			expect.objectContaining({
				dir: "/project",
				ref: "oldest123",
				depth: 2,
			})
		);

		expect(mockIsomorphicGit.commit).toHaveBeenCalledWith(
			expect.objectContaining({
				dir: "/project",
				message: "Squashed commits",
				tree: "newesttree123",
				parent: ["parent123"],
			})
		);
	});

	it("throws SquashError when oldest commit has no parent", async () => {
		mockIsomorphicGit.log.mockResolvedValue([
			{
				oid: "oldest123",
				commit: {
					parent: [],
					tree: "tree456",
					message: "old commit",
				},
			},
		]);

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		await expect(
			performRebaseSquash({
				repository: mockRepository,
				commitHashes: ["newest", "oldest123"],
				message: "Test",
			})
		).rejects.toThrow("oldest commit has no parent");
	});

	it("throws when isomorphic-git fails", async () => {
		mockIsomorphicGit.log.mockRejectedValue(new Error("git log failed"));

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		await expect(
			performRebaseSquash({
				repository: mockRepository,
				commitHashes: ["hash1", "hash2"],
				message: "Test",
			})
		).rejects.toThrow("git log failed");
	});

	it("replays commits after the squashed range", async () => {
		mockIsomorphicGit.log
			.mockResolvedValueOnce([
				{
					oid: "oldest123",
					commit: {
						parent: ["parent123"],
						tree: "oldtree456",
						message: "old commit",
					},
				},
			])
			.mockResolvedValueOnce([
				{
					oid: "aftercommit1",
					commit: { tree: "aftertree1", message: "after 1", parent: ["newest123"] },
				},
				{
					oid: "newest123",
					commit: { tree: "tree1", message: "newest", parent: ["oldest123"] },
				},
				{
					oid: "oldest123",
					commit: { tree: "tree2", message: "oldest", parent: ["parent123"] },
				},
			]);

		mockIsomorphicGit.commit
			.mockResolvedValueOnce("squashedcommit123")
			.mockResolvedValueOnce("replayedcommit456");

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await performRebaseSquash({
			repository: mockRepository,
			commitHashes: ["newest123", "oldest123"],
			message: "Squashed",
		});

		expect(result).toEqual({
			shortCommitHash: "replaye",
			newCommitHash: "replayedcommit456",
		});

		expect(mockIsomorphicGit.commit).toHaveBeenCalledTimes(2);

		expect(mockIsomorphicGit.commit).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				message: "Squashed",
				parent: ["parent123"],
			})
		);

		expect(mockIsomorphicGit.commit).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				message: "after 1",
				tree: "aftertree1",
				parent: ["squashedcommit123"],
			})
		);
	});
});

describe("performRevertCommit", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("reverts a commit and creates new commit with message", async () => {
		mockExecFileAsync
			.mockResolvedValueOnce({ stdout: "", stderr: "" })
			.mockResolvedValueOnce({ stdout: "", stderr: "" })
			.mockResolvedValueOnce({ stdout: "abc1234567890\n", stderr: "" });

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await performRevertCommit({
			repository: mockRepository,
			targetHash: "def5678",
			message: "revert: original message",
		});

		expect(result).toEqual({
			newCommitHash: "abc1234567890",
			shortCommitHash: "abc1234",
		});

		expect(mockExecFileAsync).toHaveBeenCalledTimes(3);
		expect(mockExecFileAsync).toHaveBeenNthCalledWith(
			1,
			"git",
			["revert", "--no-commit", "def5678"],
			{ cwd: "/project" }
		);
		expect(mockExecFileAsync).toHaveBeenNthCalledWith(
			2,
			"git",
			["commit", "-m", "revert: original message"],
			{ cwd: "/project" }
		);
		expect(mockExecFileAsync).toHaveBeenNthCalledWith(3, "git", ["rev-parse", "HEAD"], {
			cwd: "/project",
		});
	});

	it("throws SquashError when git revert fails", async () => {
		const error = new Error("git revert failed") as Error & { stderr: string };
		error.stderr = "CONFLICT (content): Merge conflict in file.txt";
		mockExecFileAsync.mockRejectedValueOnce(error);

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		await expect(
			performRevertCommit({
				repository: mockRepository,
				targetHash: "def5678",
				message: "revert: test",
			})
		).rejects.toThrow("git revert --no-commit def5678 failed");
	});

	it("throws SquashError when git commit fails", async () => {
		mockExecFileAsync.mockResolvedValueOnce({ stdout: "", stderr: "" });
		const error = new Error("git commit failed") as Error & { stderr: string };
		error.stderr = "nothing to commit";
		mockExecFileAsync.mockRejectedValueOnce(error);

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		await expect(
			performRevertCommit({
				repository: mockRepository,
				targetHash: "def5678",
				message: "revert: test",
			})
		).rejects.toThrow();
	});
});

describe("getMergeBaseHash", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("returns null when on a protected branch", async () => {
		mockIsomorphicGit.currentBranch.mockResolvedValue("main");

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await getMergeBaseHash(mockRepository);
		expect(result).toBeNull();
	});

	it("returns null when on master branch", async () => {
		mockIsomorphicGit.currentBranch.mockResolvedValue("master");

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await getMergeBaseHash(mockRepository);
		expect(result).toBeNull();
	});

	it("returns null when not on a branch", async () => {
		mockIsomorphicGit.currentBranch.mockResolvedValue(undefined);

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await getMergeBaseHash(mockRepository);
		expect(result).toBeNull();
	});

	it("returns merge base hash when on a feature branch", async () => {
		mockIsomorphicGit.currentBranch.mockResolvedValue("feature/my-feature");
		mockExecFileAsync.mockResolvedValue({ stdout: "abc123def456\n", stderr: "" });

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await getMergeBaseHash(mockRepository);
		expect(result).toBe("abc123def456");
		expect(mockExecFileAsync).toHaveBeenCalledWith(
			"git",
			["merge-base", "feature/my-feature", "main"],
			{ cwd: "/project" }
		);
	});

	it("tries other parent branches if main doesn't exist", async () => {
		mockIsomorphicGit.currentBranch.mockResolvedValue("feature/my-feature");
		mockExecFileAsync
			.mockRejectedValueOnce(new Error("fatal: Not a valid ref"))
			.mockResolvedValueOnce({ stdout: "def456abc123\n", stderr: "" });

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await getMergeBaseHash(mockRepository);
		expect(result).toBe("def456abc123");
		expect(mockExecFileAsync).toHaveBeenNthCalledWith(
			1,
			"git",
			["merge-base", "feature/my-feature", "main"],
			{ cwd: "/project" }
		);
		expect(mockExecFileAsync).toHaveBeenNthCalledWith(
			2,
			"git",
			["merge-base", "feature/my-feature", "master"],
			{ cwd: "/project" }
		);
	});

	it("returns null if no parent branch exists", async () => {
		mockIsomorphicGit.currentBranch.mockResolvedValue("feature/my-feature");
		mockExecFileAsync.mockRejectedValue(new Error("fatal: Not a valid ref"));

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await getMergeBaseHash(mockRepository);
		expect(result).toBeNull();
	});

	it("returns null on git error", async () => {
		mockIsomorphicGit.currentBranch.mockRejectedValue(new Error("Not a git repository"));

		const mockRepository = {
			rootUri: vscode.Uri.file("/project"),
		} as unknown as Repository;

		const result = await getMergeBaseHash(mockRepository);
		expect(result).toBeNull();
	});
});
