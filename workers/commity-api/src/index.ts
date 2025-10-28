import { Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = {
	FIREWORKS_API_KEY: string;
	RATE_LIMIT: KVNamespace;
	RATE_LIMIT_MAX: string;
	RATE_LIMIT_WINDOW: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use("/*", cors());

async function checkRateLimit(
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

app.post("/api/generate", async (c) => {
	const ip = c.req.header("cf-connecting-ip") || "unknown";
	const max = Number.parseInt(c.env.RATE_LIMIT_MAX) || 100;
	const window = Number.parseInt(c.env.RATE_LIMIT_WINDOW) || 3600;
	const allowed = await checkRateLimit(c.env.RATE_LIMIT, ip, max, window);

	if (!allowed) {
		return c.json({ error: "Rate limit exceeded" }, 429);
	}

	const { prompt } = await c.req.json();

	if (!prompt || typeof prompt !== "string") {
		return c.json({ error: "Invalid prompt" }, 400);
	}

	if (prompt.length > 50000) {
		return c.json({ error: "Prompt too large" }, 400);
	}

	try {
		const response = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${c.env.FIREWORKS_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: "accounts/fireworks/models/llama-v3p1-8b-instruct",
				messages: [{ role: "user", content: prompt }],
				max_tokens: 500,
				temperature: 0.7,
			}),
		});

		if (!response.ok) {
			throw new Error(`Fireworks API error: ${response.status}`);
		}

		const data = await response.json() as any;
		
		return c.json({ message: data.choices[0].message.content });
	} catch (error) {
		console.error("Error calling Fireworks API:", error);
		return c.json({ error: "Failed to generate commit message" }, 500);
	}
});

app.get("/health", (c) => c.json({ status: "ok" }));

export default app;
