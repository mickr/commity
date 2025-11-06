import OpenAI from "openai";

export class RateLimitError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "RateLimitError";
	}
}

export class LLMClientError extends Error {
	constructor(
		message: string,
		public statusCode: number,
	) {
		super(message);
		this.name = "LLMClientError";
	}
}

export class LLMServerError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LLMServerError";
	}
}

export async function callLLM(
	apiKey: string,
	prompt: string,
	model: string,
	retries = 3,
	temperature = 0.0,
	maxTokens?: number,
): Promise<string> {
	const client = new OpenAI({
		apiKey,
		baseURL: "https://api.fireworks.ai/inference/v1",
		maxRetries: retries,
	});

	try {
		const completion = await client.chat.completions.create({
			model,
			messages: [{ role: "user", content: prompt }],
			temperature,
			max_tokens: maxTokens,
		});

		return completion.choices[0].message.content || "";
	} catch (error) {
		if (error instanceof OpenAI.APIError) {
			if (error.status === 429) {
				throw new RateLimitError("Rate limit exceeded after retries");
			}

			if (error.status && error.status >= 500) {
				throw new LLMServerError(
					"LLM service temporarily unavailable. Please try again later.",
				);
			}

			if (error.status && error.status >= 400) {
				throw new LLMClientError(
					`Invalid request to LLM service: ${error.message}`,
					error.status,
				);
			}
		}

		throw error;
	}
}

export async function generateFinalMessage(
	apiKey: string,
	prompt: string,
): Promise<string> {
	return callLLM(apiKey, prompt, "accounts/fireworks/models/qwen3-235b-a22b-instruct-2507");
}

export async function* streamFinalMessage(
	apiKey: string,
	prompt: string,
	maxTokens?: number,
	model = "accounts/fireworks/models/qwen3-235b-a22b-instruct-2507",
): AsyncGenerator<string> {
	const client = new OpenAI({
		apiKey,
		baseURL: "https://api.fireworks.ai/inference/v1",
	});

	try {
		const stream = await client.chat.completions.create({
			model,
			messages: [{ role: "user", content: prompt }],
			temperature: 0.0,
			stream: true,
			max_tokens: maxTokens,
		});

		for await (const chunk of stream) {
			const content = chunk.choices[0]?.delta?.content;
			if (content) {
				yield content;
			}
		}
	} catch (error) {
		if (error instanceof OpenAI.APIError) {
			if (error.status === 429) {
				throw new RateLimitError("Rate limit exceeded");
			}

			if (error.status && error.status >= 500) {
				throw new LLMServerError(
					"LLM service temporarily unavailable. Please try again later.",
				);
			}

			if (error.status && error.status >= 400) {
				throw new LLMClientError(
					`Invalid request to LLM service: ${error.message}`,
					error.status,
				);
			}
		}

		throw error;
	}
}
