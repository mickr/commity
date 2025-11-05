import type { Context } from "hono";
import { streamSSE } from "hono/streaming";
import type { Bindings, CommitMessageRequest } from "../types";
import { checkRateLimit } from "../utils/rate-limit";
import {
	buildFolderPrompt,
	buildSynthesisPrompt,
	buildPrompt,
} from "../prompts";
import { callLLM, streamFinalMessage } from "../utils/llm-client";
import { estimateDiffsTokenCount } from "../utils/token-estimator";

export async function commitMessageStreamHandler(
	c: Context<{ Bindings: Bindings }>,
) {
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

	const diffsForEstimation = body.diffs.filter((d) => d.diff !== "deleted");
	const estimatedTokens = estimateDiffsTokenCount(diffsForEstimation);
	const TOKEN_THRESHOLD = 18000;
	const useFastPath = estimatedTokens < TOKEN_THRESHOLD;

	try {
		if (useFastPath) {
			const fastPathPrompt = buildPrompt(
				body.diffs,
				body.branch,
				body.author,
				body.override,
			);

			return streamSSE(c, async (stream) => {
				try {
					let buffer = "";
					let lastChar = "";
					
					for await (const chunk of streamFinalMessage(
						c.env.FIREWORKS_API_KEY,
						fastPathPrompt,
						256,
						"accounts/fireworks/models/qwen3-235b-a22b-instruct-2507",
					)) {
						buffer += chunk;
						
						while (buffer.length > 0) {
							if (buffer.startsWith("- ") && lastChar && lastChar !== "\n") {
								await stream.writeSSE({ data: "\\n" });
								lastChar = "\n";
							}
							
							const char = buffer[0];
							buffer = buffer.slice(1);
							
							await stream.writeSSE({
								data: char === "\n" ? "\\n" : char,
							});
							lastChar = char;
							
							if (buffer.length < 2) break;
						}
					}
					
					while (buffer.length > 0) {
						const char = buffer[0];
						buffer = buffer.slice(1);
						await stream.writeSSE({
							data: char === "\n" ? "\\n" : char,
						});
					}
				} catch (error) {
					console.error("Error generating commit message:", error);
					await stream.writeSSE({
						event: "error",
						data: error instanceof Error ? error.message : "Unknown error",
					});
				}
			});
		}
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
					0.0,
				);
				return { folder, summary };
			}),
		);

		const synthesisPrompt = buildSynthesisPrompt(
			folderSummaries,
			body.branch,
			body.author,
			body.override,
		);

		return streamSSE(c, async (stream) => {
			try {
				for await (const chunk of streamFinalMessage(
					c.env.FIREWORKS_API_KEY,
					synthesisPrompt,
					undefined,
					"accounts/fireworks/models/qwen3-235b-a22b-instruct-2507",
				)) {
					await stream.writeSSE({
						data: chunk.replace(/\n/g, "\\n"),
					});
				}
			} catch (error) {
				console.error("Error generating commit message:", error);
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
