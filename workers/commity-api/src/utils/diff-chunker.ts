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
