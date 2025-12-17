jest.mock(
	"vscode",
	() => ({
		extensions: {
			getExtension: jest.fn(),
		},
		window: {
			showWarningMessage: jest.fn(),
			showErrorMessage: jest.fn(),
			setStatusBarMessage: jest.fn(),
			withProgress: jest.fn(),
		},
		ProgressLocation: {
			Notification: 15,
		},
		ExtensionMode: {
			Development: 1,
			Production: 2,
		},
		Uri: {
			file: (path: string) => ({ fsPath: path }),
		},
	}),
	{ virtual: true }
);

jest.mock("../../services/ai-providers/fireworks");
jest.mock("../../services/git");
jest.mock("../../services/config");

import * as vscode from "vscode";
import { generateCommitMessage } from "../generateCommitMessage";
import { FireworksProvider } from "../../services/ai-providers/fireworks";
import { getDiffs, getCurrentBranch, getCurrentAuthor, getVSCodeGitAPI, getRepositoryByRoot } from "../../services/git";
import { readConfiguration } from "../../services/config";
import type { API, Repository } from "../../types/git";

const mockFireworksProvider = FireworksProvider as jest.MockedClass<typeof FireworksProvider>;
const mockGetDiffs = getDiffs as jest.MockedFunction<typeof getDiffs>;
const mockGetCurrentBranch = getCurrentBranch as jest.MockedFunction<typeof getCurrentBranch>;
const mockGetCurrentAuthor = getCurrentAuthor as jest.MockedFunction<typeof getCurrentAuthor>;
const mockReadConfiguration = readConfiguration as jest.MockedFunction<typeof readConfiguration>;
const mockGetVSCodeGitAPI = getVSCodeGitAPI as jest.MockedFunction<typeof getVSCodeGitAPI>;
const mockGetRepositoryByRoot = getRepositoryByRoot as jest.MockedFunction<typeof getRepositoryByRoot>;

