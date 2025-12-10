import * as vscode from "vscode";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Repository, StatusLetter } from "../types/git";
import { Status, type Change } from "../types/git";

const execFileAsync = promisify(execFile);

interface FileChange {
	path: string;
	status: StatusLetter;
	additions: number;
	deletions: number;
}

interface ConflictFile {
	path: string;
}

type RiskLevel = "low" | "medium" | "high";
type SizeLevel = "small" | "medium" | "large" | "huge";

interface AdvisorMessage {
	id: string;
	level: "info" | "warning" | "danger";
	text: string;
}

interface ComplexitySummary {
	sizeLevel: SizeLevel;
	riskLevel: RiskLevel;
	totalFiles: number;
	totalAdditions: number;
	totalDeletions: number;
	directoryCount: number;
	fileTypeCount: number;
	messages: AdvisorMessage[];
}

interface WorkingChangesData {
	staged: {
		count: number;
		additions: number;
		deletions: number;
		files: FileChange[];
	};
	modified: {
		count: number;
		additions: number;
		deletions: number;
		files: FileChange[];
	};
	untracked: {
		count: number;
		files: FileChange[];
	};
	conflicts: ConflictFile[];
	complexity?: ComplexitySummary;
}

export class WorkingChangesWebviewProvider implements vscode.WebviewViewProvider {
	public static readonly viewType = "commity.workingChangesView";
	private view?: vscode.WebviewView;
	private stateChangeDisposable?: vscode.Disposable;
	private fileWatcher?: vscode.FileSystemWatcher;
	private updateTimeout?: NodeJS.Timeout;

