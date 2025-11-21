import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import { getReflogEntries, type ReflogEntry } from "../services/git";

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

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(async (message) => {
			await this._handleMessage(message);
		});

		void this._updateReflog();
	}

	public refresh() {
		void this._updateReflog();
	}

	private async _updateReflog() {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			this._view?.webview.postMessage({ type: "reflogData", entries: [] });
			return;
		}

		const entries: ReflogEntry[] = [];
		for (const repo of git.repositories) {
			const repoEntries = await getReflogEntries(repo);
			entries.push(...repoEntries);
		}

		this._view?.webview.postMessage({ type: "reflogData", entries });
	}

	private async _handleMessage(message: { type: string; [key: string]: unknown }) {
		switch (message.type) {
			case "refresh":
				void this._updateReflog();
				break;
			case "selectEntry":
				void this._handleSelectEntry(message.entry as ReflogEntry);
				break;
			case "resetToEntry":
				void this._handleResetToEntry(message.entry as ReflogEntry);
				break;
		}
	}

	private async _handleSelectEntry(entry: ReflogEntry) {
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

			const { stdout: diff } = await execFileAsync("git", ["show", "--format=", entry.hash], {
				cwd,
				maxBuffer: 10 * 1024 * 1024,
			});

			const content = `Reflog: ${entry.selector} - ${entry.message}\nCommit: ${entry.hash}\n\n${diff}`;
			const uri = vscode.Uri.parse(`commity-reflog:${entry.hash}.diff`);

			this._diffProvider.updateContent(uri, content);

			await vscode.window.showTextDocument(uri, {
				preview: true,
				preserveFocus: true,
			});
		} catch (error) {
			console.error("Failed to show reflog diff:", error);
		}
	}

	private async _handleResetToEntry(entry: ReflogEntry) {
		const confirm = await vscode.window.showWarningMessage(
			`Reset to ${entry.hash}?`,
			"Reset",
			"Cancel"
		);

		if (confirm === "Reset") {
			void vscode.window.showInformationMessage(`Would reset to ${entry.hash}`);
		}
	}

	private _getHtmlForWebview(webview: vscode.Webview): string {
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
