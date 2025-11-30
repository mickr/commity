import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import type { Commit, Repository } from "../types/git";
import {
	type ReflogEntry,
	performSoftResetSquash,
	performRebaseSquash,
	performAmendCommit,
	getCurrentAuthor,
	getCurrentBranch,
} from "../services/git";
import { getFireworksProvider } from "../services/ai-providers/fireworks";
import type { SquashMessageRequest } from "../types/ai";

type EditorMode = "squash" | "amend";

interface PendingOperation {
	repository: Repository;
	entries: ReflogEntry[];
	isHead: boolean;
	mode: EditorMode;
}

export class SquashEditorPanel {
	private static instance?: SquashEditorPanel;
	private panel?: vscode.WebviewPanel;
	private pendingOperation?: PendingOperation;
	private completeEmitter = new vscode.EventEmitter<void>();
	readonly onDidComplete = this.completeEmitter.event;
	private abortController?: AbortController;

	constructor(private readonly extensionUri: vscode.Uri) {}

	static getInstance(extensionUri: vscode.Uri): SquashEditorPanel {
		if (!SquashEditorPanel.instance) {
			SquashEditorPanel.instance = new SquashEditorPanel(extensionUri);
		}

		return SquashEditorPanel.instance;
	}

	show(repository: Repository, entries: ReflogEntry[], isHead: boolean, mode: EditorMode = "squash") {
		this.pendingOperation = { repository, entries, isHead, mode };

		const title = mode === "amend" ? "Amend Commit" : "Squash Commits";

		if (this.panel) {
			this.panel.title = title;
			this.panel.reveal();
			this.sendInitData();

			return;
		}

		this.panel = vscode.window.createWebviewPanel(
			"commity.squashEditor",
			title,
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
					if (this.pendingOperation) {
						this.sendInitData();
					}

					break;
				case "submit":
					await this.executeOperation(message.message);

					this.panel?.dispose();
					break;
				case "generateMessage":
					await this.generateMessage(message.data.commits);
					break;
				case "abortGeneration":
					this.abortController?.abort();
					break;
				case "cancel":
					this.panel?.dispose();
					break;
			}
		});

		this.panel.onDidDispose(() => {
			this.panel = undefined;
			this.pendingOperation = undefined;
		});
	}

	private sendInitData() {
		if (!this.pendingOperation) {
			return;
		}

		const { entries, mode } = this.pendingOperation;

		this.panel?.webview.postMessage({
			type: "init",
			data: {
				mode,
				commitCount: entries.length,
				defaultMessage: entries.map((e) => e.message).join("\n\n"),
				commits: entries.map((e) => ({ hash: e.hash, message: e.message })),
			},
		});
	}

	private async generateMessage(commits: Commit[]) {
		const client = getFireworksProvider();
		const repository = this.pendingOperation?.repository;

		const request: SquashMessageRequest = {
			commits: commits.map((c) => ({ hash: c.hash, message: c.message })),
			branch: repository ? getCurrentBranch(repository) : "",
			author: getCurrentAuthor(),
		};

		let message = "";
		this.abortController = new AbortController();

		try {
			for await (const chunk of client.streamSquashMessage(request, this.abortController.signal)) {
				message += chunk;
				this.panel?.webview.postMessage({
					type: "messageChunk",
					data: { chunk, message },
				});
			}

			this.panel?.webview.postMessage({
				type: "messageComplete",
				data: { message },
			});
		} catch (error) {
			if (error instanceof Error && error.name === "AbortError") {
				this.panel?.webview.postMessage({
					type: "messageAborted",
					data: { message },
				});
			} else {
				console.error("Failed to generate message:", error);
				this.panel?.webview.postMessage({
					type: "messageError",
					data: { error: error instanceof Error ? error.message : "Unknown error" },
				});
			}
		} finally {
			this.abortController = undefined;
		}
	}

	private async executeOperation(customMessage: string) {
		if (!this.pendingOperation) {
			return;
		}

		const { repository, entries, isHead, mode } = this.pendingOperation;

		try {
			if (mode === "amend") {
				await performAmendCommit({
					repository,
					message: customMessage,
				});
				vscode.window.showInformationMessage("Commit amended successfully");
			} else {
				const oldest = entries[entries.length - 1];
				const hashes = entries.map((e) => e.hash);

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
			}

			this.completeEmitter.fire();
		} catch (error) {
			console.error(`Failed to ${mode} commit(s):`, error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Failed to ${mode} commit(s): ${errorMessage}`);
		}
	}

	private getHtml(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "out", "webview", "squash-editor", "index.js")
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "out", "webview", "squash-editor", "index.css")
		);
		const codiconsUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "out", "codicons", "codicon.css")
		);

		const nonce = randomBytes(16).toString("base64url");

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<link href="${styleUri}" rel="stylesheet">
				<link href="${codiconsUri}" rel="stylesheet">
				<title>Edit Commit</title>
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
