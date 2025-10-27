// read commity configuration file
import fs from "node:fs";
import path from "node:path";
import * as vscode from "vscode";
import { configurationSchema } from "../types/config";
import { defaultCommitMessagePrompt } from "./prompts";

function processTemplate(templateData: string) {
	return templateData;
}
export function readConfiguration(context: vscode.ExtensionContext) {
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

	if (!workspaceRoot) {
		return {
			success: false,
			data: defaultCommitMessagePrompt,
		};
	}

	console.log("[Commity] Workspace root:", workspaceRoot);
	const configurationFile = path.join(workspaceRoot, ".commity.json");
	console.log("[Commity] Looking for config at:", configurationFile);

	// Check if file exists first
	if (!fs.existsSync(configurationFile)) {
		return {
			success: false,
			data: defaultCommitMessagePrompt,
		};
	}

	let configurationContent: string;

	try {
		configurationContent = fs.readFileSync(configurationFile, "utf8");
	} catch (error) {
		return {
			success: false,
			data: defaultCommitMessagePrompt,
		};
	}

	try {
		const result = configurationSchema.safeParse(JSON.parse(configurationContent));

		if (!result.success) {
			throw new Error("Invalid configuration file");
		}

		return {
			success: true,
			data: processTemplate(result.data.commitMessagePrompt),
		};
	} catch (error) {
		return {
			success: false,
			data: defaultCommitMessagePrompt,
		};
	}
}
