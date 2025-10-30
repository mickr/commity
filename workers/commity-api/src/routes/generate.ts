import type { Context } from "hono";
import type { Bindings } from "../types";
import { checkRateLimit } from "../utils/rate-limit";

export async function generateHandler(c: Context<{ Bindings: Bindings }>) {
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
}
