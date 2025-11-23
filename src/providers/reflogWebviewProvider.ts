import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import type { Repository } from "../types/git";
import { getActualCurrentBranch, getReflogEntries, type ReflogEntry } from "../services/git";
import { GitContentProvider } from "./gitContentProvider";

class ReflogDiffProvider implements vscode.TextDocumentContentProvider {
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	readonly onDidChange = this._onDidChange.event;
	private content = new Map<string, string>();

	provideTextDocumentContent(uri: vscode.Uri): string {
		return this.content.get(uri.toString()) || "";
	}

	updateContent(uri: vscode.Uri, content: string): void {
		this.content.set(uri.toString(), content);
		this._onDidChange.fire(uri);
	}
}

export class ReflogWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "commity.reflogView";
	private _view?: vscode.WebviewView;
	private _diffProvider: ReflogDiffProvider;
	private _diffContent = new Map<string, string>();

	constructor(
		private readonly _extensionUri: vscode.Uri,
		private readonly _context: vscode.ExtensionContext
	) {
		this._diffProvider = new ReflogDiffProvider();
		_context.subscriptions.push(
			vscode.workspace.registerTextDocumentContentProvider("commity-reflog", this._diffProvider)
		);
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri],
		};

		webviewView.webview.onDidReceiveMessage(async (message) => {
			await this.handleMessage(message);
		});

		webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);
	}

	public refresh() {
		void this.updateReflog();
	}

	public focusUp() {
		this._view?.webview.postMessage({ type: "key", key: "ArrowUp" });
	}

	public focusDown() {
		this._view?.webview.postMessage({ type: "key", key: "ArrowDown" });
	}

	public selectEntry() {
		this._view?.webview.postMessage({ type: "key", key: " " });
	}

	private async updateReflog() {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			this._view?.webview.postMessage({ type: "reflogData", entries: [] });
			return;
		}

		const primaryRepo = this.getPrimaryRepository(git.repositories);
		if (primaryRepo && this._view) {
			const branch = await getActualCurrentBranch(primaryRepo);
			this._view.title = branch ? `Reflog (${branch})` : "Reflog";
		}

		const entries: ReflogEntry[] = [];
		for (const repo of git.repositories) {
			const repoEntries = await getReflogEntries(repo);
			entries.push(...repoEntries);
		}

		this._view?.webview.postMessage({ type: "reflogData", entries });
	}

	private getPrimaryRepository(repositories: Repository[]): Repository | undefined {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			const activePath = activeEditor.document.uri.fsPath;
			const match = repositories.find((repo) => activePath.startsWith(repo.rootUri.fsPath));
			if (match) {
				return match;
			}
		}
		return repositories[0];
	}

	private async handleMessage(message: { type: string; [key: string]: unknown }) {
		switch (message.type) {
			case "webviewLoaded":
			case "refresh":
				void this.updateReflog();
				break;
			case "selectEntry":
				void this.handleSelectEntry(message.entry as ReflogEntry);
				break;
			case "selectEntries":
				void this.handleSelectEntries(message.entries as ReflogEntry[]);
				break;
			case "compareEntries":
				void this.handleCompareEntries(message.entries as ReflogEntry[]);
				break;
			case "requestCommitFiles":
				void this.handleRequestCommitFiles(message.entry as ReflogEntry);
				break;
			case "openDiff":
				void this.handleOpenDiff(message.file as string, message.hash as string, message.parentHash as string);
				break;
			case "resetToEntry":
				void this.handleResetToEntry(message.entry as ReflogEntry);
				break;
		}
	}

	private async handleOpenDiff(file: string, hash: string, parentHash?: string) {
		try {
			const leftHash = parentHash || `${hash}^`;
			const rightHash = hash;
			const shortLeft = leftHash.substring(0, 7);
			const shortRight = rightHash.substring(0, 7);

			const leftUri = vscode.Uri.parse(`${GitContentProvider.scheme}://${leftHash}/${file}`);
			const rightUri = vscode.Uri.parse(`${GitContentProvider.scheme}://${rightHash}/${file}`);
			const title = `${file} (${shortLeft} ↔ ${shortRight})`;

			await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title, {
				preview: true,
				preserveFocus: true,
			});
		} catch (error) {
			console.error("Failed to open diff:", error);
			vscode.window.showErrorMessage(`Failed to open diff for ${file}`);
		}
	}

	private async handleRequestCommitFiles(entry: ReflogEntry) {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			return;
		}

		const repository = git.repositories[0];
		const cwd = repository.rootUri.fsPath;

		try {
			const { execFile } = await import("node:child_process");
			const { promisify } = await import("node:util");
			const execFileAsync = promisify(execFile);

			const { stdout: nameStatus } = await execFileAsync(
				"git",
				["show", "--name-only", "--format=", entry.hash],
				{
					cwd,
					maxBuffer: 10 * 1024 * 1024,
				}
			);

			const files = nameStatus
				.split("\n")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);

			this._view?.webview.postMessage({
				type: "showCommitFiles",
				files,
				hash: entry.hash,
			});
		} catch (error) {
			console.error("Failed to request commit files:", error);
		}
	}

	private async handleSelectEntry(entry: ReflogEntry) {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			return;
		}

		const repository = git.repositories[0];
		const cwd = repository.rootUri.fsPath;

		try {
			const { execFile } = await import("node:child_process");
			const { promisify } = await import("node:util");
			const execFileAsync = promisify(execFile);

			// Check if only one file changed in this commit
			const { stdout: nameStatus } = await execFileAsync(
				"git",
				["show", "--name-only", "--format=", entry.hash],
				{
					cwd,
					maxBuffer: 10 * 1024 * 1024,
				}
			);

			const files = nameStatus
				.split("\n")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);

			if (files.length === 1) {
				const file = files[0];
				const leftUri = vscode.Uri.parse(`${GitContentProvider.scheme}://${entry.hash}^/${file}`);
				const rightUri = vscode.Uri.parse(`${GitContentProvider.scheme}://${entry.hash}/${file}`);
				const title = `${file} (${entry.hash.substring(0, 7)})`;

				await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title, {
					preview: true,
					preserveFocus: true,
				});
			} else {
				// Show unified diff for the whole commit
				const { stdout: diff } = await execFileAsync("git", ["show", entry.hash], {
					cwd,
					maxBuffer: 10 * 1024 * 1024,
				});

				const content = diff;
				const uri = vscode.Uri.parse(`commity-reflog:${entry.hash}.diff`);

				this._diffProvider.updateContent(uri, content);

				await vscode.window.showTextDocument(uri, {
					preview: true,
					preserveFocus: true,
				});
			}
		} catch (error) {
			console.error("Failed to show reflog diff:", error);
		}
	}

	private async handleSelectEntries(entries: ReflogEntry[]) {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0 || entries.length === 0) {
			return;
		}

		const repository = git.repositories[0];
		const cwd = repository.rootUri.fsPath;

		// entries[0] is the newest, entries[length-1] is the oldest
		const newest = entries[0];
		const oldest = entries[entries.length - 1];

		try {
			const { execFile } = await import("node:child_process");
			const { promisify } = await import("node:util");
			const execFileAsync = promisify(execFile);

			// Check if only one file changed in this range
			const { stdout: nameStatus } = await execFileAsync(
				"git",
				["diff", "--name-only", `${oldest.hash}^..${newest.hash}`],
				{
					cwd,
					maxBuffer: 10 * 1024 * 1024,
				}
			);

			const files = nameStatus
				.split("\n")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);

			if (files.length === 1) {
				const file = files[0];
				const leftUri = vscode.Uri.parse(`${GitContentProvider.scheme}://${oldest.hash}^/${file}`);
				const rightUri = vscode.Uri.parse(`${GitContentProvider.scheme}://${newest.hash}/${file}`);
				const title = `${file} (${oldest.hash.substring(0, 7)}...${newest.hash.substring(0, 7)})`;

				await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title, {
					preview: true,
					preserveFocus: true,
				});
			} else {
				// For ranges with multiple files, show the unified diff instead of the file list
				// This is often more useful for reviewing a sequence of commits
				const { stdout: diff } = await execFileAsync(
					"git",
					["diff", `${oldest.hash}^..${newest.hash}`],
					{
						cwd,
						maxBuffer: 10 * 1024 * 1024,
					}
				);

				const content = `Reflog Range: ${oldest.hash.substring(0, 7)}...${newest.hash.substring(
					0,
					7
				)}\n\n${diff}`;
				const uri = vscode.Uri.parse(
					`commity-reflog:${oldest.hash.substring(0, 7)}-${newest.hash.substring(0, 7)}.diff`
				);

				this._diffProvider.updateContent(uri, content);

				await vscode.window.showTextDocument(uri, {
					preview: true,
					preserveFocus: true,
				});
			}
		} catch (error) {
			console.error("Failed to show reflog range diff:", error);
			vscode.window.showErrorMessage("Failed to show diff for selected range");
		}
	}

	private async handleCompareEntries(entries: ReflogEntry[]) {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0 || entries.length !== 2) {
			return;
		}

		const repository = git.repositories[0];
		const cwd = repository.rootUri.fsPath;

		// entries[0] is the newest, entries[1] is the oldest (based on index sorting from frontend)
		const newest = entries[0];
		const oldest = entries[1];

		try {
			const { execFile } = await import("node:child_process");
			const { promisify } = await import("node:util");
			const execFileAsync = promisify(execFile);

			// Check if only one file changed
			const { stdout: nameStatus } = await execFileAsync(
				"git",
				["diff", "--name-only", oldest.hash, newest.hash],
				{
					cwd,
					maxBuffer: 10 * 1024 * 1024,
				}
			);

			const files = nameStatus
				.split("\n")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);

			if (files.length === 1) {
				const file = files[0];
				const leftUri = vscode.Uri.parse(`${GitContentProvider.scheme}://${oldest.hash}/${file}`);
				const rightUri = vscode.Uri.parse(`${GitContentProvider.scheme}://${newest.hash}/${file}`);
				const title = `${file} (${oldest.hash.substring(0, 7)} ↔ ${newest.hash.substring(0, 7)})`;

				await vscode.commands.executeCommand("vscode.diff", leftUri, rightUri, title, {
					preview: true,
					preserveFocus: true,
				});
			} else {
				// Compare oldest to newest (what changed between them)
				const { stdout: diff } = await execFileAsync("git", ["diff", oldest.hash, newest.hash], {
					cwd,
					maxBuffer: 10 * 1024 * 1024,
				});

				const content = `Reflog Compare: ${oldest.hash.substring(0, 7)} ↔ ${newest.hash.substring(
					0,
					7
				)}\n\n${diff}`;
				const uri = vscode.Uri.parse(
					`commity-reflog:${oldest.hash.substring(0, 7)}-vs-${newest.hash.substring(0, 7)}.diff`
				);

				this._diffProvider.updateContent(uri, content);

				await vscode.window.showTextDocument(uri, {
					preview: true,
					preserveFocus: true,
				});
			}
		} catch (error) {
			console.error("Failed to show reflog comparison:", error);
			vscode.window.showErrorMessage("Failed to show comparison diff");
		}
	}

	private async handleResetToEntry(entry: ReflogEntry) {
		const confirm = await vscode.window.showWarningMessage(
			`Reset to ${entry.hash}?`,
			"Reset",
			"Cancel"
		);

		if (confirm === "Reset") {
			void vscode.window.showInformationMessage(`Would reset to ${entry.hash}`);
		}
	}

	private getHtmlForWebview(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, "out", "webview", "reflog", "index.js")
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, "out", "webview", "reflog", "index.css")
		);

		const nonce = getNonce();

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
				<link href="${styleUri}" rel="stylesheet">
				<title>Commity Reflog</title>
				<style>
					body {
						padding: 0;
						margin: 0;
						font-family: var(--vscode-font-family);
						font-size: var(--vscode-font-size);
						color: var(--vscode-foreground);
						background-color: var(--vscode-sideBar-background);
					}
				</style>
			</head>
			<body>
				<div id="app"></div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}

function getNonce(): string {
	return randomBytes(16).toString("base64url");
}
