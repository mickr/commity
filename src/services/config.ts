// read commity configuration file
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { configurationSchema } from "../types/config";
import { getVSCodeGitAPI } from "./git";

export function readConfiguration() {
	// Use git repository root instead of workspace root to support monorepos
	const git = getVSCodeGitAPI();
	const repository = git?.repositories[0];

	if (!repository) {
		return {
			success: false,
			data: undefined,
		};
	}

	const gitRoot = repository.rootUri.fsPath;
	const configurationFile = path.join(gitRoot, ".commity.yaml");

	// Check if file exists first
	if (!fs.existsSync(configurationFile)) {
		return {
			success: false,
			data: undefined,
		};
	}

	let configurationContent: string;

	try {
		configurationContent = fs.readFileSync(configurationFile, "utf8");
	} catch (error) {
		return {
			success: false,
			data: undefined,
		};
	}

	try {
		const parsed = yaml.load(configurationContent);
		const result = configurationSchema.safeParse(parsed);

		if (!result.success) {
			throw new Error("Invalid configuration file");
		}

		return {
			success: true,
			data: result.data.commitMessagePrompt,
		};
	} catch (error) {
		return {
			success: false,
			data: undefined,
		};
	}
}
