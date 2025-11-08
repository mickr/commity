import z from "zod";

export const configurationSchema = z.object({
	commitMessagePrompt: z.string(),
});

export type Configuration = z.infer<typeof configurationSchema>;
