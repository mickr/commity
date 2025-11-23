import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GitContentProvider implements vscode.TextDocumentContentProvider {
	public static readonly scheme = "commity-git";

	constructor(private readonly context: vscode.ExtensionContext) {}

	async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
		// uri.authority is the commit hash
		// uri.path is the file path (absolute or relative to repo root? let's use relative)
		
		const commitHash = uri.authority;
		const filePath = uri.path.startsWith("/") ? uri.path.substring(1) : uri.path;
		
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);
		
		if (!git || git.repositories.length === 0) {
			return "";
		}

		const repository = git.repositories[0];
		const cwd = repository.rootUri.fsPath;

		try {
			const { stdout } = await execFileAsync("git", ["show", `${commitHash}:${filePath}`], {
				cwd,
				maxBuffer: 10 * 1024 * 1024,
			});
			return stdout;
		} catch (error) {
			console.error(`Failed to get content for ${commitHash}:${filePath}`, error);
			return "";
		}
	}
}
