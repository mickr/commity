import type { DiffEntry } from "../types";

const CHUNK_SIZE_LIMIT = 15000;
const LARGE_FILE_THRESHOLD = 20000;

export interface DiffChunk {
	files: DiffEntry[];
	estimatedSize: number;
}

function groupFilesByDirectory(diffs: DiffEntry[]): Map<string, DiffEntry[]> {
	const groups = new Map<string, DiffEntry[]>();
	
	for (const diff of diffs) {
		const dirPath = diff.path.substring(0, diff.path.lastIndexOf('/')) || '/';
		if (!groups.has(dirPath)) {
			groups.set(dirPath, []);
		}
		groups.get(dirPath)!.push(diff);
	}
	
	return groups;
}

export function chunkDiffs(diffs: DiffEntry[]): DiffChunk[] {
	const chunks: DiffChunk[] = [];
	const dirGroups = groupFilesByDirectory(diffs);
	
	let currentChunk: DiffEntry[] = [];
	let currentSize = 0;

	for (const [directory, files] of dirGroups) {
		for (const diff of files) {
			const diffSize = diff.path.length + diff.diff.length;

			if (diffSize > LARGE_FILE_THRESHOLD) {
				if (currentChunk.length > 0) {
					chunks.push({
						files: currentChunk,
						estimatedSize: currentSize,
					});
					currentChunk = [];
					currentSize = 0;
				}
				
				chunks.push({
					files: [diff],
					estimatedSize: diffSize,
				});
				continue;
			}

			if (currentSize + diffSize > CHUNK_SIZE_LIMIT && currentChunk.length > 0) {
				chunks.push({
					files: currentChunk,
					estimatedSize: currentSize,
				});
				currentChunk = [];
				currentSize = 0;
			}

			currentChunk.push(diff);
			currentSize += diffSize;
		}
	}

	if (currentChunk.length > 0) {
		chunks.push({
			files: currentChunk,
			estimatedSize: currentSize,
		});
	}

	return chunks;
}

export function buildChunkPrompt(files: DiffEntry[]): string {
	const changesText = files
		.map(({ path, diff }) => `File: ${path}\n${diff}`)
		.join("\n\n");

	return `Analyze these file changes and provide a concise summary of what was modified, added, or removed. Focus on the key changes:

<changes>
${changesText}
</changes>

Provide a brief summary in bullet points describing the significant changes.`;
}

export function buildFinalPrompt(summaries: string[], branch: string, author: string, override?: string): string {
	const combinedSummaries = summaries.map((s, i) => `Chunk ${i + 1}:\n${s}`).join("\n\n");

	const basePrompt = override || `You are generating a Git commit message based on summaries of file changes.

Here are summaries of different parts of the changeset:

<summaries>
${combinedSummaries}
</summaries>

Your task is to create a single, cohesive commit message that captures all the changes. Use the following format:

- <change description>
- <change description>

Guidelines:
- Use the imperative mood (e.g., "Add feature" not "Added feature")
- Start with a capital letter
- Do not end with a period
- Focus on what the change accomplishes
- Never sign the commit or state it was generated with an LLM

Return only the commit message without any additional text, explanations, or formatting.`;

	return basePrompt;
}
