export async function processWithConcurrencyLimit<T, R>(
	items: T[],
	processor: (item: T) => Promise<R>,
	concurrencyLimit: number
): Promise<R[]> {
	const results: R[] = [];
	const executing: Promise<void>[] = [];

	for (const [index, item] of items.entries()) {
		const promise = processor(item).then((result) => {
			results[index] = result;
		});

		executing.push(promise);

		if (executing.length >= concurrencyLimit) {
			await Promise.race(executing);
			executing.splice(
				executing.findIndex((p) => p === promise),
				1
			);
		}
	}

	await Promise.all(executing);
	return results;
}
