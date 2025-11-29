
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
}));

describe("ReflogWebviewProvider Squash Tests", () => {
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
			{ webview: mockWebview } as vscode.WebviewView,
			{} as vscode.WebviewViewResolveContext,
			{} as vscode.CancellationToken
		);
	});

	const callHandleMessage = async (message: any) => {
		// Access private method via casting
		await (provider as any).handleMessage(message);
	};

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
