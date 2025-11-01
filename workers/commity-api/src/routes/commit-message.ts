import type { Context } from "hono";
import type { Bindings, CommitMessageRequest } from "../types";
import { checkRateLimit } from "../utils/rate-limit";
import { buildPrompt, buildChunkPrompt, buildFinalPrompt } from "../prompts";
import { chunkDiffs } from "../utils/diff-chunker";
import { summarizeChunk, generateFinalMessage } from "../utils/llm-client";
import { processWithAdaptiveConcurrency } from "../utils/adaptive-concurrency";

export async function commitMessageHandler(c: Context<{ Bindings: Bindings }>) {
	const ip = c.req.header("cf-connecting-ip") || "unknown";
	const max = Number.parseInt(c.env.RATE_LIMIT_MAX) || 100;
	const window = Number.parseInt(c.env.RATE_LIMIT_WINDOW) || 3600;
	const allowed = await checkRateLimit(c.env.RATE_LIMIT, ip, max, window);

	if (!allowed) {
		return c.json({ error: "Rate limit exceeded" }, 429);
	}

	const body = await c.req.json() as CommitMessageRequest;

	if (!body.diffs || !Array.isArray(body.diffs)) {
		return c.json({ error: "Invalid diffs" }, 400);
	}

	if (!body.branch || typeof body.branch !== "string") {
		return c.json({ error: "Invalid branch" }, 400);
	}

	if (!body.author || typeof body.author !== "string") {
		return c.json({ error: "Invalid author" }, 400);
	}

	const prompt = buildPrompt(body.diffs, body.branch, body.author, body.override);

	try {
		let finalMessage: string;

		if (prompt.length > 50000) {
			const chunks = chunkDiffs(body.diffs);

			const summaries: string[] = [];
			for (const chunk of chunks) {
				const chunkPrompt = buildChunkPrompt(chunk.files);
				const summary = await summarizeChunk(c.env.FIREWORKS_API_KEY, chunkPrompt);
				summaries.push(summary);
			}

			const finalPrompt = buildFinalPrompt(summaries, body.branch, body.author, body.override);
			finalMessage = await generateFinalMessage(c.env.FIREWORKS_API_KEY, finalPrompt);
		} else {
			finalMessage = await generateFinalMessage(c.env.FIREWORKS_API_KEY, prompt);
		}
		
		return c.json({ message: finalMessage });
	} catch (error) {
		console.error("Error calling Fireworks API:", error);
		return c.json({ error: "Failed to generate commit message" }, 500);
	}
}
