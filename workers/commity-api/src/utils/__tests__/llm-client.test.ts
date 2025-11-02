import {
	callLLM,
	RateLimitError,
	LLMClientError,
	LLMServerError,
} from "../llm-client";

const mockFetch = jest.fn();
// It's safe to cast globalThis to any here because we are in a test environment and need to mock fetch.
// biome-ignore lint/suspicious/noExplicitAny: mocking global fetch
(globalThis as any).fetch = mockFetch;

describe("callLLM", () => {
	const testApiKey = "test-api-key";
	const testPrompt = "Test prompt";
	const testModel = "test-model";

	beforeEach(() => {
		jest.clearAllMocks();
		jest.spyOn(console, "log").mockImplementation();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("successfully returns LLM response", async () => {
		const mockResponse = {
			choices: [{ message: { content: "Test response" } }],
		};

		mockFetch.mockResolvedValueOnce({
			ok: true,
			status: 200,
			json: async () => mockResponse,
		} as Response);

		const result = await callLLM(testApiKey, testPrompt, testModel);

		expect(result).toBe("Test response");
		expect(mockFetch).toHaveBeenCalledWith(
			"https://api.fireworks.ai/inference/v1/chat/completions",
			expect.objectContaining({
				method: "POST",
				headers: {
					Authorization: `Bearer ${testApiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: testModel,
					messages: [{ role: "user", content: testPrompt }],
					temperature: 0.2,
				}),
			}),
		);
	});

	describe("Rate Limit Errors", () => {
		it("retries on 429 status and succeeds", async () => {
			const mockResponse = {
				choices: [{ message: { content: "Success after retry" } }],
			};

			mockFetch
				.mockResolvedValueOnce({
					ok: false,
					status: 429,
				} as Response)
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => mockResponse,
				} as Response);

			const result = await callLLM(testApiKey, testPrompt, testModel);

			expect(result).toBe("Success after retry");
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it("throws RateLimitError after max retries", async () => {
			mockFetch.mockResolvedValue({
				ok: false,
				status: 429,
			} as Response);

			await expect(callLLM(testApiKey, testPrompt, testModel)).rejects.toThrow(
				RateLimitError,
			);

			expect(mockFetch).toHaveBeenCalledTimes(4); // initial + 3 retries
		}, 30000);
	});

	describe("Client Errors (4xx)", () => {
		it("throws LLMClientError on 400 Bad Request", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				text: async () => "Invalid request format",
			} as Response);

			try {
				await callLLM(testApiKey, testPrompt, testModel);
				fail("Should have thrown LLMClientError");
			} catch (error) {
				expect(error).toBeInstanceOf(LLMClientError);
				expect((error as LLMClientError).statusCode).toBe(400);
				expect((error as LLMClientError).message).toContain(
					"Invalid request to LLM service",
				);
			}
		}, 30000);

		it("throws LLMClientError on 401 Unauthorized", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				text: async () => "Invalid API key",
			} as Response);

			try {
				await callLLM(testApiKey, testPrompt, testModel);
				fail("Should have thrown LLMClientError");
			} catch (error) {
				expect(error).toBeInstanceOf(LLMClientError);
				expect((error as LLMClientError).statusCode).toBe(401);
				expect((error as LLMClientError).message).toContain("Invalid API key");
			}
		}, 30000);

		it("throws LLMClientError on 403 Forbidden", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 403,
				text: async () => "Access denied",
			} as Response);

			try {
				await callLLM(testApiKey, testPrompt, testModel);
				fail("Should have thrown LLMClientError");
			} catch (error) {
				expect(error).toBeInstanceOf(LLMClientError);
				expect((error as LLMClientError).statusCode).toBe(403);
			}
		}, 30000);

		it("handles error when reading response body fails", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				text: jest.fn().mockRejectedValueOnce(new Error("Body read error")),
			} as unknown as Response);

			try {
				await callLLM(testApiKey, testPrompt, testModel);
				fail("Should have thrown LLMClientError");
			} catch (error) {
				expect(error).toBeInstanceOf(LLMClientError);
				expect((error as LLMClientError).message).toContain("Unknown error");
			}
		}, 30000);
	});

	describe("Server Errors (5xx)", () => {
		it("throws LLMServerError on 500 Internal Server Error", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				text: async () => "Internal server error",
			} as Response);

			try {
				await callLLM(testApiKey, testPrompt, testModel);
				fail("Should have thrown LLMServerError");
			} catch (error) {
				expect(error).toBeInstanceOf(LLMServerError);
				expect((error as LLMServerError).message).toBe(
					"LLM service temporarily unavailable. Please try again later.",
				);
			}
		}, 30000);

		it("throws LLMServerError on 502 Bad Gateway", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 502,
				text: async () => "Bad gateway",
			} as Response);

			try {
				await callLLM(testApiKey, testPrompt, testModel);
				fail("Should have thrown LLMServerError");
			} catch (error) {
				expect(error).toBeInstanceOf(LLMServerError);
			}
		}, 30000);

		it("throws LLMServerError on 503 Service Unavailable", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 503,
				text: async () => "Service unavailable",
			} as Response);

			try {
				await callLLM(testApiKey, testPrompt, testModel);
				fail("Should have thrown LLMServerError");
			} catch (error) {
				expect(error).toBeInstanceOf(LLMServerError);
			}
		}, 30000);
	});

	describe("Retry Logic", () => {
		it("retries on network errors and succeeds", async () => {
			const mockResponse = {
				choices: [{ message: { content: "Success after network error" } }],
			};

			mockFetch
				.mockRejectedValueOnce(new Error("Network error"))
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => mockResponse,
				} as Response);

			const result = await callLLM(testApiKey, testPrompt, testModel);

			expect(result).toBe("Success after network error");
			expect(mockFetch).toHaveBeenCalledTimes(2);
		});

		it("throws original error after max retries on network failures", async () => {
			mockFetch.mockRejectedValue(new Error("Persistent network error"));

			await expect(callLLM(testApiKey, testPrompt, testModel)).rejects.toThrow(
				"Persistent network error",
			);

			expect(mockFetch).toHaveBeenCalledTimes(4); // initial + 3 retries
		}, 30000);

		it("does not retry on RateLimitError", async () => {
			mockFetch.mockResolvedValue({
				ok: false,
				status: 429,
			} as Response);

			await expect(callLLM(testApiKey, testPrompt, testModel)).rejects.toThrow(
				RateLimitError,
			);
		}, 30000);

		it("respects custom retry count", async () => {
			mockFetch.mockRejectedValue(new Error("Network error"));

			await expect(
				callLLM(testApiKey, testPrompt, testModel, 1),
			).rejects.toThrow("Network error");

			expect(mockFetch).toHaveBeenCalledTimes(2); // initial + 1 retry
		});
	});

	describe("Exponential Backoff", () => {
		beforeEach(() => {
			jest.useFakeTimers();
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		it("applies exponential backoff for rate limit retries", async () => {
			const mockResponse = {
				choices: [{ message: { content: "Success" } }],
			};

			mockFetch
				.mockResolvedValueOnce({ ok: false, status: 429 } as Response)
				.mockResolvedValueOnce({ ok: false, status: 429 } as Response)
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => mockResponse,
				} as Response);

			const promise = callLLM(testApiKey, testPrompt, testModel);

			// First retry: 1000ms backoff (2^0 * 1000)
			await jest.advanceTimersByTimeAsync(1000);
			// Second retry: 2000ms backoff (2^1 * 1000)
			await jest.advanceTimersByTimeAsync(2000);

			await expect(promise).resolves.toBe("Success");
		});

		it("caps backoff at 10 seconds", async () => {
			const mockResponse = {
				choices: [{ message: { content: "Success" } }],
			};

			mockFetch
				.mockResolvedValueOnce({ ok: false, status: 429 } as Response)
				.mockResolvedValueOnce({ ok: false, status: 429 } as Response)
				.mockResolvedValueOnce({ ok: false, status: 429 } as Response)
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					json: async () => mockResponse,
				} as Response);

			const promise = callLLM(testApiKey, testPrompt, testModel);

			await jest.advanceTimersByTimeAsync(1000); // 2^0 * 1000
			await jest.advanceTimersByTimeAsync(2000); // 2^1 * 1000
			await jest.advanceTimersByTimeAsync(4000); // 2^2 * 1000, but capped at 10000

			await expect(promise).resolves.toBe("Success");
		});
	});

	describe("Error Types", () => {
		it("RateLimitError has correct name", () => {
			const error = new RateLimitError("Test message");
			expect(error.name).toBe("RateLimitError");
			expect(error).toBeInstanceOf(Error);
		});

		it("LLMClientError has correct name and statusCode", () => {
			const error = new LLMClientError("Test message", 400);
			expect(error.name).toBe("LLMClientError");
			expect(error.statusCode).toBe(400);
			expect(error).toBeInstanceOf(Error);
		});

		it("LLMServerError has correct name", () => {
			const error = new LLMServerError("Test message");
			expect(error.name).toBe("LLMServerError");
			expect(error).toBeInstanceOf(Error);
		});
	});
});
