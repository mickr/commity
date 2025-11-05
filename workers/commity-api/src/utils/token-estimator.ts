export function estimateTokenCount(text: string): number {
	return Math.ceil(text.length / 4);
}

export function estimateDiffsTokenCount(
	diffs: Array<{ path: string; diff: string }>,
): number {
	const totalChars = diffs.reduce((sum, { path, diff }) => {
		const pathLen = path?.length || 0;
		const diffLen = diff?.length || 0;
		return sum + pathLen + diffLen;
	}, 0);
	
	return Math.ceil(totalChars / 4);
}
