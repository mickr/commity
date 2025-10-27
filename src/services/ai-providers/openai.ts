import OpenAI from "openai";
import type { LLMProvider } from "../ai";

export class OpenAIProvider implements LLMProvider {
	private client: OpenAI;
	private model: string;

	constructor(apiKey: string, model = "gpt-4o-mini") {
		this.model = model;
		this.client = new OpenAI({ apiKey });
	}

	async *streamText(prompt: string): AsyncGenerator<string> {
		const stream = await this.client.chat.completions.create({
			model: this.model,
			messages: [{ role: "user", content: prompt }],
			stream: true,
		});

		for await (const chunk of stream) {
			const content = chunk.choices[0]?.delta?.content;
			if (content) {
				yield content;
			}
		}
	}

	async generateText(prompt: string): Promise<string> {
		const response = await this.client.chat.completions.create({
			model: "gpt-4o-mini",
			messages: [{ role: "user", content: prompt }],
		});

		return response.choices[0]?.message?.content || "";
	}
}
