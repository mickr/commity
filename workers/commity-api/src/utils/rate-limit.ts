export async function checkRateLimit(
	kv: KVNamespace,
	ip: string,
	max: number,
	window: number
): Promise<boolean> {
	const key = `ratelimit:${ip}`;
	const current = await kv.get(key);
	const count = current ? Number.parseInt(current) : 0;

	if (count >= max) {
		return false;
	}

	await kv.put(key, (count + 1).toString(), { expirationTtl: window });
	return true;
}
