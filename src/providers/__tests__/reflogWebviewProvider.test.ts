
import * as vscode from "vscode";
import { ReflogWebviewProvider } from "../reflogWebviewProvider";
import * as gitService from "../../services/git";

// Mock vscode
jest.mock("vscode", () => ({
	Uri: {
		file: jest.fn((path) => ({ fsPath: path, scheme: "file" })),
		joinPath: jest.fn(),
		parse: jest.fn(),
	},
	workspace: {
		registerTextDocumentContentProvider: jest.fn(),
	},
	window: {
		showErrorMessage: jest.fn(),
		showInformationMessage: jest.fn(),
		showWarningMessage: jest.fn(),
	},
	extensions: {
		getExtension: jest.fn(),
	},
	EventEmitter: jest.fn().mockImplementation(() => ({
		event: jest.fn(),
		fire: jest.fn(),
	})),
}), { virtual: true });

// Mock git service
jest.mock("../../services/git", () => ({
	getReflogEntries: jest.fn().mockResolvedValue([]),
	getActualCurrentBranch: jest.fn(),
	performSoftResetSquash: jest.fn(),
	performRebaseSquash: jest.fn(),
	getHeadHash: jest.fn(),
	ensureCleanWorkingTree: jest.fn().mockResolvedValue(true),
	performCherryPick: jest.fn(),
	getMergeBaseHash: jest.fn().mockResolvedValue(null),
}));

