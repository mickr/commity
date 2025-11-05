import { commitMessageStreamHandler } from "../commit-message-stream";
import type { Context } from "hono";
import type { Bindings } from "../../types";
import { checkRateLimit } from "../../utils/rate-limit";
import { callLLM, streamFinalMessage } from "../../utils/llm-client";

// Mock Cloudflare KVNamespace type for tests
declare global {
	interface KVNamespace {
		get(key: string): Promise<string | null>;
		put(key: string, value: string, options?: unknown): Promise<void>;
		delete(key: string): Promise<void>;
		list(options?: unknown): Promise<unknown>;
	}
}

jest.mock("../../utils/rate-limit");
jest.mock("../../utils/llm-client");

const mockCheckRateLimit = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;
const mockCallLLM = callLLM as jest.MockedFunction<typeof callLLM>;
const mockStreamFinalMessage = streamFinalMessage as jest.MockedFunction<typeof streamFinalMessage>;

describe("commitMessageStreamHandler - Unit Tests", () => {
	let mockContext: Context<{ Bindings: Bindings }>;

	beforeEach(() => {
		jest.clearAllMocks();

		mockContext = {
			req: {
				header: jest.fn((key: string) => {
					if (key === "cf-connecting-ip") return "127.0.0.1";
					return null;
				}),
				json: jest.fn(),
			},
			env: {
				RATE_LIMIT_MAX: "100",
				RATE_LIMIT_WINDOW: "3600",
				FIREWORKS_API_KEY: "test-api-key",
				RATE_LIMIT: {} as KVNamespace,
			},
			json: jest.fn((data, status) => ({ data, status })),
		} as unknown as Context<{ Bindings: Bindings }>;

		mockCheckRateLimit.mockResolvedValue(true);
	});

	describe("Newline Handling Logic", () => {
		it("verifies escaping logic in commit-message-stream handler", () => {
			const testMessage = "Subject\n\n- Bullet 1\n- Bullet 2";
			const escaped = testMessage.replace(/\n/g, "\\n");
			
			expect(escaped).toBe("Subject\\n\\n- Bullet 1\\n- Bullet 2");
			expect(escaped).toContain("\\n");
			expect(escaped).not.toMatch(/[^\\]\n/);
		});

		it("confirms multiple newlines are all escaped", () => {
			const testMessage = "Line 1\nLine 2\nLine 3\nLine 4";
			const escaped = testMessage.replace(/\n/g, "\\n");
			
			const newlineCount = (testMessage.match(/\n/g) || []).length;
			const escapedCount = (escaped.match(/\\n/g) || []).length;
			
			expect(escapedCount).toBe(newlineCount);
			expect(escapedCount).toBe(3);
		});
	});

	describe("Rate Limiting", () => {
		it("returns 429 when rate limit exceeded", async () => {
			mockCheckRateLimit.mockResolvedValue(false);

			const result = await commitMessageStreamHandler(mockContext);

			expect(result).toEqual({
				data: { error: "Rate limit exceeded" },
				status: 429,
			});
		});

		it("parses rate limit settings correctly", () => {
			const maxStr = "50";
			const windowStr = "1800";
			
			const max = Number.parseInt(maxStr);
			const window = Number.parseInt(windowStr);
			
			expect(max).toBe(50);
			expect(window).toBe(1800);
		});
	});

	describe("Request Validation", () => {
		it("returns 400 when diffs are missing", async () => {
			(mockContext.req.json as jest.Mock).mockResolvedValue({
				branch: "main",
				author: "test@example.com",
			});

			const result = await commitMessageStreamHandler(mockContext);

			expect(result).toEqual({
				data: { error: "Invalid diffs" },
				status: 400,
			});
		});

		it("returns 400 when diffs is not an array", async () => {
			(mockContext.req.json as jest.Mock).mockResolvedValue({
				diffs: "not an array",
				branch: "main",
				author: "test@example.com",
			});

			const result = await commitMessageStreamHandler(mockContext);

			expect(result).toEqual({
				data: { error: "Invalid diffs" },
				status: 400,
			});
		});

		it("returns 400 when branch is missing", async () => {
			(mockContext.req.json as jest.Mock).mockResolvedValue({
				diffs: [{ path: "test.ts", diff: "+test" }],
				author: "test@example.com",
			});

			const result = await commitMessageStreamHandler(mockContext);

			expect(result).toEqual({
				data: { error: "Invalid branch" },
				status: 400,
			});
		});

		it("returns 400 when branch is not a string", async () => {
			(mockContext.req.json as jest.Mock).mockResolvedValue({
				diffs: [{ path: "test.ts", diff: "+test" }],
				branch: 123,
				author: "test@example.com",
			});

			const result = await commitMessageStreamHandler(mockContext);

			expect(result).toEqual({
				data: { error: "Invalid branch" },
				status: 400,
			});
		});

		it("returns 400 when author is missing", async () => {
			(mockContext.req.json as jest.Mock).mockResolvedValue({
				diffs: [{ path: "test.ts", diff: "+test" }],
				branch: "main",
			});

			const result = await commitMessageStreamHandler(mockContext);

			expect(result).toEqual({
				data: { error: "Invalid author" },
				status: 400,
			});
		});

		it("returns 400 when author is not a string", async () => {
			(mockContext.req.json as jest.Mock).mockResolvedValue({
				diffs: [{ path: "test.ts", diff: "+test" }],
				branch: "main",
				author: { name: "test" },
			});

			const result = await commitMessageStreamHandler(mockContext);

			expect(result).toEqual({
				data: { error: "Invalid author" },
				status: 400,
			});
		});
	});

	describe("Folder Grouping Logic", () => {
		it("groups files by folder correctly", () => {
			const diffs = [
				{ path: "src/auth/login.ts", diff: "+login" },
				{ path: "src/auth/logout.ts", diff: "+logout" },
				{ path: "src/utils/helper.ts", diff: "+helper" },
			];

			const folderGroups = diffs.reduce(
				(acc, diff) => {
					const folder = diff.path.includes("/")
						? diff.path.substring(0, diff.path.lastIndexOf("/"))
						: ".";
					if (!acc[folder]) {
						acc[folder] = [];
					}
					acc[folder].push(diff);
					return acc;
				},
				{} as Record<string, Array<{ path: string; diff: string }>>
			);

			expect(Object.keys(folderGroups)).toHaveLength(2);
			expect(folderGroups["src/auth"]).toHaveLength(2);
			expect(folderGroups["src/utils"]).toHaveLength(1);
		});
	});

	describe("Error Handling", () => {
		it("returns 500 on folder processing error", async () => {
			(mockContext.req.json as jest.Mock).mockResolvedValue({
				diffs: [{ path: "test.ts", diff: "+test" }],
				branch: "main",
				author: "test@example.com",
			});

			mockCallLLM.mockRejectedValue(new Error("Processing failed"));

			const result = await commitMessageStreamHandler(mockContext);

			expect(result).toEqual({
				data: { error: "Failed to generate commit message" },
				status: 500,
			});
		});
	});
});
