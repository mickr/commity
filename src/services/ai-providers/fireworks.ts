import type { CommitMessageRequest, LLMProvider, SquashMessageRequest } from "../../types/ai";

export const resolveFireworksBaseUrl = (isDevelopment: boolean): string => {
	return isDevelopment ? "http://localhost:8787" : "https://fireworks.commity.ai";
};

let instance: FireworksProvider | undefined;

export function initFireworksProvider(isDevelopment: boolean): void {
	instance = new FireworksProvider(isDevelopment);
}

export function getFireworksProvider(): FireworksProvider {
	if (!instance) {
		throw new Error(
			"FireworksProvider not initialized. Call initFireworksProvider during activation."
		);
	}
	return instance;
}

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

export class FireworksError extends Error {
	constructor(
		public readonly status: number,
		message: string
	) {
		super(message);
		this.name = "FireworksError";
	}
}

export class FireworksProvider implements LLMProvider {
	private readonly baseUrl: string;

	constructor(isDevelopment: boolean) {
		this.baseUrl = resolveFireworksBaseUrl(isDevelopment);
	}

	private async throwIfNotOk(response: Response): Promise<void> {
		if (!response.ok) {
			const error = (await response.json().catch(() => null)) as FireworksErrorResponse | null;
			throw new FireworksError(
				response.status,
				`Fireworks API error: ${response.status} - ${error?.error || response.statusText}`
			);
		}
	}

	private async *streamSSE(response: Response): AsyncGenerator<string> {
		if (!response.body) {
			throw new Error("Response body is null");
		}

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		try {
			while (true) {
				const { done, value } = await reader.read();

				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";

				for (const line of lines) {
					if (line.startsWith("data: ")) {
						const data = line.slice(6).replace(/\\n/g, "\n");
						if (data) {
							yield data;
						}
					} else if (line.startsWith("event: error")) {
						const nextLine = lines.shift();
						if (nextLine?.startsWith("data: ")) {
							throw new Error(nextLine.slice(6));
						}
					}
				}
			}
		} finally {
			try {
				await reader.cancel();
			} catch {
				// Ignore cancellation errors
			}
			reader.releaseLock();
		}
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

		await this.throwIfNotOk(response);

		const data: unknown = await response.json();

		if (!isFireworksSuccessResponse(data)) {
			throw new Error("Fireworks API returned an unexpected payload");
		}

		return data.message;
	}

	async generateCommitMessage(
		request: CommitMessageRequest,
		signal?: AbortSignal
	): Promise<string> {
		const endpoint = new URL("/api/commit-message", this.baseUrl).toString();

		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(request),
			signal,
		});

		await this.throwIfNotOk(response);

		const data: unknown = await response.json();

		if (!isFireworksSuccessResponse(data)) {
			throw new Error("Fireworks API returned an unexpected payload");
		}

		return data.message;
	}

	async *streamCommitMessage(
		request: CommitMessageRequest,
		signal?: AbortSignal
	): AsyncGenerator<string> {
		const endpoint = new URL("/api/commit-message/stream", this.baseUrl).toString();

		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(request),
			signal,
		});

		await this.throwIfNotOk(response);
		yield* this.streamSSE(response);
	}

	async *streamSquashMessage(
		request: SquashMessageRequest,
		signal?: AbortSignal
	): AsyncGenerator<string> {
		const endpoint = new URL("/api/squash-message/stream", this.baseUrl).toString();

		const response = await fetch(endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(request),
			signal,
		});

		await this.throwIfNotOk(response);
		yield* this.streamSSE(response);
	}
}
