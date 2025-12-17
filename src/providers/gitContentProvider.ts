import * as vscode from "vscode";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getVSCodeGitAPI } from "../services/git";

const execFileAsync = promisify(execFile);

/**
 * Provides file content at specific git commits for VS Code's diff viewer.
 *
 * NOTE: We use git CLI here instead of isomorphic-git because isomorphic-git's
 * readBlob API doesn't support git revision syntax (^, ~, branch names, etc.).
 * The URI authority contains refs like "abc1234^" (parent commit) which only
 * the git CLI can resolve natively. This is an acceptable tradeoff since diff
 * viewing is user-initiated and not latency-critical like commit generation.
 */
export class GitContentProvider implements vscode.TextDocumentContentProvider {
	public static readonly scheme = "commity-git";

	constructor(private readonly _context: vscode.ExtensionContext) {}

	async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
		const commitRef = uri.authority;
		const filePath = uri.path.startsWith("/") ? uri.path.substring(1) : uri.path;

		const git = getVSCodeGitAPI();
		if (!git) {
			return "";
		}

		const repository = git.repositories[0];
		const cwd = repository.rootUri.fsPath;

		try {
			const { stdout } = await execFileAsync("git", ["show", `${commitRef}:${filePath}`], {
				cwd,
				maxBuffer: 10 * 1024 * 1024,
				encoding: "utf-8",
			});
			return stdout;
		} catch (error) {
			// File might not exist in this commit (new file or deleted file)
			console.error(`Failed to get content for ${commitRef}:${filePath}`, error);
			return "";
		}
	}
}
