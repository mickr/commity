import { FireworksProvider } from "../fireworks";
import type { CommitMessageRequest } from "../../../types/ai";

describe("FireworksProvider", () => {
	const mockFetch = jest.fn();
	global.fetch = mockFetch;

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("streamCommitMessage", () => {
		it("correctly unescapes newlines from SSE data", async () => {
			const sseResponse = "data: Add user authentication\ndata: \\n\ndata: - Add JWT token validation\ndata: \\n\ndata: - Implement session middleware\n";

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
										value: new TextEncoder().encode(sseResponse),
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
			expect(result).toBe("Add user authentication\n- Add JWT token validation\n- Implement session middleware");
		});

		it("handles multiline commit messages with proper newline conversion", async () => {
			const sseResponse = [
				"data: Update API endpoints\n",
				"data: \\n\n",
				"data: - Refactor authentication flow\n",
				"data: \\n\n",
				"data: - Add rate limiting\n",
				"data: \\n\n",
				"data: - Update error handling\n",
			].join("");

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
										value: new TextEncoder().encode(sseResponse),
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
				branch: "feature/api-update",
				author: "dev@example.com",
			};

			const chunks: string[] = [];
			for await (const chunk of provider.streamCommitMessage(request)) {
				chunks.push(chunk);
			}

			const result = chunks.join("");
			expect(result).toContain("\n");
			expect(result).toBe("Update API endpoints\n- Refactor authentication flow\n- Add rate limiting\n- Update error handling");
		});

		it("handles chunks split across multiple reads", async () => {
			const chunk1 = "data: Fix memory leak\n";
			const chunk2 = "data: \\n\ndata: - Release resources\n";
			const chunk3 = "data: \\n\ndata: - Add cleanup handler\n";

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
										value: new TextEncoder().encode(chunk1),
									};
								}
								if (position === 1) {
									position++;
									return {
										done: false,
										value: new TextEncoder().encode(chunk2),
									};
								}
								if (position === 2) {
									position++;
									return {
										done: false,
										value: new TextEncoder().encode(chunk3),
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

			const chunks: string[] = [];
			for await (const chunk of provider.streamCommitMessage(request)) {
				chunks.push(chunk);
			}

			const result = chunks.join("");
			expect(result).toBe("Fix memory leak\n- Release resources\n- Add cleanup handler");
		});

		it("handles partial SSE lines across buffer boundaries", async () => {
			const chunk1 = "data: Add fea";
			const chunk2 = "ture flag\ndata: \\n\n";
			const chunk3 = "data: - Enable new UI\n";

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
										value: new TextEncoder().encode(chunk1),
									};
								}
								if (position === 1) {
									position++;
									return {
										done: false,
										value: new TextEncoder().encode(chunk2),
									};
								}
								if (position === 2) {
									position++;
									return {
										done: false,
										value: new TextEncoder().encode(chunk3),
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
				diffs: [{ path: "feature.ts", diff: "+feature" }],
				branch: "main",
				author: "test@example.com",
			};

			const chunks: string[] = [];
			for await (const chunk of provider.streamCommitMessage(request)) {
				chunks.push(chunk);
			}

			const result = chunks.join("");
			expect(result).toBe("Add feature flag\n- Enable new UI");
		});

		it("handles empty data fields", async () => {
			const sseResponse = "data: \ndata: Test message\ndata: \n";

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
										value: new TextEncoder().encode(sseResponse),
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
			expect(result).toBe("Test message");
		});

		it("handles error event from server", async () => {
			const sseResponse = "data: Starting\n";
			const errorResponse = "event: error\ndata: Something went wrong\n";

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
										value: new TextEncoder().encode(sseResponse),
									};
								}
								if (position === 1) {
									position++;
									return {
										done: false,
										value: new TextEncoder().encode(errorResponse),
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
			try {
				for await (const _chunk of provider.streamCommitMessage(request)) {
					chunks.push(_chunk);
				}
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toBe("Something went wrong");
			}

			expect(chunks).toContain("Starting");
		});

		it("throws error on non-ok response", async () => {
			mockFetch.mockResolvedValue({
				ok: false,
				status: 429,
				statusText: "Too Many Requests",
				json: async () => ({ error: "Rate limit exceeded" }),
			});

			const provider = new FireworksProvider(true);
			const request: CommitMessageRequest = {
				diffs: [{ path: "test.ts", diff: "+test" }],
				branch: "main",
				author: "test@example.com",
			};

			await expect(async () => {
				for await (const _chunk of provider.streamCommitMessage(request)) {
					// Should throw before getting here
				}
			}).rejects.toThrow("Fireworks API error: 429 - Rate limit exceeded");
		});

		it("throws error when response body is null", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				body: null,
			});

			const provider = new FireworksProvider(true);
			const request: CommitMessageRequest = {
				diffs: [{ path: "test.ts", diff: "+test" }],
				branch: "main",
				author: "test@example.com",
			};

			await expect(async () => {
				for await (const _chunk of provider.streamCommitMessage(request)) {
					// Should throw before getting here
				}
			}).rejects.toThrow("Response body is null");
		});

		it("releases reader lock on success", async () => {
			const mockRelease = jest.fn();

			mockFetch.mockResolvedValue({
				ok: true,
				body: {
					getReader: () => ({
						read: async () => {
							return { done: true, value: undefined };
						},
						releaseLock: mockRelease,
					}),
				},
			});

			const provider = new FireworksProvider(true);
			const request: CommitMessageRequest = {
				diffs: [{ path: "test.ts", diff: "+test" }],
				branch: "main",
				author: "test@example.com",
			};

			const chunks: string[] = [];
			for await (const _chunk of provider.streamCommitMessage(request)) {
				chunks.push(_chunk);
			}

			expect(mockRelease).toHaveBeenCalled();
		});

		it("releases reader lock on error", async () => {
			const mockRelease = jest.fn();
			const sseResponse = "event: error\ndata: Test error\n";

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
										value: new TextEncoder().encode(sseResponse),
									};
								}
								return { done: true, value: undefined };
							},
							releaseLock: mockRelease,
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

			try {
				for await (const _chunk of provider.streamCommitMessage(request)) {
					// Should throw
				}
			} catch (_e) {
				// Expected
			}

			expect(mockRelease).toHaveBeenCalled();
		});

		it("handles abort signal", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				body: {
					getReader: () => ({
						read: async () => ({ done: true, value: undefined }),
						releaseLock: jest.fn(),
					}),
				},
			});

			const provider = new FireworksProvider(true);
			const request: CommitMessageRequest = {
				diffs: [{ path: "test.ts", diff: "+test" }],
				branch: "main",
				author: "test@example.com",
			};

			const abortController = new AbortController();

			const chunks: string[] = [];
			for await (const _chunk of provider.streamCommitMessage(
				request,
				abortController.signal
			)) {
				chunks.push(_chunk);
			}

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					signal: abortController.signal,
				})
			);
		});
	});

	describe("generateCommitMessage", () => {
		it("sends request to correct endpoint", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({ message: "Test commit message" }),
			});

			const provider = new FireworksProvider(true);
			const request: CommitMessageRequest = {
				diffs: [{ path: "test.ts", diff: "+test" }],
				branch: "main",
				author: "test@example.com",
			};

			await provider.generateCommitMessage(request);

			expect(mockFetch).toHaveBeenCalledWith(
				"http://engineroom.test/api/commit-message",
				expect.objectContaining({
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(request),
				})
			);
		});

		it("uses production URL in production mode", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				json: async () => ({ message: "Test" }),
			});

			const provider = new FireworksProvider(false);
			const request: CommitMessageRequest = {
				diffs: [{ path: "test.ts", diff: "+test" }],
				branch: "main",
				author: "test@example.com",
			};

			await provider.generateCommitMessage(request);

			expect(mockFetch).toHaveBeenCalledWith(
				"https://fireworks.commity.ai/api/commit-message",
				expect.any(Object)
			);
		});
	});
});
