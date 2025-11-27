import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import type { Commit, Repository } from "../types/git";
import {
	type ReflogEntry,
	performSoftResetSquash,
	performRebaseSquash,
	getCurrentAuthor,
	getCurrentBranch,
} from "../services/git";
import { getFireworksProvider } from "../services/ai-providers/fireworks";
import type { SquashMessageRequest } from "../types/ai";

interface PendingSquash {
	repository: Repository;
	entries: ReflogEntry[];
	isHead: boolean;
}

export class SquashEditorPanel {
	private static instance?: SquashEditorPanel;
	private panel?: vscode.WebviewPanel;
	private pendingSquash?: PendingSquash;
	private squashEmitter = new vscode.EventEmitter<void>();
	readonly onDidSquash = this.squashEmitter.event;

	constructor(private readonly extensionUri: vscode.Uri) {}

	static getInstance(extensionUri: vscode.Uri): SquashEditorPanel {
		if (!SquashEditorPanel.instance) {
			SquashEditorPanel.instance = new SquashEditorPanel(extensionUri);
		}

		return SquashEditorPanel.instance;
	}

	show(repository: Repository, entries: ReflogEntry[], isHead: boolean) {
		this.pendingSquash = { repository, entries, isHead };

		if (this.panel) {
			this.panel.reveal();
			this.sendInitData(entries);

			return;
		}

		this.panel = vscode.window.createWebviewPanel(
			"commity.squashEditor",
			"Squash Commits",
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				localResourceRoots: [this.extensionUri],
			}
		);

		this.panel.iconPath = {
			light: vscode.Uri.joinPath(this.extensionUri, "media", "icons", "commity-logo-light.svg"),
			dark: vscode.Uri.joinPath(this.extensionUri, "media", "icons", "commity-logo-dark.svg"),
		};

		this.panel.webview.html = this.getHtml(this.panel.webview);

		this.panel.webview.onDidReceiveMessage(async (message) => {
			switch (message.type) {
				case "ready":
					if (this.pendingSquash) {
						this.sendInitData(this.pendingSquash.entries);
					}

					break;
				case "squash":
					await this.executeSquash(message.message);

					this.panel?.dispose();
					break;
				case "generateSquashMessage":
					await this.generateSquashMessage(message.data.commits);
					break;
				case "cancel":
					this.panel?.dispose();
					break;
			}
		});

		this.panel.onDidDispose(() => {
			this.panel = undefined;
			this.pendingSquash = undefined;
		});
	}

	private sendInitData(entries: ReflogEntry[]) {
		this.panel?.webview.postMessage({
			type: "init",
			data: {
				commitCount: entries.length,
				defaultMessage: entries.map((e) => e.message).join("\n\n"),
				commits: entries.map((e) => ({ hash: e.hash, message: e.message })),
			},
		});
	}

	private async generateSquashMessage(commits: Commit[]) {
		const client = getFireworksProvider();
		const repository = this.pendingSquash?.repository;

		const request: SquashMessageRequest = {
			commits: commits.map((c) => ({ hash: c.hash, message: c.message })),
			branch: repository ? getCurrentBranch(repository) : "",
			author: getCurrentAuthor(),
		};

		let message = "";

		try {
			for await (const chunk of client.streamSquashMessage(request)) {
				message += chunk;
				this.panel?.webview.postMessage({
					type: "squashMessageChunk",
					data: { chunk, message },
				});
			}

			this.panel?.webview.postMessage({
				type: "squashMessageComplete",
				data: { message },
			});
		} catch (error) {
			console.error("Failed to generate squash message:", error);
			this.panel?.webview.postMessage({
				type: "squashMessageError",
				data: { error: error instanceof Error ? error.message : "Unknown error" },
			});
		}
	}

	private async executeSquash(customMessage: string) {
		if (!this.pendingSquash) {
			return;
		}

		const { repository, entries, isHead } = this.pendingSquash;
		const oldest = entries[entries.length - 1];
		const hashes = entries.map((e) => e.hash);

		try {
			if (isHead) {
				await performSoftResetSquash({
					repository,
					oldestCommitHash: oldest.hash,
					message: customMessage,
				});
			} else {
				await performRebaseSquash({
					repository,
					commitHashes: hashes,
					message: customMessage,
				});
			}

			vscode.window.showInformationMessage("Commits squashed successfully");
			this.squashEmitter.fire();
		} catch (error) {
			console.error("Failed to squash commits:", error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Failed to squash commits: ${errorMessage}`);
		}
	}

	private getHtml(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "out", "webview", "squash-editor", "index.js")
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "out", "webview", "squash-editor", "index.css")
		);

		const nonce = randomBytes(16).toString("base64url");

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
				<link href="${styleUri}" rel="stylesheet">
				<title>Squash Commits</title>
				<style>
					body {
						padding: 0;
						margin: 0;
						font-family: var(--vscode-font-family);
						font-size: var(--vscode-font-size);
						color: var(--vscode-foreground);
						background-color: var(--vscode-editor-background);
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
