import { RateLimitError } from "./llm-client";

export async function processWithAdaptiveConcurrency<T, R>(
	items: T[],
	processor: (item: T) => Promise<R>,
	initialConcurrency: number = 5,
	minConcurrency: number = 1
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let currentConcurrency = initialConcurrency;
	let consecutiveSuccesses = 0;
	let index = 0;

	console.log(`Starting with concurrency: ${currentConcurrency}`);

	while (index < items.length) {
		const batch = items.slice(index, index + currentConcurrency);
		const batchStartIndex = index;

		try {
			const batchResults = await Promise.all(
				batch.map(async (item, batchIndex) => {
					try {
						return await processor(item);
					} catch (error) {
						if (error instanceof RateLimitError) {
							throw error;
						}
						throw error;
					}
				})
			);

			for (let i = 0; i < batchResults.length; i++) {
				results[batchStartIndex + i] = batchResults[i];
			}

			consecutiveSuccesses++;
			index += batch.length;

			if (consecutiveSuccesses >= 3 && currentConcurrency < initialConcurrency) {
				currentConcurrency = Math.min(currentConcurrency + 1, initialConcurrency);
				console.log(`Increasing concurrency to: ${currentConcurrency}`);
				consecutiveSuccesses = 0;
			}
		} catch (error) {
			if (error instanceof RateLimitError) {
				currentConcurrency = Math.max(Math.floor(currentConcurrency / 2), minConcurrency);
				console.log(`Rate limited! Reducing concurrency to: ${currentConcurrency}`);
				consecutiveSuccesses = 0;
				await new Promise((resolve) => setTimeout(resolve, 2000));
				continue;
			}
			throw error;
		}
	}

	return results;
}