	constructor(private readonly extensionUri: vscode.Uri) {}

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
			if (message.type === "webviewLoaded" || message.type === "refresh") {
				await this.updateWorkingChanges();
			} else if (message.type === "viewAllChanges") {
				await this.handleViewAllChanges();
			} else if (message.type === "openFileDiff") {
				await this.handleOpenFileDiff(message.path, message.isStaged);
			} else if (message.type === "openMergeEditor") {
				await this.handleOpenMergeEditor(message.path);
			} else if (message.type === "openSourceControl") {
				await vscode.commands.executeCommand("workbench.view.scm");
			} else if (message.type === "generateAndCommit") {
				await this.handleGenerateAndCommit();
			} else if (message.type === "stageFile") {
				await this.handleStageFile(message.path);
			} else if (message.type === "unstageFile") {
				await this.handleUnstageFile(message.path);
			}
		});

		webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

		// Subscribe to git state changes and file system changes
		this.subscribeToGitChanges();
		this.subscribeToFileChanges();

		// Clean up when view is disposed
		webviewView.onDidDispose(() => {
			this.stateChangeDisposable?.dispose();
			this.fileWatcher?.dispose();
			if (this.updateTimeout) {
				clearTimeout(this.updateTimeout);
			}
		});
	}

	private subscribeToGitChanges() {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			return;
		}

		// Subscribe to state changes on all repositories
		const disposables: vscode.Disposable[] = [];
		for (const repo of git.repositories) {
			disposables.push(
				repo.state.onDidChange(() => {
					this.debouncedUpdate();
				})
			);
		}

		this.stateChangeDisposable = vscode.Disposable.from(...disposables);
	}

	private subscribeToFileChanges() {
		this.fileWatcher = vscode.workspace.createFileSystemWatcher("**/*");
		this.fileWatcher.onDidChange(() => this.debouncedUpdate());
		this.fileWatcher.onDidCreate(() => this.debouncedUpdate());
		this.fileWatcher.onDidDelete(() => this.debouncedUpdate());
	}

	private debouncedUpdate() {
		if (this.updateTimeout) {
			clearTimeout(this.updateTimeout);
		}
		this.updateTimeout = setTimeout(() => {
			void this.updateWorkingChanges();
		}, 150);
	}

	public refresh() {
		void this.updateWorkingChanges();
	}

	private async handleViewAllChanges() {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			return;
		}

		const repository = this.getPrimaryRepository(git.repositories);
		if (!repository) {
			return;
		}

		// Use VS Code's built-in git.viewChanges command to open the multi-diff editor
		await vscode.commands.executeCommand("git.viewChanges", repository);
	}

	private async handleOpenFileDiff(filePath: string, isStaged: boolean) {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			return;
		}

		const repository = this.getPrimaryRepository(git.repositories);
		if (!repository) {
			return;
		}

		const fileUri = vscode.Uri.joinPath(repository.rootUri, filePath);

		if (isStaged) {
			// Open staged diff (HEAD vs index)
			await vscode.commands.executeCommand("git.openChange", fileUri);
		} else {
			// Open unstaged diff (index vs working tree)
			await vscode.commands.executeCommand("git.openChange", fileUri);
		}
	}

	private async handleOpenMergeEditor(filePath: string) {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			return;
		}

		const repository = this.getPrimaryRepository(git.repositories);
		if (!repository) {
			return;
		}

		const fileUri = vscode.Uri.joinPath(repository.rootUri, filePath);
		await vscode.commands.executeCommand("git.openMergeEditor", fileUri);
	}

	private async handleGenerateAndCommit() {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			vscode.window.showWarningMessage("No Git repository found");
			return;
		}

		const repository = this.getPrimaryRepository(git.repositories);
		if (!repository) {
			vscode.window.showWarningMessage("No Git repository found");
			return;
		}

		const repoWithSCM = repository as Repository & { sourceControl?: vscode.SourceControl };
		await vscode.commands.executeCommand("commity.generateCommitMessage", repoWithSCM.sourceControl ?? { rootUri: repository.rootUri });
		await vscode.commands.executeCommand("workbench.view.scm");
	}

	private async handleStageFile(filePath: string) {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			return;
		}

		const repository = this.getPrimaryRepository(git.repositories);
		if (!repository) {
			return;
		}

		try {
			const absolutePath = vscode.Uri.joinPath(repository.rootUri, filePath).fsPath;
			await repository.add?.([absolutePath]);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to stage file: ${error}`);
		}
	}

	private async handleUnstageFile(filePath: string) {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			return;
		}

		const repository = this.getPrimaryRepository(git.repositories);
		if (!repository) {
			return;
		}

		try {
			const absolutePath = vscode.Uri.joinPath(repository.rootUri, filePath).fsPath;
			await repository.revert?.([absolutePath]);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to unstage file: ${error}`);
		}
	}

	private async updateWorkingChanges() {
		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			this.view?.webview.postMessage({
				type: "workingChangesData",
				data: null,
			});
			return;
		}

		const repository = this.getPrimaryRepository(git.repositories);
		if (!repository) {
			this.view?.webview.postMessage({
				type: "workingChangesData",
				data: null,
			});
			return;
		}

		const staged = repository.state.indexChanges;
		const modified = repository.state.workingTreeChanges;
		const untracked = repository.state.untrackedChanges;
		const mergeChanges = repository.state.mergeChanges;

		// Get line stats for staged and modified files
		const cwd = repository.rootUri.fsPath;
		let stagedFileStats: Map<string, { additions: number; deletions: number }> = new Map();
		let modifiedFileStats: Map<string, { additions: number; deletions: number }> = new Map();

		try {
			// Get stats for staged changes
			if (staged.length > 0) {
				const { stdout } = await execFileAsync(
					"git",
					["diff", "--cached", "--numstat"],
					{ cwd, maxBuffer: 10 * 1024 * 1024 }
				);
				stagedFileStats = this.parseNumstatPerFile(stdout);
			}

			// Get stats for unstaged changes
			if (modified.length > 0) {
				const { stdout } = await execFileAsync(
					"git",
					["diff", "--numstat"],
					{ cwd, maxBuffer: 10 * 1024 * 1024 }
				);
				modifiedFileStats = this.parseNumstatPerFile(stdout);
			}
		} catch (error) {
			console.error("Failed to get diff stats:", error);
		}

		const stagedFiles = this.buildFileList(staged, cwd, stagedFileStats);
		const modifiedFiles = this.buildFileList(modified, cwd, modifiedFileStats);
		const untrackedFiles: FileChange[] = untracked.map((change) => ({
			path: this.getRelativePath(change.uri.fsPath, cwd),
			status: "U",
			additions: 0,
			deletions: 0,
		}));

		const stagedTotals = this.sumStats(stagedFileStats);
		const modifiedTotals = this.sumStats(modifiedFileStats);

		const conflictFiles: ConflictFile[] = mergeChanges.map((change) => ({
			path: this.getRelativePath(change.uri.fsPath, cwd),
		}));

		const allFiles = [...stagedFiles, ...modifiedFiles];
		const complexity = allFiles.length > 0 ? this.computeComplexity(allFiles) : undefined;

		const data: WorkingChangesData = {
			staged: {
				count: staged.length,
				additions: stagedTotals.additions,
				deletions: stagedTotals.deletions,
				files: stagedFiles,
			},
			modified: {
				count: modified.length,
				additions: modifiedTotals.additions,
				deletions: modifiedTotals.deletions,
				files: modifiedFiles,
			},
			untracked: {
				count: untracked.length,
				files: untrackedFiles,
			},
			conflicts: conflictFiles,
			complexity,
		};

		this.view?.webview.postMessage({
			type: "workingChangesData",
			data,
		});
	}

	private parseNumstatPerFile(stdout: string): Map<string, { additions: number; deletions: number }> {
		const result = new Map<string, { additions: number; deletions: number }>();

		for (const line of stdout.split("\n")) {
			if (!line.trim()) continue;
			const parts = line.split("\t");
			if (parts.length >= 3) {
				const additions = parts[0] === "-" ? 0 : parseInt(parts[0], 10);
				const deletions = parts[1] === "-" ? 0 : parseInt(parts[1], 10);
				const filePath = parts[2];
				if (!isNaN(additions) && !isNaN(deletions) && filePath) {
					result.set(filePath, { additions, deletions });
				}
			}
		}

		return result;
	}

	private sumStats(stats: Map<string, { additions: number; deletions: number }>): { additions: number; deletions: number } {
		let additions = 0;
		let deletions = 0;
		for (const stat of stats.values()) {
			additions += stat.additions;
			deletions += stat.deletions;
		}
		return { additions, deletions };
	}

	private buildFileList(
		changes: Change[],
		cwd: string,
		stats: Map<string, { additions: number; deletions: number }>
	): FileChange[] {
		return changes.map((change) => {
			const relativePath = this.getRelativePath(change.uri.fsPath, cwd);
			const fileStat = stats.get(relativePath) ?? { additions: 0, deletions: 0 };
			return {
				path: relativePath,
				status: this.getStatusLetter(change.status),
				additions: fileStat.additions,
				deletions: fileStat.deletions,
			};
		});
	}

	private getRelativePath(absolutePath: string, cwd: string): string {
		if (absolutePath.startsWith(cwd)) {
			return absolutePath.slice(cwd.length + 1);
		}
		return absolutePath;
	}

	private getStatusLetter(status: Status): StatusLetter {
		switch (status) {
			case Status.INDEX_ADDED:
				return "A";
			case Status.INDEX_MODIFIED:
			case Status.MODIFIED:
				return "M";
			case Status.INDEX_DELETED:
			case Status.DELETED:
				return "D";
			case Status.INDEX_RENAMED:
				return "R";
			case Status.INDEX_COPIED:
				return "C";
			case Status.UNTRACKED:
				return "U";
			default:
				return "?";
		}
	}

	private computeComplexity(allFiles: FileChange[]): ComplexitySummary {
		const totalFiles = allFiles.length;
		const totalAdditions = allFiles.reduce((sum, f) => sum + f.additions, 0);
		const totalDeletions = allFiles.reduce((sum, f) => sum + f.deletions, 0);
		const linesChanged = totalAdditions + totalDeletions;

		const directories = new Set(allFiles.map((f) => this.getDirectoryKey(f.path)));
		const directoryCount = directories.size;

		const fileTypes = new Set(allFiles.map((f) => this.getFileType(f.path)));
		const fileTypeCount = fileTypes.size;

		const sizeLevel: SizeLevel =
			linesChanged < 100 ? "small" :
			linesChanged < 400 ? "medium" :
			linesChanged < 1000 ? "large" : "huge";

		const lineScore = linesChanged < 100 ? 0 : linesChanged < 300 ? 1 : linesChanged < 800 ? 2 : 3;
		const fileScore = totalFiles <= 5 ? 0 : totalFiles <= 15 ? 1 : 2;
		const dirScore = directoryCount <= 3 ? 0 : directoryCount <= 8 ? 1 : 2;
		const typeScore = fileTypeCount <= 2 ? 0 : 1;
		const baseComplexity = lineScore + fileScore + dirScore + typeScore;

		const riskLevel: RiskLevel =
			baseComplexity <= 2 ? "low" :
			baseComplexity <= 5 ? "medium" : "high";

		const messages: AdvisorMessage[] = [];

		if (linesChanged >= 500) {
			messages.push({
				id: "large-lines",
				level: "warning",
				text: `${linesChanged} lines changed — consider splitting this commit`,
			});
		}

		if (directoryCount >= 8) {
			messages.push({
				id: "wide-dirs",
				level: "warning",
				text: `${directoryCount} directories touched — wide surface area`,
			});
		}

		if (fileTypeCount >= 4) {
			messages.push({
				id: "mixed-types",
				level: "info",
				text: `Changes span ${fileTypeCount} file types`,
			});
		}

		if (totalFiles >= 20) {
			messages.push({
				id: "many-files",
				level: "warning",
				text: `${totalFiles} files changed — consider atomic commits`,
			});
		}

		return {
			sizeLevel,
			riskLevel,
			totalFiles,
			totalAdditions,
			totalDeletions,
			directoryCount,
			fileTypeCount,
			messages,
		};
	}

	private getDirectoryKey(path: string): string {
		const parts = path.split("/");
		if (parts.length >= 2) {
			return `${parts[0]}/${parts[1]}`;
		}
		return parts[0] ?? ".";
	}

	private getFileType(path: string): string {
		const idx = path.lastIndexOf(".");
		if (idx === -1) {
			return "other";
		}
		const ext = path.slice(idx + 1).toLowerCase();
		if (["ts", "tsx"].includes(ext)) {
			return "ts";
		}
		if (["js", "jsx", "mjs", "cjs"].includes(ext)) {
			return "js";
		}
		if (["css", "scss", "less", "sass"].includes(ext)) {
			return "style";
		}
		if (["md", "mdx", "rst", "txt"].includes(ext)) {
			return "docs";
		}
		if (["json", "yaml", "yml", "toml"].includes(ext)) {
			return "config";
		}
		if (["test.ts", "test.tsx", "spec.ts", "spec.tsx"].some((s) => path.endsWith(s))) {
			return "test";
		}
		return ext;
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

	private getHtmlForWebview(webview: vscode.Webview): string {
		const scriptUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "out", "webview", "working-changes", "index.js")
		);
		const styleUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "out", "webview", "working-changes", "index.css")
		);
		const codiconsUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "out", "codicons", "codicon.css")
		);
		const commityLogoDarkUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "media", "icons", "commity-logo-dark.svg")
		);
		const commityLogoLightUri = webview.asWebviewUri(
			vscode.Uri.joinPath(this.extensionUri, "media", "icons", "commity-logo-light.svg")
		);

		const nonce = getNonce();

		return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
				<link href="${codiconsUri}" rel="stylesheet">
				<link href="${styleUri}" rel="stylesheet">
				<title>Working Changes</title>
				<style>
					html, body, #app {
						height: 100vh;
						padding: 0;
						margin: 0;
						font-family: var(--vscode-font-family);
						font-size: var(--vscode-font-size);
						color: var(--vscode-foreground);
						background-color: var(--vscode-sideBar-background);
						overflow: hidden;
					}
				</style>
			</head>
			<body>
				<div id="app" data-commity-logo-dark="${commityLogoDarkUri}" data-commity-logo-light="${commityLogoLightUri}"></div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
	}
}

function getNonce(): string {
	return randomBytes(16).toString("base64url");
}
