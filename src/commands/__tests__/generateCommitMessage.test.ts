jest.mock("vscode", () => ({
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
}), { virtual: true });

jest.mock("../../services/ai-providers/fireworks");
jest.mock("../../services/git");
jest.mock("../../services/config");

import * as vscode from "vscode";
import { generateCommitMessage } from "../generateCommitMessage";
import { FireworksProvider } from "../../services/ai-providers/fireworks";
import { getStagedDiff, getCurrentBranch, getCurrentAuthor } from "../../services/git";
import { readConfiguration } from "../../services/config";

const mockFireworksProvider = FireworksProvider as jest.MockedClass<typeof FireworksProvider>;
const mockGetStagedDiff = getStagedDiff as jest.MockedFunction<typeof getStagedDiff>;
const mockGetCurrentBranch = getCurrentBranch as jest.MockedFunction<typeof getCurrentBranch>;
const mockGetCurrentAuthor = getCurrentAuthor as jest.MockedFunction<typeof getCurrentAuthor>;
const mockReadConfiguration = readConfiguration as jest.MockedFunction<typeof readConfiguration>;

describe("generateCommitMessage", () => {
	const mockContext = {
		extensionMode: vscode.ExtensionMode.Development,
	} as vscode.ExtensionContext;

	const mockRepository = {
		inputBox: { value: "" },
	};

	const mockGitApi = {
		repositories: [mockRepository],
	};

	beforeEach(() => {
		jest.clearAllMocks();

		(vscode.extensions.getExtension as jest.Mock).mockReturnValue({
			exports: {
				getAPI: jest.fn().mockReturnValue(mockGitApi),
			},
		});

		mockGetStagedDiff.mockReturnValue({
			"src/test.ts": { diff: "+const x = 1;" },
		});
		mockGetCurrentBranch.mockReturnValue("main");
		mockGetCurrentAuthor.mockReturnValue("test@example.com");
		mockReadConfiguration.mockReturnValue({ success: false, data: undefined });

		(vscode.window.withProgress as jest.Mock).mockImplementation(
			async (options, task) => {
				const mockToken = {
					onCancellationRequested: jest.fn(),
				};
				return await task({}, mockToken);
			}
		);
	});

	it("generates commit message successfully", async () => {
		const mockGenerateCommitMessage = jest.fn().mockResolvedValue("Test commit message");
		mockFireworksProvider.prototype.generateCommitMessage = mockGenerateCommitMessage;

		await generateCommitMessage(mockContext);

		expect(mockRepository.inputBox.value).toBe("Test commit message");
		expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
			"Commity: Commit message generated!",
			5000
		);
	});

	it("shows warning when no repository is found", async () => {
		(vscode.extensions.getExtension as jest.Mock).mockReturnValue({
			exports: {
				getAPI: jest.fn().mockReturnValue({ repositories: [] }),
			},
		});

		await generateCommitMessage(mockContext);

		expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
			"No Git repository found"
		);
	});

	it("shows status message when no staged changes", async () => {
		mockGetStagedDiff.mockReturnValue({});

		await generateCommitMessage(mockContext);

		expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
			"Commity: No staged changes",
			5000
		);
	});

	describe("Error Handling", () => {
		it("handles cancellation gracefully", async () => {
			const mockGenerateCommitMessage = jest.fn().mockRejectedValue(
				Object.assign(new Error("User cancelled"), { name: "AbortError" })
			);
			mockFireworksProvider.prototype.generateCommitMessage = mockGenerateCommitMessage;

			await generateCommitMessage(mockContext);

			expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
				"Commity: Generation cancelled",
				5000
			);
			expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
		});

		it("handles rate limit error (429)", async () => {
			const mockGenerateCommitMessage = jest.fn().mockRejectedValue(
				new Error("Fireworks API error: 429 - Rate limit exceeded")
			);
			mockFireworksProvider.prototype.generateCommitMessage = mockGenerateCommitMessage;

			await generateCommitMessage(mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Rate limit exceeded. Please try again in a moment."
			);
		});

		it("handles rate limit error with lowercase text", async () => {
			const mockGenerateCommitMessage = jest.fn().mockRejectedValue(
				new Error("rate limit exceeded after retries")
			);
			mockFireworksProvider.prototype.generateCommitMessage = mockGenerateCommitMessage;

			await generateCommitMessage(mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Rate limit exceeded. Please try again in a moment."
			);
		});

		it("handles 500 server error", async () => {
			const mockGenerateCommitMessage = jest.fn().mockRejectedValue(
				new Error("Fireworks API error: 500 - Internal server error")
			);
			mockFireworksProvider.prototype.generateCommitMessage = mockGenerateCommitMessage;

			await generateCommitMessage(mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Service temporarily unavailable. Please try again later."
			);
		});

		it("handles 503 server error", async () => {
			const mockGenerateCommitMessage = jest.fn().mockRejectedValue(
				new Error("Fireworks API error: 503 - Service unavailable")
			);
			mockFireworksProvider.prototype.generateCommitMessage = mockGenerateCommitMessage;

			await generateCommitMessage(mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Service temporarily unavailable. Please try again later."
			);
		});

		it("handles 400 bad request error", async () => {
			const mockGenerateCommitMessage = jest.fn().mockRejectedValue(
				new Error("Fireworks API error: 400 - Bad request")
			);
			mockFireworksProvider.prototype.generateCommitMessage = mockGenerateCommitMessage;

			await generateCommitMessage(mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Invalid request. Please check your configuration."
			);
		});

		it("handles 401 unauthorized error", async () => {
			const mockGenerateCommitMessage = jest.fn().mockRejectedValue(
				new Error("Fireworks API error: 401 - Unauthorized")
			);
			mockFireworksProvider.prototype.generateCommitMessage = mockGenerateCommitMessage;

			await generateCommitMessage(mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Invalid request. Please check your configuration."
			);
		});

		it("handles 403 forbidden error", async () => {
			const mockGenerateCommitMessage = jest.fn().mockRejectedValue(
				new Error("Fireworks API error: 403 - Forbidden")
			);
			mockFireworksProvider.prototype.generateCommitMessage = mockGenerateCommitMessage;

			await generateCommitMessage(mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Invalid request. Please check your configuration."
			);
		});

		it("handles generic errors", async () => {
			const mockGenerateCommitMessage = jest.fn().mockRejectedValue(
				new Error("Unexpected error occurred")
			);
			mockFireworksProvider.prototype.generateCommitMessage = mockGenerateCommitMessage;

			await generateCommitMessage(mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Failed to generate commit message. Unexpected error occurred"
			);
		});

		it("handles non-Error objects", async () => {
			const mockGenerateCommitMessage = jest.fn().mockRejectedValue("String error");
			mockFireworksProvider.prototype.generateCommitMessage = mockGenerateCommitMessage;

			await generateCommitMessage(mockContext);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Commity: Failed to generate commit message. Unknown error"
			);
		});
	});

	describe("Configuration Override", () => {
		it("includes configuration override in request", async () => {
			const mockGenerateCommitMessage = jest.fn().mockResolvedValue("Test message");
			mockFireworksProvider.prototype.generateCommitMessage = mockGenerateCommitMessage;

			mockReadConfiguration.mockReturnValue({
				success: true,
				data: "Custom prompt template",
			});

			await generateCommitMessage(mockContext);

			expect(mockGenerateCommitMessage).toHaveBeenCalledWith(
				expect.objectContaining({
					override: "Custom prompt template",
				}),
				expect.any(Object)
			);
		});

		it("passes undefined override when config read fails", async () => {
			const mockGenerateCommitMessage = jest.fn().mockResolvedValue("Test message");
			mockFireworksProvider.prototype.generateCommitMessage = mockGenerateCommitMessage;

			mockReadConfiguration.mockReturnValue({ success: false, data: undefined });

			await generateCommitMessage(mockContext);

			expect(mockGenerateCommitMessage).toHaveBeenCalledWith(
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
			(vscode.window.withProgress as jest.Mock).mockImplementation(
				async (options, task) => {
					const mockToken = {
						onCancellationRequested: mockOnCancellationRequested,
					};
					return await task({}, mockToken);
				}
			);

			await generateCommitMessage(mockContext);

			expect(mockOnCancellationRequested).toHaveBeenCalled();
		});

		it("displays progress notification", async () => {
			const mockGenerateCommitMessage = jest.fn().mockResolvedValue("Test message");
			mockFireworksProvider.prototype.generateCommitMessage = mockGenerateCommitMessage;

			await generateCommitMessage(mockContext);

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
});
