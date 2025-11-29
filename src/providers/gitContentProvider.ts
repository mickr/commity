import * as vscode from "vscode";
import * as fs from "node:fs";
import * as git from "isomorphic-git";

export class GitContentProvider implements vscode.TextDocumentContentProvider {
	public static readonly scheme = "commity-git";

	constructor(private readonly _context: vscode.ExtensionContext) {}

	async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
		const commitHash = uri.authority;
		const filePath = uri.path.startsWith("/") ? uri.path.substring(1) : uri.path;
		
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const gitApi = gitExtension?.getAPI(1);
		
		if (!gitApi || gitApi.repositories.length === 0) {
			return "";
		}

		const repository = gitApi.repositories[0];
		const dir = repository.rootUri.fsPath;

		try {
			const { blob } = await git.readBlob({
				fs,
				dir,
				oid: commitHash,
				filepath: filePath,
			});
			return new TextDecoder().decode(blob);
		} catch (error) {
			console.error(`Failed to get content for ${commitHash}:${filePath}`, error);
			return "";
		}
	}
}
