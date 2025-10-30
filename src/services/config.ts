// read commity configuration file
import fs from "node:fs";
import path from "node:path";
import * as vscode from "vscode";
import yaml from "js-yaml";
import { configurationSchema } from "../types/config";

function processTemplate(templateData: string) {
	return templateData;
}

export function readConfiguration() {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

	if (!workspaceRoot) {
		return {
			success: false,
			data: undefined,
		};
	}

	const configurationFile = path.join(workspaceRoot, ".commity.yaml");

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
