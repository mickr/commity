import z from "zod";

export const configurationSchema = z.object({
	commitMessagePrompt: z.string(),
	lockFileHandling: z
		.object({
			include: z.boolean().default(true),
			useSummary: z.boolean().default(true),
		})
		.optional()
		.default({ include: true, useSummary: true }),
});

export type Configuration = z.infer<typeof configurationSchema>;
