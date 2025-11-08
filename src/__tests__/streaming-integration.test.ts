import { FireworksProvider } from "../services/ai-providers/fireworks";
import type { CommitMessageRequest } from "../types/ai";

describe("Streaming Integration Tests", () => {
	const mockFetch = jest.fn();
	global.fetch = mockFetch;

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("End-to-End Newline Handling", () => {
		it("preserves newlines through the entire SSE pipeline", async () => {
			const serverGeneratedMessage = [
				"Add user authentication system",
				"",
				"- Implement JWT token validation",
				"- Add session middleware",
				"- Update error handling",
			].join("\n");

			const sseChunks = [];
			for (const line of serverGeneratedMessage.split("\n")) {
				sseChunks.push(`data: ${line}\n`);
				sseChunks.push("data: \\n\n");
			}
			const sseStream = sseChunks.slice(0, -1).join("");

			mockFetch.mockResolvedValue({
				ok: true,
				body: {
					getReader: () => {
						let position = 0;
						return {
							read: async () => {
								if (position === 0) {
									position++;
									return {
										done: false,
										value: new TextEncoder().encode(sseStream),
									};
								}
								return { done: true, value: undefined };
							},
							releaseLock: jest.fn(),
						};
					},
				},
			});

			const provider = new FireworksProvider(true);
			const request: CommitMessageRequest = {
				diffs: [
					{ path: "src/auth/jwt.ts", diff: "+jwt validation" },
					{ path: "src/auth/session.ts", diff: "+session handling" },
				],
				branch: "feature/auth",
				author: "dev@example.com",
			};

			const chunks: string[] = [];
			for await (const chunk of provider.streamCommitMessage(request)) {
				chunks.push(chunk);
			}

			const finalMessage = chunks.join("");

			expect(finalMessage).toContain("\n");
			expect(finalMessage.split("\n")).toHaveLength(5);
			expect(finalMessage).toBe(serverGeneratedMessage);
		});

		it("simulates VSCode input box receiving multiline message", async () => {
			const multilineCommit = "Update API endpoints\n\n- Refactor authentication flow\n- Add rate limiting\n- Update error handling";

			const sseChunks = [
				"data: Update API endpoints\n",
				"data: \\n\n",
				"data: \\n\n",
				"data: - Refactor authentication flow\n",
				"data: \\n\n",
				"data: - Add rate limiting\n",
				"data: \\n\n",
				"data: - Update error handling\n",
			];

			mockFetch.mockResolvedValue({
				ok: true,
				body: {
					getReader: () => {
						let chunkIndex = 0;
						return {
							read: async () => {
								if (chunkIndex < sseChunks.length) {
									const chunk = sseChunks[chunkIndex];
									chunkIndex++;
									return {
										done: false,
										value: new TextEncoder().encode(chunk),
									};
								}
								return { done: true, value: undefined };
							},
							releaseLock: jest.fn(),
						};
					},
				},
			});

			const provider = new FireworksProvider(true);
			const request: CommitMessageRequest = {
				diffs: [{ path: "api.ts", diff: "+api changes" }],
				branch: "main",
				author: "test@example.com",
			};

			const inputBoxValue = { value: "" };

			for await (const chunk of provider.streamCommitMessage(request)) {
				inputBoxValue.value += chunk;
			}

			expect(inputBoxValue.value).toBe(multilineCommit);
			expect(inputBoxValue.value.split("\n")).toHaveLength(5);
			expect(inputBoxValue.value).toContain("- Refactor authentication flow");
			expect(inputBoxValue.value).toContain("- Add rate limiting");
			expect(inputBoxValue.value).toContain("- Update error handling");
		});

		it("handles incremental streaming with newlines appearing mid-stream", async () => {
			const sseChunks = [
				"data: Fix mem\n",
				"data: ory leak\n",
				"data: \\n\n",
				"data: \\n\n",
				"data: - Release res\n",
				"data: ources\n",
				"data: \\n\n",
				"data: - Add cleanup\n",
			];

			mockFetch.mockResolvedValue({
				ok: true,
				body: {
					getReader: () => {
						let chunkIndex = 0;
						return {
							read: async () => {
								if (chunkIndex < sseChunks.length) {
									const chunk = sseChunks[chunkIndex];
									chunkIndex++;
									return {
										done: false,
										value: new TextEncoder().encode(chunk),
									};
								}
								return { done: true, value: undefined };
							},
							releaseLock: jest.fn(),
						};
					},
				},
			});

			const provider = new FireworksProvider(true);
			const request: CommitMessageRequest = {
				diffs: [{ path: "memory.ts", diff: "+fix" }],
				branch: "main",
				author: "test@example.com",
			};

			const inputBoxValue = { value: "" };
			const intermediateStates: string[] = [];

			for await (const chunk of provider.streamCommitMessage(request)) {
				inputBoxValue.value += chunk;
				intermediateStates.push(inputBoxValue.value);
			}

			expect(inputBoxValue.value).toBe(
				"Fix memory leak\n\n- Release resources\n- Add cleanup"
			);

			const finalNewlineCount = (inputBoxValue.value.match(/\n/g) || []).length;
			expect(finalNewlineCount).toBe(3);
		});

		it("matches prompt format expectations for multiline output", async () => {
			const promptExpectedFormat = [
				"Subject line here",
				"",
				"- First bullet point here",
				"- Second bullet point here",
				"- Third bullet point here",
			].join("\n");

			const sseRepresentation = [
				"data: Subject line here\n",
				"data: \\n\n",
				"data: \\n\n",
				"data: - First bullet point here\n",
				"data: \\n\n",
				"data: - Second bullet point here\n",
				"data: \\n\n",
				"data: - Third bullet point here\n",
			];

			mockFetch.mockResolvedValue({
				ok: true,
				body: {
					getReader: () => {
						let chunkIndex = 0;
						return {
							read: async () => {
								if (chunkIndex < sseRepresentation.length) {
									const chunk = sseRepresentation[chunkIndex];
									chunkIndex++;
									return {
										done: false,
										value: new TextEncoder().encode(chunk),
									};
								}
								return { done: true, value: undefined };
							},
							releaseLock: jest.fn(),
						};
					},
				},
			});

			const provider = new FireworksProvider(true);
			const request: CommitMessageRequest = {
				diffs: [{ path: "test.ts", diff: "+test" }],
				branch: "main",
				author: "test@example.com",
			};

			const chunks: string[] = [];
			for await (const chunk of provider.streamCommitMessage(request)) {
				chunks.push(chunk);
			}

			const result = chunks.join("");

			expect(result).toBe(promptExpectedFormat);

			const lines = result.split("\n");
			expect(lines[0]).toBe("Subject line here");
			expect(lines[1]).toBe("");
			expect(lines[2]).toBe("- First bullet point here");
			expect(lines[3]).toBe("- Second bullet point here");
			expect(lines[4]).toBe("- Third bullet point here");
		});

		it("handles complex multiline messages with mixed content", async () => {
			const complexMessage = [
				"Refactor authentication system",
				"",
				"- Migrate from session-based to JWT tokens",
				"- Add refresh token rotation",
				"- Implement role-based access control",
				"",
				"This change improves security and scalability",
			].join("\n");

			const sseChunks = [];
			for (const line of complexMessage.split("\n")) {
				sseChunks.push(`data: ${line}\n`);
				sseChunks.push("data: \\n\n");
			}
			const sseStream = sseChunks.slice(0, -1).join("");

			mockFetch.mockResolvedValue({
				ok: true,
				body: {
					getReader: () => {
						let position = 0;
						return {
							read: async () => {
								if (position === 0) {
									position++;
									return {
										done: false,
										value: new TextEncoder().encode(sseStream),
									};
								}
								return { done: true, value: undefined };
							},
							releaseLock: jest.fn(),
						};
					},
				},
			});

			const provider = new FireworksProvider(true);
			const request: CommitMessageRequest = {
				diffs: [
					{ path: "src/auth/jwt.ts", diff: "+jwt" },
					{ path: "src/auth/rbac.ts", diff: "+rbac" },
				],
				branch: "refactor/auth",
				author: "dev@example.com",
			};

			const chunks: string[] = [];
			for await (const chunk of provider.streamCommitMessage(request)) {
				chunks.push(chunk);
			}

			const result = chunks.join("");

			expect(result).toBe(complexMessage);
			expect(result.split("\n")).toHaveLength(7);
			expect(result).toContain("Refactor authentication system");
			expect(result).toContain("- Migrate from session-based to JWT tokens");
			expect(result).toContain("This change improves security and scalability");
		});

		it("handles only newlines in stream", async () => {
			const sseStream = "data: \\n\ndata: \\n\ndata: \\n\n";

			mockFetch.mockResolvedValue({
				ok: true,
				body: {
					getReader: () => {
						let position = 0;
						return {
							read: async () => {
								if (position === 0) {
									position++;
									return {
										done: false,
										value: new TextEncoder().encode(sseStream),
									};
								}
								return { done: true, value: undefined };
							},
							releaseLock: jest.fn(),
						};
					},
				},
			});

			const provider = new FireworksProvider(true);
			const request: CommitMessageRequest = {
				diffs: [{ path: "test.ts", diff: "+test" }],
				branch: "main",
				author: "test@example.com",
			};

			const chunks: string[] = [];
			for await (const chunk of provider.streamCommitMessage(request)) {
				chunks.push(chunk);
			}

			const result = chunks.join("");
			expect(result).toBe("\n\n\n");
		});

		it("ensures no data corruption during newline conversion", async () => {
			const expectedMessage = "First line\nSecond line\nThird line";

			const sseChunks = [];
			for (const line of expectedMessage.split("\n")) {
				sseChunks.push(`data: ${line}\n`);
				sseChunks.push("data: \\n\n");
			}
			const sseStream = sseChunks.slice(0, -1).join("");

			mockFetch.mockResolvedValue({
				ok: true,
				body: {
					getReader: () => {
						let position = 0;
						return {
							read: async () => {
								if (position === 0) {
									position++;
									return {
										done: false,
										value: new TextEncoder().encode(sseStream),
									};
								}
								return { done: true, value: undefined };
							},
							releaseLock: jest.fn(),
						};
					},
				},
			});

			const provider = new FireworksProvider(true);
			const request: CommitMessageRequest = {
				diffs: [{ path: "test.ts", diff: "+test" }],
				branch: "main",
				author: "test@example.com",
			};

			const chunks: string[] = [];
			for await (const chunk of provider.streamCommitMessage(request)) {
				chunks.push(chunk);
			}

			const result = chunks.join("");
			expect(result).toBe(expectedMessage);
			expect(result.split("\n")).toHaveLength(3);
		});
	});

	describe("Performance and Edge Cases", () => {
		it("handles very large multiline messages", async () => {
			const largeBulletList = Array.from(
				{ length: 50 },
				(_, i) => `- Bullet point ${i + 1}`
			).join("\n");
			const largeMessage = `Large commit\n\n${largeBulletList}`;

			const sseChunks = [];
			for (const line of largeMessage.split("\n")) {
				sseChunks.push(`data: ${line}\n`);
				sseChunks.push("data: \\n\n");
			}
			const sseStream = sseChunks.slice(0, -1).join("");

			mockFetch.mockResolvedValue({
				ok: true,
				body: {
					getReader: () => {
						let position = 0;
						return {
							read: async () => {
								if (position === 0) {
									position++;
									return {
										done: false,
										value: new TextEncoder().encode(sseStream),
									};
								}
								return { done: true, value: undefined };
							},
							releaseLock: jest.fn(),
						};
					},
				},
			});

			const provider = new FireworksProvider(true);
			const request: CommitMessageRequest = {
				diffs: Array.from({ length: 20 }, (_, i) => ({
					path: `file${i}.ts`,
					diff: `+change${i}`,
				})),
				branch: "main",
				author: "test@example.com",
			};

			const chunks: string[] = [];
			for await (const chunk of provider.streamCommitMessage(request)) {
				chunks.push(chunk);
			}

			const result = chunks.join("");
			const lines = result.split("\n");

			expect(lines.length).toBeGreaterThan(50);
			expect(result).toContain("Large commit");
			expect(result).toContain("- Bullet point 1");
			expect(result).toContain("- Bullet point 50");
		});

		it("handles rapid successive newlines", async () => {
			const messageWithManyNewlines = "Subject\n\n\n\n- Bullet";

			const sseChunks = [];
			for (const line of messageWithManyNewlines.split("\n")) {
				sseChunks.push(`data: ${line}\n`);
				sseChunks.push("data: \\n\n");
			}
			const sseStream = sseChunks.slice(0, -1).join("");

			mockFetch.mockResolvedValue({
				ok: true,
				body: {
					getReader: () => {
						let position = 0;
						return {
							read: async () => {
								if (position === 0) {
									position++;
									return {
										done: false,
										value: new TextEncoder().encode(sseStream),
									};
								}
								return { done: true, value: undefined };
							},
							releaseLock: jest.fn(),
						};
					},
				},
			});

			const provider = new FireworksProvider(true);
			const request: CommitMessageRequest = {
				diffs: [{ path: "test.ts", diff: "+test" }],
				branch: "main",
				author: "test@example.com",
			};

			const chunks: string[] = [];
			for await (const chunk of provider.streamCommitMessage(request)) {
				chunks.push(chunk);
			}

			const result = chunks.join("");
			expect(result).toBe(messageWithManyNewlines);
			expect((result.match(/\n/g) || []).length).toBe(4);
		});
	});
});
