interface LLMResponse {
	choices: Array<{
		message: {
			content: string;
		};
	}>;
}

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

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
): Promise<string> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const response = await fetch(
				"https://api.fireworks.ai/inference/v1/chat/completions",
				{
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						model,
						messages: [{ role: "user", content: prompt }],
						temperature: 0.2,
					}),
				},
			);

			if (response.status === 429) {
				if (attempt < retries) {
					const backoffMs = Math.min(1000 * 2 ** attempt, 10000);
					console.log(
						`Rate limited, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${retries})`,
					);
					await sleep(backoffMs);
					continue;
				}
				throw new RateLimitError("Rate limit exceeded after retries");
			}

			if (!response.ok) {
				const errorBody = await response.text().catch(() => "Unknown error");

				if (response.status >= 500) {
					throw new LLMServerError(
						"LLM service temporarily unavailable. Please try again later.",
					);
				}

				if (response.status >= 400) {
					throw new LLMClientError(
						`Invalid request to LLM service: ${errorBody}`,
						response.status,
					);
				}

				throw new Error(`Fireworks API error: ${response.status}`);
			}

			const data = (await response.json()) as LLMResponse;
			return data.choices[0].message.content;
		} catch (error) {
			lastError = error as Error;
			if (
				error instanceof RateLimitError ||
				error instanceof LLMClientError ||
				error instanceof LLMServerError
			) {
				throw error;
			}
			if (attempt < retries) {
				const backoffMs = Math.min(1000 * 2 ** attempt, 10000);
				console.log(
					`Request failed, retrying in ${backoffMs}ms (attempt ${attempt + 1}/${retries})`,
				);
				await sleep(backoffMs);
			}
		}
	}

	throw lastError || new Error("Failed to call LLM after retries");
}

export async function summarizeChunk(
	apiKey: string,
	prompt: string,
): Promise<string> {
	return callLLM(apiKey, prompt, "accounts/fireworks/models/gpt-oss-20b");
}

export async function generateFinalMessage(
	apiKey: string,
	prompt: string,
): Promise<string> {
	return callLLM(apiKey, prompt, "accounts/fireworks/models/gpt-oss-20b");
}
