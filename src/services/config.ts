// read commity configuration file
import fs from "node:fs";
import path from "node:path";
import * as vscode from "vscode";
import yaml from "js-yaml";
import { configurationSchema } from "../types/config";
import type { API, Repository } from "../types/git";

export function readConfiguration() {
	// Use git repository root instead of workspace root to support monorepos
	const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
	const git = gitExtension?.getAPI(1) as API | undefined;
	const repository: Repository | undefined = git?.repositories[0];

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
			data: result.data,
		};
	} catch (error) {
		return {
			success: false,
			data: undefined,
		};
	}
}
