export interface LLMProvider {
	streamText(prompt: string): AsyncGenerator<string>;
	generateText(prompt: string): Promise<string>;
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
