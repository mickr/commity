import type { LLMProvider } from "../ai";

export const resolveFireworksBaseUrl = (isDevelopment: boolean): string => {
	return isDevelopment ? "http://localhost:8787" : "https://fireworks.commity.ai";
};

type FireworksSuccessResponse = {
	message: string;
};

type FireworksErrorResponse = {
	error: string;
};

const isFireworksSuccessResponse = (value: unknown): value is FireworksSuccessResponse => {
	return (
		typeof value === "object" &&
		value !== null &&
		"message" in value &&
		typeof (value as { message: unknown }).message === "string"
	);
};

export class FireworksProvider implements LLMProvider {
	private readonly baseUrl: string;

	constructor(isDevelopment: boolean) {
		this.baseUrl = resolveFireworksBaseUrl(isDevelopment);
	}

	async *streamText(prompt: string): AsyncGenerator<string> {
		const text = await this.generateText(prompt);
		yield text;
	}

	async generateText(prompt: string): Promise<string> {
		const endpoint = new URL("/api/generate", this.baseUrl).toString();

		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ prompt }),
		});

		if (!response.ok) {
			const error = (await response.json().catch(() => null)) as FireworksErrorResponse | null;
			throw new Error(
				`Fireworks API error: ${response.status} - ${error?.error || response.statusText}`
			);
		}

		const data: unknown = await response.json();

		if (!isFireworksSuccessResponse(data)) {
			throw new Error("Fireworks API returned an unexpected payload");
		}

		return data.message;
	}
}
