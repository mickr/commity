import type { LLMProvider } from "../ai";

type ProxySuccessResponse = {
	message: string;
};

type ProxyErrorResponse = {
	error: string;
};

const isProxySuccessResponse = (value: unknown): value is ProxySuccessResponse => {
	return (
		typeof value === "object" &&
		value !== null &&
		"message" in value &&
		typeof (value as { message: unknown }).message === "string"
	);
};

export class ProxyProvider implements LLMProvider {
	private apiUrl: string;

	constructor(apiUrl: string) {
		this.apiUrl = apiUrl;
	}

	async *streamText(prompt: string): AsyncGenerator<string> {
		const text = await this.generateText(prompt);
		yield text;
	}

	async generateText(prompt: string): Promise<string> {
		const response = await fetch(`${this.apiUrl}/api/generate`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ prompt }),
		});

		if (!response.ok) {
			const error = (await response.json().catch(() => null)) as ProxyErrorResponse | null;
			throw new Error(
				`Proxy API error: ${response.status} - ${error?.error || response.statusText}`
			);
		}

		const data: unknown = await response.json();

		if (!isProxySuccessResponse(data)) {
			throw new Error("Proxy API returned an unexpected payload");
		}

		return data.message;
	}
}
