import * as vscode from "vscode";
import type { Repository } from "../types/git";

class CommitDiffProvider implements vscode.TextDocumentContentProvider {
	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	readonly onDidChange = this._onDidChange.event;
	private currentContent: string = "";

	provideTextDocumentContent(_uri: vscode.Uri): string {
		return this.currentContent;
	}

	updateContent(content: string, uri: vscode.Uri): void {
		this.currentContent = content;
		this._onDidChange.fire(uri);
	}
}

export class CommitsViewProvider implements vscode.TreeDataProvider<CommitItem> {
	private _onDidChangeTreeData = new vscode.EventEmitter<CommitItem | undefined | null | void>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	private diffProvider: CommitDiffProvider;
	private commitOrder: string[] = [];

	constructor(private context: vscode.ExtensionContext) {
		this.diffProvider = new CommitDiffProvider();
		context.subscriptions.push(
			vscode.workspace.registerTextDocumentContentProvider("commity-diff", this.diffProvider)
		);
	}

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: CommitItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: CommitItem): Promise<CommitItem[]> {
		if (element) {
			return [];
		}

		const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;
		const git = gitExtension?.getAPI(1);

		if (!git || git.repositories.length === 0) {
			return [];
		}

		const repository = this.getActiveRepository(git.repositories);

		if (!repository) {
			return [];
		}

		const commits = await this.getRecentCommits(repository);

		const commitItems = commits.map(
			(commit) =>
				new CommitItem(
					commit.hash,
					commit.message,
					commit.author,
					commit.hash,
					vscode.TreeItemCollapsibleState.None,
					repository
				)
		);

		this.commitOrder = commitItems.map((item) => item.hash);

		return commitItems;
	}

	areCommitsContiguous(selection: readonly CommitItem[]): boolean {
		if (selection.length === 0) {
			return false;
		}

		if (selection.length === 1) {
			return true;
		}

		return this.isSelectionContiguous(selection);
	}

	private getActiveRepository(repositories: Repository[]): Repository | undefined {
		const activeEditor = vscode.window.activeTextEditor;

		if (activeEditor) {
			const activeFilePath = activeEditor.document.uri.fsPath;
			const repo = repositories.find((repo) => activeFilePath.startsWith(repo.rootUri.fsPath));
			if (repo) {
				return repo;
			}
		}

		return repositories[0];
	}

	private async getRecentCommits(
		repository: Repository
	): Promise<Array<{ author: string; hash: string; message: string }>> {
		try {
			const log = repository.state.HEAD?.commit ? await repository.log({ maxEntries: 20 }) : [];

			return log.map((commit) => ({
				author: commit.authorName || "",
				hash: commit.hash.substring(0, 7),
				message: commit.message.split("\n")[0],
			}));
		} catch {
			return [];
		}
	}

	async showCommitDiff(
		commits: readonly CommitItem[] | CommitItem,
		options?: { preserveFocus?: boolean }
	): Promise<void> {
		const commitArray = Array.isArray(commits) ? commits : [commits];

		if (commitArray.length === 0) {
			vscode.window.showWarningMessage("No commits selected");
			return;
		}

		try {
			const diff = await this.getCommitDiff(
				commitArray[0].repository,
				commitArray.map((c) => c.hash)
			);
			const uri = vscode.Uri.parse("commity-diff:Commity Diff.diff");

			this.diffProvider.updateContent(diff, uri);

			const doc = await vscode.workspace.openTextDocument(uri);

			await vscode.window.showTextDocument(doc, {
				preview: false,
				viewColumn: vscode.ViewColumn.Two,
				preserveFocus: options?.preserveFocus ?? false,
			});
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to show diff: ${error}`);
		}
	}

	private async getCommitDiff(repository: Repository, hashes: string[]): Promise<string> {
		const workingDir = repository.rootUri.fsPath;
		try {
			const { execFile } = await import("node:child_process");
			const { promisify } = await import("node:util");
			const execFileAsync = promisify(execFile);

			const diffs: string[] = [];
			for (const hash of hashes) {
				const { stdout } = await execFileAsync("git", ["show", hash], { cwd: workingDir });
				diffs.push(stdout);
			}

			return hashes.length === 1 ? diffs[0] : diffs.join("\n\n" + "=".repeat(80) + "\n\n");
		} catch (error) {
			return `Failed to generate diff: ${error}`;
		}
	}

	private isSelectionContiguous(selection: readonly CommitItem[]): boolean {
		if (selection.length < 2 || this.commitOrder.length === 0) {
			return false;
		}

		const indices = selection
			.map((item) => this.commitOrder.indexOf(item.hash))
			.filter((idx) => idx !== -1)
			.sort((a, b) => a - b);

		if (indices.length !== selection.length) {
			return false;
		}

		for (let i = 1; i < indices.length; i += 1) {
			if (indices[i] - indices[i - 1] !== 1) {
				return false;
			}
		}

		return true;
	}
}

export class CommitItem extends vscode.TreeItem {
	constructor(
		public readonly hash: string,
		public readonly message: string,
		public readonly author: string,
		public readonly id: string,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
		public readonly repository: Repository
	) {
		const initials = author
			.split(" ")
			.map((name) => name[0])
			.join("");
		super(`${hash.substring(0, 7)} • ${initials} • ${message}`, collapsibleState);

		this.tooltip = `${message} -${hash}`;
		this.contextValue = "commit";
	}
}
