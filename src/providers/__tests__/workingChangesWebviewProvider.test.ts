import * as vscode from "vscode";
import { WorkingChangesWebviewProvider } from "../workingChangesWebviewProvider";

jest.mock("vscode", () => ({
	Uri: {
		file: jest.fn((path) => ({ fsPath: path, scheme: "file" })),
		joinPath: jest.fn((base, ...paths) => ({
			fsPath: `${base.fsPath}/${paths.join("/")}`,
		})),
	},
	window: {
		showErrorMessage: jest.fn(),
		showWarningMessage: jest.fn(),
		activeTextEditor: undefined,
	},
	extensions: {
		getExtension: jest.fn(),
	},
	commands: {
		executeCommand: jest.fn(),
	},
	Disposable: {
		from: jest.fn(() => ({ dispose: jest.fn() })),
	},
}), { virtual: true });

jest.mock("node:child_process", () => ({
	execFile: jest.fn(),
}));

jest.mock("node:util", () => ({
	promisify: jest.fn(() => jest.fn().mockResolvedValue({ stdout: "", stderr: "" })),
}));

describe("WorkingChangesWebviewProvider", () => {
	let provider: WorkingChangesWebviewProvider;
	let mockExtensionUri: vscode.Uri;
	let mockWebviewView: any;
	let mockWebview: any;
	let mockGitApi: any;
	let messageHandler: (message: any) => Promise<void>;

	beforeEach(() => {
		jest.clearAllMocks();

		mockExtensionUri = { fsPath: "/extension/path" } as vscode.Uri;

		mockWebview = {
			options: {},
			html: "",
			onDidReceiveMessage: jest.fn((handler) => {
				messageHandler = handler;
				return { dispose: jest.fn() };
			}),
			postMessage: jest.fn(),
			asWebviewUri: jest.fn((uri) => uri),
			cspSource: "csp-source",
		};

		mockWebviewView = {
			webview: mockWebview,
			onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
		};

		mockGitApi = {
			repositories: [],
		};

		(vscode.extensions.getExtension as jest.Mock).mockReturnValue({
			exports: {
				getAPI: () => mockGitApi,
			},
		});

		provider = new WorkingChangesWebviewProvider(mockExtensionUri);
		provider.resolveWebviewView(
			mockWebviewView as unknown as vscode.WebviewView,
			{} as vscode.WebviewViewResolveContext,
			{} as vscode.CancellationToken
		);
	});

	describe("Stage File", () => {
		it("does nothing if no git repositories", async () => {
			mockGitApi.repositories = [];

			await messageHandler({ type: "stageFile", path: "src/file.ts" });

			expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
		});

		it("stages file using absolute path", async () => {
			const mockAdd = jest.fn().mockResolvedValue(undefined);
			const mockRepo = {
				rootUri: { fsPath: "/repo" },
				state: { onDidChange: jest.fn(() => ({ dispose: jest.fn() })) },
				add: mockAdd,
			};
			mockGitApi.repositories = [mockRepo];

			await messageHandler({ type: "stageFile", path: "src/file.ts" });

			expect(mockAdd).toHaveBeenCalledWith(["/repo/src/file.ts"]);
		});

		it("shows error when staging fails", async () => {
			const mockAdd = jest.fn().mockRejectedValue(new Error("Git add failed"));
			const mockRepo = {
				rootUri: { fsPath: "/repo" },
				state: { onDidChange: jest.fn(() => ({ dispose: jest.fn() })) },
				add: mockAdd,
			};
			mockGitApi.repositories = [mockRepo];

			await messageHandler({ type: "stageFile", path: "src/file.ts" });

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Failed to stage file: Error: Git add failed"
			);
		});

		it("uses repository matching active editor", async () => {
			const mockAdd1 = jest.fn().mockResolvedValue(undefined);
			const mockAdd2 = jest.fn().mockResolvedValue(undefined);
			const mockRepo1 = {
				rootUri: { fsPath: "/repo1" },
				state: { onDidChange: jest.fn(() => ({ dispose: jest.fn() })) },
				add: mockAdd1,
			};
			const mockRepo2 = {
				rootUri: { fsPath: "/repo2" },
				state: { onDidChange: jest.fn(() => ({ dispose: jest.fn() })) },
				add: mockAdd2,
			};
			mockGitApi.repositories = [mockRepo1, mockRepo2];

			(vscode.window as any).activeTextEditor = {
				document: { uri: { fsPath: "/repo2/src/other.ts" } },
			};

			await messageHandler({ type: "stageFile", path: "src/file.ts" });

			expect(mockAdd2).toHaveBeenCalledWith(["/repo2/src/file.ts"]);
			expect(mockAdd1).not.toHaveBeenCalled();
		});
	});

	describe("Unstage File", () => {
		it("does nothing if no git repositories", async () => {
			mockGitApi.repositories = [];

			await messageHandler({ type: "unstageFile", path: "src/file.ts" });

			expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
		});

		it("unstages file using absolute path", async () => {
			const mockRevert = jest.fn().mockResolvedValue(undefined);
			const mockRepo = {
				rootUri: { fsPath: "/repo" },
				state: { onDidChange: jest.fn(() => ({ dispose: jest.fn() })) },
				revert: mockRevert,
			};
			mockGitApi.repositories = [mockRepo];

			await messageHandler({ type: "unstageFile", path: "src/file.ts" });

			expect(mockRevert).toHaveBeenCalledWith(["/repo/src/file.ts"]);
		});

		it("shows error when unstaging fails", async () => {
			const mockRevert = jest.fn().mockRejectedValue(new Error("Git revert failed"));
			const mockRepo = {
				rootUri: { fsPath: "/repo" },
				state: { onDidChange: jest.fn(() => ({ dispose: jest.fn() })) },
				revert: mockRevert,
			};
			mockGitApi.repositories = [mockRepo];

			await messageHandler({ type: "unstageFile", path: "src/file.ts" });

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Failed to unstage file: Error: Git revert failed"
			);
		});

		it("uses repository matching active editor", async () => {
			const mockRevert1 = jest.fn().mockResolvedValue(undefined);
			const mockRevert2 = jest.fn().mockResolvedValue(undefined);
			const mockRepo1 = {
				rootUri: { fsPath: "/repo1" },
				state: { onDidChange: jest.fn(() => ({ dispose: jest.fn() })) },
				revert: mockRevert1,
			};
			const mockRepo2 = {
				rootUri: { fsPath: "/repo2" },
				state: { onDidChange: jest.fn(() => ({ dispose: jest.fn() })) },
				revert: mockRevert2,
			};
			mockGitApi.repositories = [mockRepo1, mockRepo2];

			(vscode.window as any).activeTextEditor = {
				document: { uri: { fsPath: "/repo2/src/other.ts" } },
			};

			await messageHandler({ type: "unstageFile", path: "src/file.ts" });

			expect(mockRevert2).toHaveBeenCalledWith(["/repo2/src/file.ts"]);
			expect(mockRevert1).not.toHaveBeenCalled();
		});
	});
});
