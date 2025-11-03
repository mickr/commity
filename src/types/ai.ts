export interface LLMProvider {
	streamText(prompt: string): AsyncGenerator<string>;
	generateText(prompt: string): Promise<string>;
	generateCommitMessage(request: CommitMessageRequest, signal?: AbortSignal): Promise<string>;
	streamCommitMessage(request: CommitMessageRequest, signal?: AbortSignal): AsyncGenerator<string>;
}

export interface DiffEntry {
	path: string;
	diff: string;
}

export interface CommitMessageRequest {
	diffs: DiffEntry[];
	branch: string;
	author: string;
	override?: string;
}