describe("generateCommitMessage", () => {
	const mockContext = {
		extensionMode: vscode.ExtensionMode.Development,
	} as vscode.ExtensionContext;

	const mockRepository = {
		inputBox: { value: "" },
		rootUri: { fsPath: "/project" },
	} as unknown as Repository;

	const mockSourceControl = {
		rootUri: { fsPath: "/project" },
	} as vscode.SourceControl;

	const mockGitApi = {
		repositories: [mockRepository],
	} as unknown as API;

	beforeEach(() => {
		jest.clearAllMocks();

		mockGetVSCodeGitAPI.mockReturnValue(mockGitApi);
		mockGetRepositoryByRoot.mockReturnValue(mockRepository);

		mockGetDiffs.mockReturnValue({
			"src/test.ts": { diff: "+const x = 1;" },
		});
		mockGetCurrentBranch.mockReturnValue("main");
		mockGetCurrentAuthor.mockReturnValue("test@example.com");
		mockReadConfiguration.mockReturnValue({ success: false, data: undefined });

		(vscode.window.withProgress as jest.Mock).mockImplementation(async (options, task) => {
			const mockToken = {
				onCancellationRequested: jest.fn(),
			};
			return await task({}, mockToken);
		});
	});

	it("generates commit message successfully", async () => {
		const mockStreamCommitMessage = jest.fn().mockImplementation(async function* () {
			yield "Test ";
			yield "commit ";
			yield "message";
		});
		mockFireworksProvider.prototype.streamCommitMessage = mockStreamCommitMessage;

		await generateCommitMessage(mockSourceControl, mockContext);

		expect(mockRepository.inputBox.value).toBe("Test commit message");
		expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
			"Commity: Commit message generated!",
			5000
		);
	});

	it("shows warning when no repository is found", async () => {
		mockGetVSCodeGitAPI.mockReturnValue(undefined);

		await generateCommitMessage(mockSourceControl, mockContext);

		expect(vscode.window.showWarningMessage).toHaveBeenCalledWith("No Git repository found");
	});

	it("shows status message when no changes", async () => {
		mockGetDiffs.mockReturnValue({});

		await generateCommitMessage(mockSourceControl, mockContext);

		expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
			"Commity: No changes to commit",
			5000
		);
	});

	describe("Error Handling", () => {
		it("handles cancellation gracefully", async () => {
			const mockStreamCommitMessage = jest.fn().mockImplementation(async function* () {
				yield "";
				throw Object.assign(new Error("User cancelled"), { name: "AbortError" });
			});
			mockFireworksProvider.prototype.streamCommitMessage = mockStreamCommitMessage;

			await generateCommitMessage(mockSourceControl, mockContext);

			expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
				"Commity: Generation cancelled",
				5000
			);
			expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
		});

		it("handles rate limit error (429)", async () => {
			const mockStreamCommitMessage = jest.fn().mockImplementation(async function* () {
				yield "";
				throw new Error("Fireworks API error: 429 - Rate limit exceeded");
			});
			mockFireworksProvider.prototype.streamCommitMessage = mockStreamCommitMessage;

			await generateCommitMessage(mockSourceControl, mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Failed to generate commit message. Fireworks API error: 429 - Rate limit exceeded"
			);
		});

		it("handles rate limit error with lowercase text", async () => {
			const mockStreamCommitMessage = jest.fn().mockImplementation(async function* () {
				yield "";
				throw new Error("rate limit exceeded after retries");
			});
			mockFireworksProvider.prototype.streamCommitMessage = mockStreamCommitMessage;

			await generateCommitMessage(mockSourceControl, mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Failed to generate commit message. rate limit exceeded after retries"
			);
		});

		it("handles 500 server error", async () => {
			const mockStreamCommitMessage = jest.fn().mockImplementation(async function* () {
				yield "";
				throw new Error("Fireworks API error: 500 - Internal server error");
			});
			mockFireworksProvider.prototype.streamCommitMessage = mockStreamCommitMessage;

			await generateCommitMessage(mockSourceControl, mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Failed to generate commit message. Fireworks API error: 500 - Internal server error"
			);
		});

		it("handles 503 server error", async () => {
			const mockStreamCommitMessage = jest.fn().mockImplementation(async function* () {
				yield "";
				throw new Error("Fireworks API error: 503 - Service unavailable");
			});
			mockFireworksProvider.prototype.streamCommitMessage = mockStreamCommitMessage;

			await generateCommitMessage(mockSourceControl, mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Failed to generate commit message. Fireworks API error: 503 - Service unavailable"
			);
		});

		it("handles 400 bad request error", async () => {
			const mockStreamCommitMessage = jest.fn().mockImplementation(async function* () {
				yield "";
				throw new Error("Fireworks API error: 400 - Bad request");
			});
			mockFireworksProvider.prototype.streamCommitMessage = mockStreamCommitMessage;

			await generateCommitMessage(mockSourceControl, mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Failed to generate commit message. Fireworks API error: 400 - Bad request"
			);
		});

		it("handles 401 unauthorized error", async () => {
			const mockStreamCommitMessage = jest.fn().mockImplementation(async function* () {
				yield "";
				throw new Error("Fireworks API error: 401 - Unauthorized");
			});
			mockFireworksProvider.prototype.streamCommitMessage = mockStreamCommitMessage;

			await generateCommitMessage(mockSourceControl, mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Failed to generate commit message. Fireworks API error: 401 - Unauthorized"
			);
		});

		it("handles 403 forbidden error", async () => {
			const mockStreamCommitMessage = jest.fn().mockImplementation(async function* () {
				yield "";
				throw new Error("Fireworks API error: 403 - Forbidden");
			});
			mockFireworksProvider.prototype.streamCommitMessage = mockStreamCommitMessage;

			await generateCommitMessage(mockSourceControl, mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Failed to generate commit message. Fireworks API error: 403 - Forbidden"
			);
		});

		it("handles generic errors", async () => {
			const mockStreamCommitMessage = jest.fn().mockImplementation(async function* () {
				yield "";
				throw new Error("Unexpected error occurred");
			});
			mockFireworksProvider.prototype.streamCommitMessage = mockStreamCommitMessage;

			await generateCommitMessage(mockSourceControl, mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Failed to generate commit message. Unexpected error occurred"
			);
		});

		it("handles non-Error objects", async () => {
			const mockStreamCommitMessage = jest.fn().mockImplementation(async function* () {
				yield "";
				// eslint-disable-next-line no-throw-literal
				throw "String error";
			});
			mockFireworksProvider.prototype.streamCommitMessage = mockStreamCommitMessage;

			await generateCommitMessage(mockSourceControl, mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Failed to generate commit message. Unknown error"
			);
		});
	});

	describe("Configuration Override", () => {
		it("includes configuration override in request", async () => {
			const mockStreamCommitMessage = jest.fn().mockImplementation(async function* () {
				yield "Test message";
			});
			mockFireworksProvider.prototype.streamCommitMessage = mockStreamCommitMessage;

			mockReadConfiguration.mockReturnValue({
				success: true,
				data: "Custom prompt template",
			});

			await generateCommitMessage(mockSourceControl, mockContext);

			expect(mockStreamCommitMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					override: "Custom prompt template",
				}),
				expect.any(Object)
			);
		});

		it("passes undefined override when config read fails", async () => {
			const mockStreamCommitMessage = jest.fn().mockImplementation(async function* () {
				yield "Test message";
			});
			mockFireworksProvider.prototype.streamCommitMessage = mockStreamCommitMessage;

			mockReadConfiguration.mockReturnValue({ success: false, data: undefined });

			await generateCommitMessage(mockSourceControl, mockContext);

			expect(mockStreamCommitMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					override: undefined,
				}),
				expect.any(Object)
			);
		});
	});

	describe("Progress Handling", () => {
		it("sets up cancellation handler", async () => {
			const mockGenerateCommitMessage = jest.fn().mockResolvedValue("Test message");
			mockFireworksProvider.prototype.generateCommitMessage = mockGenerateCommitMessage;

			const mockOnCancellationRequested = jest.fn();
			(vscode.window.withProgress as jest.Mock).mockImplementation(async (options, task) => {
				const mockToken = {
					onCancellationRequested: mockOnCancellationRequested,
				};
				return await task({}, mockToken);
			});

			await generateCommitMessage(mockSourceControl, mockContext);

			expect(mockOnCancellationRequested).toHaveBeenCalled();
		});

		it("displays progress notification", async () => {
			const mockGenerateCommitMessage = jest.fn().mockResolvedValue("Test message");
			mockFireworksProvider.prototype.generateCommitMessage = mockGenerateCommitMessage;

			await generateCommitMessage(mockSourceControl, mockContext);

			expect(vscode.window.withProgress).toHaveBeenCalledWith(
				expect.objectContaining({
					location: vscode.ProgressLocation.Notification,
					title: "Generating commit message...",
					cancellable: true,
				}),
				expect.any(Function)
			);
		});
	});

	describe("Multi-Repository Support", () => {
		it("matches repository by rootUri", async () => {
			const mockRepo1 = {
				inputBox: { value: "" },
				rootUri: { fsPath: "/project1" },
			} as unknown as Repository;
			const mockRepo2 = {
				inputBox: { value: "" },
				rootUri: { fsPath: "/project2" },
			} as unknown as Repository;

			const mockMultiGitApi = {
				repositories: [mockRepo1, mockRepo2],
			} as unknown as API;

			mockGetVSCodeGitAPI.mockReturnValue(mockMultiGitApi);
			mockGetRepositoryByRoot.mockReturnValue(mockRepo2);

			const sourceControlForRepo2 = {
				rootUri: { fsPath: "/project2" },
			} as vscode.SourceControl;

			const mockStreamCommitMessage = jest.fn().mockImplementation(async function* () {
				yield "Commit for repo2";
			});
			mockFireworksProvider.prototype.streamCommitMessage = mockStreamCommitMessage;

			await generateCommitMessage(sourceControlForRepo2, mockContext);

			expect((mockRepo2 as { inputBox: { value: string } }).inputBox.value).toBe("Commit for repo2");
			expect((mockRepo1 as { inputBox: { value: string } }).inputBox.value).toBe("");
		});

		it("handles multiple repositories in workspace", async () => {
			const mockRepo1 = {
				inputBox: { value: "" },
				rootUri: { fsPath: "/workspace/repo1" },
			} as unknown as Repository;
			const mockRepo2 = {
				inputBox: { value: "" },
				rootUri: { fsPath: "/workspace/repo2" },
			} as unknown as Repository;
			const mockRepo3 = {
				inputBox: { value: "" },
				rootUri: { fsPath: "/workspace/repo3" },
			} as unknown as Repository;

			const mockMultiGitApi = {
				repositories: [mockRepo1, mockRepo2, mockRepo3],
			} as unknown as API;

			mockGetVSCodeGitAPI.mockReturnValue(mockMultiGitApi);
			mockGetRepositoryByRoot.mockReturnValue(mockRepo1);

			const sourceControlForRepo1 = {
				rootUri: { fsPath: "/workspace/repo1" },
			} as vscode.SourceControl;

			const mockStreamCommitMessage = jest.fn().mockImplementation(async function* () {
				yield "First repo commit";
			});
			mockFireworksProvider.prototype.streamCommitMessage = mockStreamCommitMessage;

			await generateCommitMessage(sourceControlForRepo1, mockContext);

			expect((mockRepo1 as { inputBox: { value: string } }).inputBox.value).toBe("First repo commit");
			expect((mockRepo2 as { inputBox: { value: string } }).inputBox.value).toBe("");
			expect((mockRepo3 as { inputBox: { value: string } }).inputBox.value).toBe("");
		});

		it("shows warning when sourceControl doesn't match any repository", async () => {
			const mockRepo1 = {
				inputBox: { value: "" },
				rootUri: { fsPath: "/project1" },
			} as unknown as Repository;

			const mockGitApi = {
				repositories: [mockRepo1],
			} as unknown as API;

			mockGetVSCodeGitAPI.mockReturnValue(mockGitApi);
			mockGetRepositoryByRoot.mockReturnValue(undefined);

			const nonMatchingSourceControl = {
				rootUri: { fsPath: "/different/project" },
			} as vscode.SourceControl;

			await generateCommitMessage(nonMatchingSourceControl, mockContext);

			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith("No Git repository found");
		});

		it("passes correct repository to git service functions", async () => {
			const mockRepo1 = {
				inputBox: { value: "" },
				rootUri: { fsPath: "/project1" },
			} as unknown as Repository;
			const mockRepo2 = {
				inputBox: { value: "" },
				rootUri: { fsPath: "/project2" },
			} as unknown as Repository;

			const mockMultiGitApi = {
				repositories: [mockRepo1, mockRepo2],
			} as unknown as API;

			mockGetVSCodeGitAPI.mockReturnValue(mockMultiGitApi);
			mockGetRepositoryByRoot.mockReturnValue(mockRepo2);

			const sourceControlForRepo2 = {
				rootUri: { fsPath: "/project2" },
			} as vscode.SourceControl;

			const mockStreamCommitMessage = jest.fn().mockImplementation(async function* () {
				yield "Test";
			});
			mockFireworksProvider.prototype.streamCommitMessage = mockStreamCommitMessage;

			await generateCommitMessage(sourceControlForRepo2, mockContext);

			expect(mockGetDiffs).toHaveBeenCalledWith(mockRepo2);
			expect(mockGetCurrentBranch).toHaveBeenCalledWith(mockRepo2);
		});
	});
});
