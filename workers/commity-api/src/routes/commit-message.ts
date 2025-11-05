import type { Context } from "hono";
import type { Bindings, CommitMessageRequest } from "../types";
import { checkRateLimit } from "../utils/rate-limit";
import { buildFolderPrompt, buildSynthesisPrompt } from "../prompts";
import { generateFinalMessage, callLLM } from "../utils/llm-client";

export async function commitMessageHandler(c: Context<{ Bindings: Bindings }>) {
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
					"accounts/fireworks/models/gpt-oss-20b",
					3,
					0.2,
				);
				return { folder, summary };
			}),
		);

		const synthesisPrompt = buildSynthesisPrompt(
			folderSummaries,
			body.branch,
			body.author,
		);
		const finalMessage = await generateFinalMessage(
			c.env.FIREWORKS_API_KEY,
			synthesisPrompt,
		);

		return c.json({ message: finalMessage });
	} catch (error) {
		console.error("Error calling Fireworks API:", error);
		return c.json({ error: "Failed to generate commit message" }, 500);
	}
}
