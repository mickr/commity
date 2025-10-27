export interface LLMProvider {
	streamText(prompt: string): AsyncGenerator<string>;
	generateText(prompt: string): Promise<string>;
}
