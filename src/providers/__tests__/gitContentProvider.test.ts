import * as vscode from "vscode";

const mockExecFileAsync = jest.fn();

jest.mock("node:child_process", () => ({
	execFile: jest.fn(),
}));

jest.mock("node:util", () => {
	const actualMock = jest.requireActual("node:util");
	return {
		...actualMock,
		promisify: jest.fn(() => mockExecFileAsync),
	};
});

jest.mock(
	"vscode",
	() => ({
		Uri: {
			parse: jest.fn((str: string) => {
				const url = new URL(str);
				return {
					scheme: url.protocol.replace(":", ""),
					authority: url.hostname || url.host,
					path: url.pathname,
				};
			}),
		},
		extensions: {
			getExtension: jest.fn(),
		},
	}),
	{ virtual: true }
);

jest.mock("../../services/git");

// Import after mocks are set up
import { GitContentProvider } from "../gitContentProvider";
import { getVSCodeGitAPI } from "../../services/git";
import type { API } from "../../types/git";

const mockGetVSCodeGitAPI = getVSCodeGitAPI as jest.MockedFunction<typeof getVSCodeGitAPI>;

describe("GitContentProvider", () => {
	let provider: GitContentProvider;
	let mockContext: vscode.ExtensionContext;
	let mockGitApi: API;

	beforeEach(() => {
		jest.clearAllMocks();

		mockContext = {} as vscode.ExtensionContext;
		provider = new GitContentProvider(mockContext);

		mockGitApi = {
			repositories: [{ rootUri: { fsPath: "/repo" } }],
		} as unknown as API;

		mockGetVSCodeGitAPI.mockReturnValue(mockGitApi);
	});

	const createUri = (commitRef: string, filePath: string): vscode.Uri => {
		return {
			scheme: GitContentProvider.scheme,
			authority: commitRef,
			path: `/${filePath}`,
		} as vscode.Uri;
	};

	describe("provideTextDocumentContent", () => {
		it("returns file content for a commit hash", async () => {
			const fileContent = "export const foo = 'bar';";
			mockExecFileAsync.mockResolvedValue({ stdout: fileContent });

			const uri = createUri("abc1234", "src/file.ts");
			const result = await provider.provideTextDocumentContent(uri);

			expect(result).toBe(fileContent);
			expect(mockExecFileAsync).toHaveBeenCalledWith(
				"git",
				["show", "abc1234:src/file.ts"],
				expect.objectContaining({
					cwd: "/repo",
					maxBuffer: 10 * 1024 * 1024,
				})
			);
		});

		it("handles parent commit syntax (hash^)", async () => {
			const parentContent = "export const foo = 'old';";
			mockExecFileAsync.mockResolvedValue({ stdout: parentContent });

			const uri = createUri("abc1234^", "src/file.ts");
			const result = await provider.provideTextDocumentContent(uri);

			expect(result).toBe(parentContent);
			expect(mockExecFileAsync).toHaveBeenCalledWith(
				"git",
				["show", "abc1234^:src/file.ts"],
				expect.objectContaining({ cwd: "/repo" })
			);
		});

		it("handles ancestor syntax (hash~2)", async () => {
			const ancestorContent = "export const foo = 'ancient';";
			mockExecFileAsync.mockResolvedValue({ stdout: ancestorContent });

			const uri = createUri("abc1234~2", "src/file.ts");
			const result = await provider.provideTextDocumentContent(uri);

			expect(result).toBe(ancestorContent);
			expect(mockExecFileAsync).toHaveBeenCalledWith(
				"git",
				["show", "abc1234~2:src/file.ts"],
				expect.objectContaining({ cwd: "/repo" })
			);
		});

		it("handles branch names as commit refs", async () => {
			const content = "main branch content";
			mockExecFileAsync.mockResolvedValue({ stdout: content });

			const uri = createUri("main", "README.md");
			const result = await provider.provideTextDocumentContent(uri);

			expect(result).toBe(content);
			expect(mockExecFileAsync).toHaveBeenCalledWith(
				"git",
				["show", "main:README.md"],
				expect.objectContaining({ cwd: "/repo" })
			);
		});

		it("strips leading slash from file path", async () => {
			mockExecFileAsync.mockResolvedValue({ stdout: "content" });

			const uri = {
				scheme: GitContentProvider.scheme,
				authority: "abc1234",
				path: "/src/nested/file.ts",
			} as vscode.Uri;

			await provider.provideTextDocumentContent(uri);

			expect(mockExecFileAsync).toHaveBeenCalledWith(
				"git",
				["show", "abc1234:src/nested/file.ts"],
				expect.anything()
			);
		});

		it("returns empty string when no git extension", async () => {
			mockGetVSCodeGitAPI.mockReturnValue(undefined);

			const uri = createUri("abc1234", "src/file.ts");
			const result = await provider.provideTextDocumentContent(uri);

			expect(result).toBe("");
			expect(mockExecFileAsync).not.toHaveBeenCalled();
		});

		it("returns empty string when no repositories", async () => {
			mockGetVSCodeGitAPI.mockReturnValue(undefined);

			const uri = createUri("abc1234", "src/file.ts");
			const result = await provider.provideTextDocumentContent(uri);

			expect(result).toBe("");
			expect(mockExecFileAsync).not.toHaveBeenCalled();
		});

		it("returns empty string when file does not exist in commit (new file)", async () => {
			mockExecFileAsync.mockRejectedValue(
				new Error("fatal: path 'src/new-file.ts' does not exist in 'abc1234^'")
			);

			const uri = createUri("abc1234^", "src/new-file.ts");
			const result = await provider.provideTextDocumentContent(uri);

			expect(result).toBe("");
		});

		it("returns empty string when file was deleted (checking current commit)", async () => {
			mockExecFileAsync.mockRejectedValue(
				new Error("fatal: path 'src/deleted.ts' does not exist in 'abc1234'")
			);

			const uri = createUri("abc1234", "src/deleted.ts");
			const result = await provider.provideTextDocumentContent(uri);

			expect(result).toBe("");
		});

		it("handles binary files gracefully", async () => {
			mockExecFileAsync.mockResolvedValue({ stdout: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString() });

			const uri = createUri("abc1234", "image.png");
			const result = await provider.provideTextDocumentContent(uri);

			expect(typeof result).toBe("string");
		});

		it("handles large files within buffer limit", async () => {
			const largeContent = "x".repeat(5 * 1024 * 1024); // 5MB
			mockExecFileAsync.mockResolvedValue({ stdout: largeContent });

			const uri = createUri("abc1234", "large-file.json");
			const result = await provider.provideTextDocumentContent(uri);

			expect(result).toBe(largeContent);
			expect(mockExecFileAsync).toHaveBeenCalledWith(
				"git",
				expect.anything(),
				expect.objectContaining({ maxBuffer: 10 * 1024 * 1024 })
			);
		});
	});

	describe("diff scenario: comparing commit with parent", () => {
		it("fetches both sides of a diff correctly", async () => {
			const parentContent = "const value = 1;";
			const currentContent = "const value = 2;";

			mockExecFileAsync
				.mockResolvedValueOnce({ stdout: parentContent })
				.mockResolvedValueOnce({ stdout: currentContent });

			const parentUri = createUri("abc1234^", "src/config.ts");
			const currentUri = createUri("abc1234", "src/config.ts");

			const parentResult = await provider.provideTextDocumentContent(parentUri);
			const currentResult = await provider.provideTextDocumentContent(currentUri);

			expect(parentResult).toBe(parentContent);
			expect(currentResult).toBe(currentContent);

			expect(mockExecFileAsync).toHaveBeenNthCalledWith(
				1,
				"git",
				["show", "abc1234^:src/config.ts"],
				expect.anything()
			);
			expect(mockExecFileAsync).toHaveBeenNthCalledWith(
				2,
				"git",
				["show", "abc1234:src/config.ts"],
				expect.anything()
			);
		});

		it("handles new file in commit (parent side empty)", async () => {
			mockExecFileAsync
				.mockRejectedValueOnce(new Error("path does not exist"))
				.mockResolvedValueOnce({ stdout: "new file content" });

			const parentUri = createUri("abc1234^", "src/new.ts");
			const currentUri = createUri("abc1234", "src/new.ts");

			const parentResult = await provider.provideTextDocumentContent(parentUri);
			const currentResult = await provider.provideTextDocumentContent(currentUri);

			expect(parentResult).toBe("");
			expect(currentResult).toBe("new file content");
		});

		it("handles deleted file in commit (current side empty)", async () => {
			mockExecFileAsync
				.mockResolvedValueOnce({ stdout: "deleted file content" })
				.mockRejectedValueOnce(new Error("path does not exist"));

			const parentUri = createUri("abc1234^", "src/deleted.ts");
			const currentUri = createUri("abc1234", "src/deleted.ts");

			const parentResult = await provider.provideTextDocumentContent(parentUri);
			const currentResult = await provider.provideTextDocumentContent(currentUri);

			expect(parentResult).toBe("deleted file content");
			expect(currentResult).toBe("");
		});
	});
});

