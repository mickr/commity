import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { Bindings, CommitMessageRequest } from "../types";
import { checkRateLimit } from "../utils/rate-limit";
import { buildFolderPrompt, buildSynthesisPrompt } from "../prompts";
import { callLLM, streamFinalMessage } from "../utils/llm-client";

export async function commitMessageStreamHandler(c: Context<{ Bindings: Bindings }>) {
	const ip = c.req.header("cf-connecting-ip") || "unknown";
	const max = Number.parseInt(c.env.RATE_LIMIT_MAX) || 100;
	const window = Number.parseInt(c.env.RATE_LIMIT_WINDOW) || 3600;
	const allowed = await checkRateLimit(c.env.RATE_LIMIT, ip, max, window);

	if (!allowed) {
		return c.json({ error: "Rate limit exceeded" }, 429);
	}

	const body = (await c.req.json()) as CommitMessageRequest;

	if (!body.diffs || !Array.isArray(body.diffs)) {
		return c.json({ error: "Invalid diffs" }, 400);
	}

	if (!body.branch || typeof body.branch !== "string") {
		return c.json({ error: "Invalid branch" }, 400);
	}

	if (!body.author || typeof body.author !== "string") {
		return c.json({ error: "Invalid author" }, 400);
	}

	try {
		const folderGroups = body.diffs.reduce(
			(acc, diff) => {
				const folder = diff.path.includes("/")
					? diff.path.substring(0, diff.path.lastIndexOf("/"))
					: ".";
				if (!acc[folder]) {
					acc[folder] = [];
				}
				acc[folder].push(diff);
				return acc;
			},
			{} as Record<string, Array<{ path: string; diff: string }>>,
		);

		const folderSummaries = await Promise.all(
			Object.entries(folderGroups).map(async ([folder, files]) => {
				const folderPrompt = buildFolderPrompt(folder, files);
				const summary = await callLLM(
					c.env.FIREWORKS_API_KEY,
					folderPrompt,
					"accounts/fireworks/models/llama-v3p1-8b-instruct",
					3,
					0.2,
				);
				return { folder, summary };
			}),
		);

		const synthesisPrompt = buildSynthesisPrompt(folderSummaries, body.override);

		return streamSSE(c, async (stream) => {
			try {
				for await (const chunk of streamFinalMessage(c.env.FIREWORKS_API_KEY, synthesisPrompt)) {
					await stream.writeSSE({
						data: chunk,
					});
				}
			} catch (error) {
				await stream.writeSSE({
					event: "error",
					data: error instanceof Error ? error.message : "Unknown error",
				});
			}
		});
	} catch (error) {
		console.error("Error calling Fireworks API:", error);
		return c.json({ error: "Failed to generate commit message" }, 500);
	}
}
