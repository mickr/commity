export type Bindings = {
	FIREWORKS_API_KEY: string;
	RATE_LIMIT: KVNamespace;
	RATE_LIMIT_MAX: string;
	RATE_LIMIT_WINDOW: string;
};

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
