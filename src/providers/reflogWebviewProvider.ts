import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import type { Repository } from "../types/git";
import {
	getActualCurrentBranch,
	getReflogEntries,
	type ReflogEntry,
	performSoftResetSquash,
	performRebaseSquash,
	getHeadHash,
	ensureCleanWorkingTree,
	performUndoLastCommit,
	performReset,
	type ResetMode,
} from "../services/git";
import { GitContentProvider } from "./gitContentProvider";
import { SquashEditorPanel } from "./squashEditorPanel";

class ReflogDiffProvider implements vscode.TextDocumentContentProvider {
	private changeEmitter = new vscode.EventEmitter<vscode.Uri>();
	readonly onDidChange = this.changeEmitter.event;
	private content = new Map<string, string>();

	provideTextDocumentContent(uri: vscode.Uri): string {
		return this.content.get(uri.toString()) || "";
	}

	updateContent(uri: vscode.Uri, content: string): void {
		this.content.set(uri.toString(), content);
		this.changeEmitter.fire(uri);
	}
}

export class ReflogWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "commity.reflogView";
	private view?: vscode.WebviewView;
	private diffProvider: ReflogDiffProvider;
	private squashEditorPanel: SquashEditorPanel;

	constructor(
		private readonly extensionUri: vscode.Uri,
		context: vscode.ExtensionContext
	) {
		this.diffProvider = new ReflogDiffProvider();
		this.squashEditorPanel = SquashEditorPanel.getInstance(extensionUri);
		this.squashEditorPanel.onDidComplete(() => this.refresh());
		context.subscriptions.push(
			vscode.workspace.registerTextDocumentContentProvider("commity-reflog", this.diffProvider)
		);
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		_context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		this.view = webviewView;

		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this.extensionUri],
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
		this.view?.webview.postMessage({ type: "key", key: "ArrowUp" });
	}

	public focusDown() {
		this.view?.webview.postMessage({ type: "key", key: "ArrowDown" });
	}

	public selectEntry() {
		this.view?.webview.postMessage({ type: "key", key: " " });
	}

	private async updateReflog() {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			this.view?.webview.postMessage({ type: "reflogData", entries: [], branch: null });
			return;
		}

		const primaryRepo = this.getPrimaryRepository(git.repositories);
		let branch: string | null = null;
		if (primaryRepo && this.view) {
			branch = await getActualCurrentBranch(primaryRepo);
			this.view.title = branch ? `Reflog (${branch})` : "Reflog";
		}

		const entries: ReflogEntry[] = [];
		for (const repo of git.repositories) {
			const repoEntries = await getReflogEntries(repo);
			const entriesWithRepo = repoEntries.map((e) => ({ ...e, repoRoot: repo.rootUri.fsPath }));
			entries.push(...entriesWithRepo);
		}

		this.view?.webview.postMessage({ type: "reflogData", entries, branch });
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
				await this.updateReflog();
				break;
			case "selectEntry":
				await this.handleSelectEntry(message.entry as ReflogEntry);
				break;
			case "selectEntries":
				await this.handleSelectEntries(message.entries as ReflogEntry[]);
				break;
			case "compareEntries":
				await this.handleCompareEntries(message.entries as ReflogEntry[]);
				break;
			case "requestCommitFiles":
				await this.handleRequestCommitFiles(message.entry as ReflogEntry);
				break;
			case "openDiff":
				await this.handleOpenDiff(
					message.file as string,
					message.hash as string,
					message.parentHash as string
				);
				break;
			case "resetToEntry":
				await this.handleResetToEntry(message.entry as ReflogEntry);
				break;
			case "squashCommits":
				await this.handleSquashCommits(message.entries as ReflogEntry[], false);
				break;
			case "squashCommitsInteractive":
				await this.handleSquashCommits(message.entries as ReflogEntry[], true);
				break;
			case "amendCommit":
				await this.handleAmendCommit(message.entry as ReflogEntry);
				break;
			case "undoLastCommit":
				await this.handleUndoLastCommit(message.entry as ReflogEntry);
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

			const [nameStatusResult, numstatResult] = await Promise.all([
				execFileAsync("git", ["show", "--name-status", "--format=", entry.hash], {
					cwd,
					maxBuffer: 10 * 1024 * 1024,
				}),
				execFileAsync("git", ["show", "--numstat", "--format=", entry.hash], {
					cwd,
					maxBuffer: 10 * 1024 * 1024,
				}),
			]);

			const statusMap = new Map<string, string>();
			nameStatusResult.stdout
				.split("\n")
				.filter((line) => line.trim())
				.forEach((line) => {
					const match = line.match(/^([AMDRC])\t(.+)$/);
					if (match) {
						statusMap.set(match[2], match[1]);
					}
				});

			const statsMap = new Map<string, { additions: number; deletions: number }>();
			numstatResult.stdout
				.split("\n")
				.filter((line) => line.trim())
				.forEach((line) => {
					const parts = line.split("\t");
					if (parts.length >= 3) {
						const additions = parts[0] === "-" ? 0 : parseInt(parts[0], 10);
						const deletions = parts[1] === "-" ? 0 : parseInt(parts[1], 10);
						const filename = parts[2];
						statsMap.set(filename, { additions, deletions });
					}
				});

			const files = Array.from(statusMap.keys()).map((filename) => ({
				name: filename,
				status: statusMap.get(filename) || "M",
				additions: statsMap.get(filename)?.additions ?? 0,
				deletions: statsMap.get(filename)?.deletions ?? 0,
			}));

			this.view?.webview.postMessage({
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

				this.diffProvider.updateContent(uri, content);

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

				this.diffProvider.updateContent(uri, content);

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

				this.diffProvider.updateContent(uri, content);

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
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			void vscode.window.showErrorMessage("No Git repository found");
			return;
		}

		const repository = entry.repoRoot
			? git.repositories.find((r: Repository) => r.rootUri.fsPath === entry.repoRoot)
			: git.repositories[0];

		if (!repository) {
			void vscode.window.showErrorMessage("Repository not found");
			return;
		}

		const modeChoice = await vscode.window.showQuickPick(
			[
				{
					label: "Soft Reset",
					description: "Keep all changes staged",
					detail: "Moves HEAD to the target commit, keeps your changes in the staging area",
					mode: "soft" as ResetMode,
				},
				{
					label: "Mixed Reset",
					description: "Keep changes unstaged (default)",
					detail: "Moves HEAD to the target commit, keeps your changes as unstaged modifications",
					mode: "mixed" as ResetMode,
				},
				{
					label: "Hard Reset",
					description: "⚠️ Discard all changes",
					detail: "Moves HEAD to the target commit and discards all uncommitted changes. This cannot be undone!",
					mode: "hard" as ResetMode,
				},
			],
			{
				title: `Reset to ${entry.hash.substring(0, 7)}`,
				placeHolder: "Choose reset mode",
			}
		);

		if (!modeChoice) {
			return;
		}

		const shortHash = entry.hash.substring(0, 7);
		let confirmMessage: string;
		let confirmButton: string;

		if (modeChoice.mode === "hard") {
			confirmMessage = `⚠️ Hard reset to ${shortHash}?\n\nThis will PERMANENTLY discard all uncommitted changes. This action cannot be undone!`;
			confirmButton = "Hard Reset (Discard Changes)";
		} else if (modeChoice.mode === "soft") {
			confirmMessage = `Soft reset to ${shortHash}?\n\nAll changes between HEAD and this commit will be kept staged.`;
			confirmButton = "Soft Reset";
		} else {
			confirmMessage = `Mixed reset to ${shortHash}?\n\nAll changes between HEAD and this commit will be kept as unstaged modifications.`;
			confirmButton = "Mixed Reset";
		}

		const confirm = await vscode.window.showWarningMessage(
			confirmMessage,
			{ modal: true },
			confirmButton,
			"Cancel"
		);

		if (confirm !== confirmButton) {
			return;
		}

		try {
			await performReset({
				repository,
				targetHash: entry.hash,
				mode: modeChoice.mode,
			});

			void vscode.window.showInformationMessage(
				`Reset to ${shortHash} (${modeChoice.mode}) successful`
			);

			await this.refresh();
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error";
			void vscode.window.showErrorMessage(`Reset failed: ${errorMessage}`);
		}
	}

	private async handleAmendCommit(entry: ReflogEntry) {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			return;
		}

		const repository = entry.repoRoot
			? git.repositories.find((r: Repository) => r.rootUri.fsPath === entry.repoRoot)
			: git.repositories[0];

		if (!repository) {
			vscode.window.showErrorMessage("Repository not found");
			return;
		}

		this.squashEditorPanel.show(repository, [entry], true, "amend");
	}

	private async handleUndoLastCommit(entry: ReflogEntry) {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			return;
		}

		const repository = entry.repoRoot
			? git.repositories.find((r: Repository) => r.rootUri.fsPath === entry.repoRoot)
			: git.repositories[0];

		if (!repository) {
			vscode.window.showErrorMessage("Repository not found");
			return;
		}

		const confirm = await vscode.window.showWarningMessage(
			`Undo commit ${entry.hash.substring(0, 7)}? Changes will remain staged.`,
			{ modal: true },
			"Undo"
		);

		if (confirm !== "Undo") {
			return;
		}

		try {
			const { undoneCommitHash } = await performUndoLastCommit({ repository });
			vscode.window.showInformationMessage(`Undid commit ${undoneCommitHash}`);
			this.refresh();
		} catch (error) {
			console.error("Failed to undo commit:", error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Failed to undo commit: ${errorMessage}`);
		}
	}

	private async handleSquashCommits(entries: ReflogEntry[], interactive: boolean) {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0 || entries.length < 2) {
			return;
		}

		const firstRepoRoot = entries[0].repoRoot;

		if (!firstRepoRoot || !entries.every((e) => e.repoRoot === firstRepoRoot)) {
			vscode.window.showErrorMessage("Cannot squash commits from different repositories");
			return;
		}

		const repository = git.repositories.find((r: Repository) => r.rootUri.fsPath === firstRepoRoot);

		if (!repository) {
			vscode.window.showErrorMessage("Repository not found");
			return;
		}

		const isClean = await ensureCleanWorkingTree(repository);

		if (!isClean) {
			vscode.window.showErrorMessage(
				"Cannot squash: you have uncommitted changes. Commit or stash them first."
			);
			return;
		}

		const newest = entries[0];
		const headHash = await getHeadHash(repository);
		const isHead = newest.hash === headHash;

		if (interactive) {
			this.squashEditorPanel.show(repository, entries, isHead);
			return;
		}

		await this.executeSimpleSquash(repository, entries, isHead);
	}

	private async executeSimpleSquash(
		repository: Repository,
		entries: ReflogEntry[],
		isHead: boolean
	) {
		const oldest = entries[entries.length - 1];
		const hashes = entries.map((e) => e.hash);
		const message = [...entries].reverse().map((e) => e.message).join("\n\n");

		const confirm = await vscode.window.showWarningMessage(
			`Are you sure you want to squash ${entries.length} commits into the oldest selected commit (${oldest.hash.substring(0, 7)})?`,
			{ modal: true },
			"Squash"
		);

		if (confirm !== "Squash") {
			return;
		}

		try {
			if (isHead) {
				await performSoftResetSquash({
					repository,
					oldestCommitHash: oldest.hash,
					message,
				});
			} else {
				await performRebaseSquash({
					repository,
					commitHashes: hashes,
					message,
				});
			}

			vscode.window.showInformationMessage("Commits squashed successfully");
			this.refresh();
		} catch (error) {
			console.error("Failed to squash commits:", error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage(`Failed to squash commits: ${errorMessage}`);
		}
	}

	private getHtmlForWebview(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "out", "webview", "reflog", "index.js")
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "out", "webview", "reflog", "index.css")
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
