import OpenAI from "openai";
import {
	callLLM,
	RateLimitError,
	LLMClientError,
	LLMServerError,
} from "../llm-client";

jest.mock("openai");

describe("callLLM", () => {
	const testApiKey = "test-api-key";
	const testPrompt = "Test prompt";
	const testModel = "test-model";
	
	let mockCreate: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		mockCreate = jest.fn();
		(OpenAI as jest.MockedClass<typeof OpenAI>).mockImplementation(
			() =>
				({
					chat: {
						completions: {
							create: mockCreate,
						},
					},
				}) as unknown as OpenAI,
		);
	});

	it("successfully returns LLM response", async () => {
		const mockResponse = {
			choices: [{ message: { content: "Test response" } }],
		};

		mockCreate.mockResolvedValueOnce(mockResponse);

		const result = await callLLM(testApiKey, testPrompt, testModel);

		expect(result).toBe("Test response");
		expect(OpenAI).toHaveBeenCalledWith({
			apiKey: testApiKey,
			baseURL: "https://api.fireworks.ai/inference/v1",
			maxRetries: 3,
		});
		expect(mockCreate).toHaveBeenCalledWith({
			model: testModel,
			messages: [{ role: "user", content: testPrompt }],
			temperature: 0.2,
		});
	});

	it("handles empty content response", async () => {
		const mockResponse = {
			choices: [{ message: { content: null } }],
		};

		mockCreate.mockResolvedValueOnce(mockResponse);

		const result = await callLLM(testApiKey, testPrompt, testModel);

		expect(result).toBe("");
	});

	describe("Rate Limit Errors", () => {
		it("throws RateLimitError on 429 status", async () => {
			const error = Object.assign(
				new OpenAI.APIError(
					429,
					{ error: { message: "Rate limit exceeded" } },
					"Rate limit exceeded",
					{}
				),
				{ status: 429 }
			);

			mockCreate.mockRejectedValueOnce(error);

			await expect(callLLM(testApiKey, testPrompt, testModel)).rejects.toThrow(
				RateLimitError,
			);
		});
	});

	describe("Client Errors (4xx)", () => {
		it("throws LLMClientError on 400 Bad Request", async () => {
			const error = Object.assign(
				new OpenAI.APIError(
					400,
					{ error: { message: "Invalid request format" } },
					"Invalid request format",
					{}
				),
				{ status: 400 }
			);

			mockCreate.mockRejectedValueOnce(error);

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
		});

		it("throws LLMClientError on 401 Unauthorized", async () => {
			const error = Object.assign(
				new OpenAI.APIError(
					401,
					{ error: { message: "Invalid API key" } },
					"Invalid API key",
					{}
				),
				{ status: 401 }
			);

			mockCreate.mockRejectedValueOnce(error);

			try {
				await callLLM(testApiKey, testPrompt, testModel);
				fail("Should have thrown LLMClientError");
			} catch (error) {
				expect(error).toBeInstanceOf(LLMClientError);
				expect((error as LLMClientError).statusCode).toBe(401);
				expect((error as LLMClientError).message).toContain(
					"Invalid request to LLM service",
				);
			}
		});

		it("throws LLMClientError on 403 Forbidden", async () => {
			const error = Object.assign(
				new OpenAI.APIError(
					403,
					{ error: { message: "Access denied" } },
					"Access denied",
					{}
				),
				{ status: 403 }
			);

			mockCreate.mockRejectedValueOnce(error);

			try {
				await callLLM(testApiKey, testPrompt, testModel);
				fail("Should have thrown LLMClientError");
			} catch (error) {
				expect(error).toBeInstanceOf(LLMClientError);
				expect((error as LLMClientError).statusCode).toBe(403);
			}
		});
	});

	describe("Server Errors (5xx)", () => {
		it("throws LLMServerError on 500 Internal Server Error", async () => {
			const error = Object.assign(
				new OpenAI.APIError(
					500,
					{ error: { message: "Internal server error" } },
					"Internal server error",
					{}
				),
				{ status: 500 }
			);

			mockCreate.mockRejectedValueOnce(error);

			try {
				await callLLM(testApiKey, testPrompt, testModel);
				fail("Should have thrown LLMServerError");
			} catch (error) {
				expect(error).toBeInstanceOf(LLMServerError);
				expect((error as LLMServerError).message).toBe(
					"LLM service temporarily unavailable. Please try again later.",
				);
			}
		});

		it("throws LLMServerError on 502 Bad Gateway", async () => {
			const error = Object.assign(
				new OpenAI.APIError(
					502,
					{ error: { message: "Bad gateway" } },
					"Bad gateway",
					{}
				),
				{ status: 502 }
			);

			mockCreate.mockRejectedValueOnce(error);

			try {
				await callLLM(testApiKey, testPrompt, testModel);
				fail("Should have thrown LLMServerError");
			} catch (error) {
				expect(error).toBeInstanceOf(LLMServerError);
			}
		});

		it("throws LLMServerError on 503 Service Unavailable", async () => {
			const error = Object.assign(
				new OpenAI.APIError(
					503,
					{ error: { message: "Service unavailable" } },
					"Service unavailable",
					{}
				),
				{ status: 503 }
			);

			mockCreate.mockRejectedValueOnce(error);

			try {
				await callLLM(testApiKey, testPrompt, testModel);
				fail("Should have thrown LLMServerError");
			} catch (error) {
				expect(error).toBeInstanceOf(LLMServerError);
			}
		});
	});

	describe("Non-APIError handling", () => {
		it("throws non-APIError errors directly", async () => {
			const error = new Error("Network error");

			mockCreate.mockRejectedValueOnce(error);

			await expect(callLLM(testApiKey, testPrompt, testModel)).rejects.toThrow(
				"Network error",
			);
		});
	});

	describe("Retry configuration", () => {
		it("passes custom retry count to OpenAI client", async () => {
			const mockResponse = {
				choices: [{ message: { content: "Success" } }],
			};

			mockCreate.mockResolvedValueOnce(mockResponse);

			await callLLM(testApiKey, testPrompt, testModel, 5);

			expect(OpenAI).toHaveBeenCalledWith({
				apiKey: testApiKey,
				baseURL: "https://api.fireworks.ai/inference/v1",
				maxRetries: 5,
			});
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