describe("ReflogWebviewProvider", () => {
	let provider: ReflogWebviewProvider;
	let mockContext: any;
	let mockExtensionUri: any;
	let mockWebview: any;
	let mockGitApi: any;

	beforeEach(() => {
		jest.clearAllMocks();

		mockExtensionUri = { fsPath: "/extension/path" };
		mockContext = {
			subscriptions: [],
			extensionUri: mockExtensionUri,
		};

		mockWebview = {
			options: {},
			onDidReceiveMessage: jest.fn(),
			postMessage: jest.fn(),
			asWebviewUri: jest.fn(),
			cspSource: "csp-source",
			title: "",
		};

		mockGitApi = {
			repositories: [],
		};

		(vscode.extensions.getExtension as jest.Mock).mockReturnValue({
			exports: {
				getAPI: () => mockGitApi,
			},
		});

		provider = new ReflogWebviewProvider(mockExtensionUri, mockContext);
		// Initialize the view
		provider.resolveWebviewView(
			{ webview: mockWebview, title: "" } as unknown as vscode.WebviewView,
			{} as vscode.WebviewViewResolveContext,
			{} as vscode.CancellationToken
		);
	});

	const callHandleMessage = async (message: any) => {
		// Access private method via casting
		await (provider as any).handleMessage(message);
	};

	const callUpdateReflog = async () => {
		// Access private method via casting
		await (provider as any).updateReflog();
	};

	describe("Protected Branch Detection", () => {
		it("sends branch info with reflog data", async () => {
			const mockRepo = { rootUri: { fsPath: "/repo1" } };
			mockGitApi.repositories = [mockRepo];
			(gitService.getActualCurrentBranch as jest.Mock).mockResolvedValue("main");
			(gitService.getReflogEntries as jest.Mock).mockResolvedValue([]);

			await callUpdateReflog();

			expect(mockWebview.postMessage).toHaveBeenCalledWith({
				type: "reflogData",
				entries: [],
				branch: "main",
				mergeBaseHash: null,
			});
		});

		it("sends null branch when no repositories", async () => {
			mockGitApi.repositories = [];

			await callUpdateReflog();

			expect(mockWebview.postMessage).toHaveBeenCalledWith({
				type: "reflogData",
				entries: [],
				branch: null,
				mergeBaseHash: null,
			});
		});

		it("sends branch name for feature branches", async () => {
			const mockRepo = { rootUri: { fsPath: "/repo1" } };
			mockGitApi.repositories = [mockRepo];
			(gitService.getActualCurrentBranch as jest.Mock).mockResolvedValue("feature/my-feature");
			(gitService.getReflogEntries as jest.Mock).mockResolvedValue([]);

			await callUpdateReflog();

			expect(mockWebview.postMessage).toHaveBeenCalledWith({
				type: "reflogData",
				entries: [],
				branch: "feature/my-feature",
				mergeBaseHash: null,
			});
		});

		it("sends merge base hash when available", async () => {
			const mockRepo = { rootUri: { fsPath: "/repo1" } };
			mockGitApi.repositories = [mockRepo];
			(gitService.getActualCurrentBranch as jest.Mock).mockResolvedValue("feature/my-feature");
			(gitService.getReflogEntries as jest.Mock).mockResolvedValue([
				{ hash: "abc123", message: "new commit", timestamp: "2024-01-01" },
				{ hash: "def456", message: "parent commit", timestamp: "2024-01-02" },
			]);
			(gitService.getMergeBaseHash as jest.Mock).mockResolvedValue("def456");

			await callUpdateReflog();

			expect(mockWebview.postMessage).toHaveBeenCalledWith({
				type: "reflogData",
				entries: [
					{ hash: "abc123", message: "new commit", timestamp: "2024-01-01", repoRoot: "/repo1", isNewCommit: true },
					{ hash: "def456", message: "parent commit", timestamp: "2024-01-02", repoRoot: "/repo1", isNewCommit: false },
				],
				branch: "feature/my-feature",
				mergeBaseHash: "def456",
			});
		});

		it("marks commits as new before merge base", async () => {
			const mockRepo = { rootUri: { fsPath: "/repo1" } };
			mockGitApi.repositories = [mockRepo];
			(gitService.getActualCurrentBranch as jest.Mock).mockResolvedValue("feature/my-feature");
			(gitService.getReflogEntries as jest.Mock).mockResolvedValue([
				{ hash: "new1", message: "newest commit", timestamp: "2024-01-01" },
				{ hash: "new2", message: "newer commit", timestamp: "2024-01-02" },
				{ hash: "mergebase", message: "merge base", timestamp: "2024-01-03" },
				{ hash: "old1", message: "old commit", timestamp: "2024-01-04" },
			]);
			(gitService.getMergeBaseHash as jest.Mock).mockResolvedValue("mergebase");

			await callUpdateReflog();

			const call = mockWebview.postMessage.mock.calls[0][0];
			expect(call.entries[0].isNewCommit).toBe(true);
			expect(call.entries[1].isNewCommit).toBe(true);
			expect(call.entries[2].isNewCommit).toBe(false); // merge base itself
			expect(call.entries[3].isNewCommit).toBe(false);
		});
	});

	describe("Squash Tests", () => {

	it("fails if no git extension or repositories", async () => {
		mockGitApi.repositories = [];
		
		await callHandleMessage({
			type: "squashCommits",
			entries: [
				{ hash: "hash1", message: "msg1", repoRoot: "/repo1" },
				{ hash: "hash2", message: "msg2", repoRoot: "/repo1" }
			]
		});

		// Should return early, no calls to squash functions
		expect(gitService.performSoftResetSquash).not.toHaveBeenCalled();
		expect(gitService.performRebaseSquash).not.toHaveBeenCalled();
	});

	it("fails if fewer than 2 entries", async () => {
		mockGitApi.repositories = [{ rootUri: { fsPath: "/repo1" } }];
		
		await callHandleMessage({
			type: "squashCommits",
			entries: [
				{ hash: "hash1", message: "msg1", repoRoot: "/repo1" }
			]
		});

		expect(gitService.performSoftResetSquash).not.toHaveBeenCalled();
		expect(gitService.performRebaseSquash).not.toHaveBeenCalled();
	});

	it("fails if entries are from different repositories", async () => {
		mockGitApi.repositories = [
			{ rootUri: { fsPath: "/repo1" } },
			{ rootUri: { fsPath: "/repo2" } }
		];
		
		await callHandleMessage({
			type: "squashCommits",
			entries: [
				{ hash: "hash1", message: "msg1", repoRoot: "/repo1" },
				{ hash: "hash2", message: "msg2", repoRoot: "/repo2" }
			]
		});

		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			"Cannot squash commits from different repositories"
		);
		expect(gitService.performSoftResetSquash).not.toHaveBeenCalled();
	});

	it("fails if repository is not found", async () => {
		mockGitApi.repositories = [{ rootUri: { fsPath: "/other-repo" } }];
		
		await callHandleMessage({
			type: "squashCommits",
			entries: [
				{ hash: "hash1", message: "msg1", repoRoot: "/repo1" },
				{ hash: "hash2", message: "msg2", repoRoot: "/repo1" }
			]
		});

		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			"Repository not found"
		);
		expect(gitService.performSoftResetSquash).not.toHaveBeenCalled();
	});

	it("performs soft reset squash when newest commit is HEAD", async () => {
		const repoRoot = "/repo1";
		const mockRepo = { rootUri: { fsPath: repoRoot } };
		mockGitApi.repositories = [mockRepo];
		
		(gitService.getHeadHash as jest.Mock).mockResolvedValue("hash1");
		(vscode.window.showWarningMessage as jest.Mock).mockResolvedValue("Squash");
		
		const entries = [
			{ hash: "hash1", message: "Newest", repoRoot },
			{ hash: "hash2", message: "Middle", repoRoot },
			{ hash: "hash3", message: "Oldest", repoRoot },
		];

		await callHandleMessage({
			type: "squashCommits",
			entries
		});

		expect(gitService.getHeadHash).toHaveBeenCalledWith(mockRepo);
		expect(gitService.performSoftResetSquash).toHaveBeenCalledWith({
			repository: mockRepo,
			oldestCommitHash: "hash3",
			message: "Oldest\n\nMiddle\n\nNewest",
		});
		expect(gitService.performRebaseSquash).not.toHaveBeenCalled();
		expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
			"Commits squashed successfully"
		);
	});

	it("performs rebase squash when newest commit is NOT HEAD", async () => {
		const repoRoot = "/repo1";
		const mockRepo = { rootUri: { fsPath: repoRoot } };
		mockGitApi.repositories = [mockRepo];
		
		(gitService.getHeadHash as jest.Mock).mockResolvedValue("other-head");
		(vscode.window.showWarningMessage as jest.Mock).mockResolvedValue("Squash");
		
		const entries = [
			{ hash: "hash1", message: "Newest", repoRoot },
			{ hash: "hash2", message: "Oldest", repoRoot },
		];

		await callHandleMessage({
			type: "squashCommits",
			entries
		});

		expect(gitService.getHeadHash).toHaveBeenCalledWith(mockRepo);
		expect(gitService.performRebaseSquash).toHaveBeenCalledWith({
			repository: mockRepo,
			commitHashes: ["hash1", "hash2"],
			message: "Oldest\n\nNewest",
		});
		expect(gitService.performSoftResetSquash).not.toHaveBeenCalled();
		expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
			"Commits squashed successfully"
		);
	});

	it("aborts squash if user cancels confirmation", async () => {
		const repoRoot = "/repo1";
		const mockRepo = { rootUri: { fsPath: repoRoot } };
		mockGitApi.repositories = [mockRepo];
		
		(vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined); // User cancels/closes modal
		
		const entries = [
			{ hash: "hash1", message: "Newest", repoRoot },
			{ hash: "hash2", message: "Oldest", repoRoot },
		];

		await callHandleMessage({
			type: "squashCommits",
			entries
		});

		expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
			`Are you sure you want to squash 2 commits into the oldest selected commit (hash2)?`,
			{ modal: true },
			"Squash"
		);
		
		expect(gitService.performSoftResetSquash).not.toHaveBeenCalled();
		expect(gitService.performRebaseSquash).not.toHaveBeenCalled();
	});

	it("handles squash errors gracefully", async () => {
		const repoRoot = "/repo1";
		const mockRepo = { rootUri: { fsPath: repoRoot } };
		mockGitApi.repositories = [mockRepo];
		
		(gitService.getHeadHash as jest.Mock).mockResolvedValue("hash1");
		(vscode.window.showWarningMessage as jest.Mock).mockResolvedValue("Squash");
		(gitService.performSoftResetSquash as jest.Mock).mockRejectedValue(
			new Error("Squash failed")
		);

		const entries = [
			{ hash: "hash1", message: "Newest", repoRoot },
			{ hash: "hash2", message: "Oldest", repoRoot },
		];

		await callHandleMessage({
			type: "squashCommits",
			entries
		});

		expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
			"Failed to squash commits: Squash failed"
		);
	});
	});

	describe("Checkout Tests", () => {
		it("fails if no git repositories", async () => {
			mockGitApi.repositories = [];

			await callHandleMessage({
				type: "checkoutCommit",
				entry: { hash: "abc123", message: "test", repoRoot: "/repo1" },
			});

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("No Git repository found");
		});

		it("fails if repository not found", async () => {
			mockGitApi.repositories = [{ rootUri: { fsPath: "/different-repo" } }];

			await callHandleMessage({
				type: "checkoutCommit",
				entry: { hash: "abc123", message: "test", repoRoot: "/repo1" },
			});

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("Repository not found");
		});

		it("does nothing if user cancels confirmation", async () => {
			const mockRepo = {
				rootUri: { fsPath: "/repo1" },
				checkout: jest.fn(),
			};
			mockGitApi.repositories = [mockRepo];
			(vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

			await callHandleMessage({
				type: "checkoutCommit",
				entry: { hash: "abc123", message: "test", repoRoot: "/repo1" },
			});

			expect(mockRepo.checkout).not.toHaveBeenCalled();
		});

		it("checks out commit when user confirms", async () => {
			const mockRepo = {
				rootUri: { fsPath: "/repo1" },
				checkout: jest.fn().mockResolvedValue(undefined),
			};
			mockGitApi.repositories = [mockRepo];
			(vscode.window.showWarningMessage as jest.Mock).mockResolvedValue("Checkout");

			await callHandleMessage({
				type: "checkoutCommit",
				entry: { hash: "abc123def", message: "test", repoRoot: "/repo1" },
			});

			expect(mockRepo.checkout).toHaveBeenCalledWith("abc123def");
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				"Checked out commit abc123d"
			);
		});

		it("shows error when checkout fails", async () => {
			const mockRepo = {
				rootUri: { fsPath: "/repo1" },
				checkout: jest.fn().mockRejectedValue(new Error("Checkout failed")),
			};
			mockGitApi.repositories = [mockRepo];
			(vscode.window.showWarningMessage as jest.Mock).mockResolvedValue("Checkout");

			await callHandleMessage({
				type: "checkoutCommit",
				entry: { hash: "abc123", message: "test", repoRoot: "/repo1" },
			});

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Failed to checkout commit: Checkout failed"
			);
		});
	});

	describe("Cherry-pick Tests", () => {
		it("fails if no git repositories", async () => {
			mockGitApi.repositories = [];

			await callHandleMessage({
				type: "cherryPickCommit",
				entry: { hash: "abc123", message: "test", repoRoot: "/repo1" },
			});

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("No Git repository found");
		});

		it("fails if no branches available", async () => {
			const mockRepo = {
				rootUri: { fsPath: "/repo1" },
				getBranches: jest.fn().mockResolvedValue([]),
			};
			mockGitApi.repositories = [mockRepo];

			await callHandleMessage({
				type: "cherryPickCommit",
				entry: { hash: "abc123", message: "test", repoRoot: "/repo1" },
			});

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith("No local branches found");
		});

		it("fails if no other branches besides current", async () => {
			const mockRepo = {
				rootUri: { fsPath: "/repo1" },
				getBranches: jest.fn().mockResolvedValue([{ name: "main" }]),
			};
			mockGitApi.repositories = [mockRepo];
			(gitService.getActualCurrentBranch as jest.Mock).mockResolvedValue("main");

			await callHandleMessage({
				type: "cherryPickCommit",
				entry: { hash: "abc123", message: "test", repoRoot: "/repo1" },
			});

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"No other branches available to cherry-pick to"
			);
		});

		it("does nothing if user cancels branch selection", async () => {
			const mockRepo = {
				rootUri: { fsPath: "/repo1" },
				getBranches: jest.fn().mockResolvedValue([{ name: "main" }, { name: "feature" }]),
				checkout: jest.fn(),
			};
			mockGitApi.repositories = [mockRepo];
			(gitService.getActualCurrentBranch as jest.Mock).mockResolvedValue("main");
			(vscode.window.showQuickPick as any) = jest.fn().mockResolvedValue(undefined);

			await callHandleMessage({
				type: "cherryPickCommit",
				entry: { hash: "abc123", message: "test", repoRoot: "/repo1" },
			});

			expect(mockRepo.checkout).not.toHaveBeenCalled();
		});

		it("fails if working tree is dirty", async () => {
			const mockRepo = {
				rootUri: { fsPath: "/repo1" },
				getBranches: jest.fn().mockResolvedValue([{ name: "main" }, { name: "feature" }]),
				checkout: jest.fn(),
			};
			mockGitApi.repositories = [mockRepo];
			(gitService.getActualCurrentBranch as jest.Mock).mockResolvedValue("main");
			(vscode.window.showQuickPick as any) = jest.fn().mockResolvedValue({ label: "feature" });
			(gitService.ensureCleanWorkingTree as jest.Mock).mockResolvedValue(false);

			await callHandleMessage({
				type: "cherryPickCommit",
				entry: { hash: "abc123", message: "test", repoRoot: "/repo1" },
			});

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Cannot cherry-pick: you have uncommitted changes. Commit or stash them first."
			);
			expect(mockRepo.checkout).not.toHaveBeenCalled();
		});

		it("cherry-picks commit to selected branch", async () => {
			const mockRepo = {
				rootUri: { fsPath: "/repo1" },
				getBranches: jest.fn().mockResolvedValue([{ name: "main" }, { name: "feature" }]),
				checkout: jest.fn().mockResolvedValue(undefined),
			};
			mockGitApi.repositories = [mockRepo];
			(gitService.getActualCurrentBranch as jest.Mock).mockResolvedValue("main");
			(vscode.window.showQuickPick as any) = jest.fn().mockResolvedValue({ label: "feature" });
			(gitService.ensureCleanWorkingTree as jest.Mock).mockResolvedValue(true);
			(gitService.performCherryPick as jest.Mock).mockResolvedValue({
				newCommitHash: "newdef456",
				shortCommitHash: "newdef4",
			});

			await callHandleMessage({
				type: "cherryPickCommit",
				entry: { hash: "abc123def", message: "test", repoRoot: "/repo1" },
			});

			expect(mockRepo.checkout).toHaveBeenCalledWith("feature");
			expect(gitService.performCherryPick).toHaveBeenCalledWith({
				repository: mockRepo,
				targetHash: "abc123def",
			});
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				"Cherry-picked abc123d to feature as newdef4"
			);
		});

		it("shows error when cherry-pick fails", async () => {
			const mockRepo = {
				rootUri: { fsPath: "/repo1" },
				getBranches: jest.fn().mockResolvedValue([{ name: "main" }, { name: "feature" }]),
				checkout: jest.fn().mockResolvedValue(undefined),
			};
			mockGitApi.repositories = [mockRepo];
			(gitService.getActualCurrentBranch as jest.Mock).mockResolvedValue("main");
			(vscode.window.showQuickPick as any) = jest.fn().mockResolvedValue({ label: "feature" });
			(gitService.ensureCleanWorkingTree as jest.Mock).mockResolvedValue(true);
			(gitService.performCherryPick as jest.Mock).mockRejectedValue(
				new Error("Cherry-pick failed")
			);

			await callHandleMessage({
				type: "cherryPickCommit",
				entry: { hash: "abc123", message: "test", repoRoot: "/repo1" },
			});

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Failed to cherry-pick commit: Cherry-pick failed"
			);
		});

		it("shows conflict message when cherry-pick has conflicts", async () => {
			const mockRepo = {
				rootUri: { fsPath: "/repo1" },
				getBranches: jest.fn().mockResolvedValue([{ name: "main" }, { name: "feature" }]),
				checkout: jest.fn().mockResolvedValue(undefined),
			};
			mockGitApi.repositories = [mockRepo];
			(gitService.getActualCurrentBranch as jest.Mock).mockResolvedValue("main");
			(vscode.window.showQuickPick as any) = jest.fn().mockResolvedValue({ label: "feature" });
			(gitService.ensureCleanWorkingTree as jest.Mock).mockResolvedValue(true);

			const conflictError = new Error("Cherry-pick failed") as Error & { stderr?: string };
			conflictError.stderr = "CONFLICT (content): Merge conflict in file.txt";
			(gitService.performCherryPick as jest.Mock).mockRejectedValue(conflictError);

			await callHandleMessage({
				type: "cherryPickCommit",
				entry: { hash: "abc123", message: "test", repoRoot: "/repo1" },
			});

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Cherry-pick caused merge conflicts. Resolve the conflicts and commit the changes manually."
			);
		});
	});
});
