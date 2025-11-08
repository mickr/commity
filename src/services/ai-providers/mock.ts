import type { CommitMessageRequest, LLMProvider } from "../../types/ai";

export class MockLLMProvider implements LLMProvider {
	constructor(private mockResponse = "feat: mock commit message") {}

	async *streamText(_prompt: string): AsyncGenerator<string> {
		const words = this.mockResponse.split(" ");
		for (const word of words) {
			yield `${word} `;
		}
	}

	async generateText(_prompt: string): Promise<string> {
		return this.mockResponse;
	}

	async generateCommitMessage(
		_request: CommitMessageRequest,
		_signal?: AbortSignal
	): Promise<string> {
		return this.mockResponse;
	}

	async *streamCommitMessage(
		_request: CommitMessageRequest,
		_signal?: AbortSignal
	): AsyncGenerator<string> {
		const words = this.mockResponse.split(" ");
		for (const word of words) {
			yield `${word} `;
			await new Promise(resolve => setTimeout(resolve, 100));
		}
	}
}
