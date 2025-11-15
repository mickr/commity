import * as vscode from "vscode";
import { generateCommitMessage } from "./commands/generateCommitMessage";
import { CommitsViewProvider, CommitItem } from "./providers/commitsView";
import type { Repository } from "./types/git";
import {
	ensureCleanWorkingTree,
	formatCommitRange,
	getActualCurrentBranch,
	performSoftResetSquash,
	performRebaseSquash,
	SquashError,
} from "./services/git";

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand(
		"commity.generateCommitMessage",
		(sourceControl: vscode.SourceControl) => generateCommitMessage(sourceControl, context)
	);

	const commitsViewProvider = new CommitsViewProvider(context);
	const commitsView = vscode.window.createTreeView("commity.commits", {
		treeDataProvider: commitsViewProvider,
		canSelectMany: true,
	});

	let selectionToken = 0;
	let singleSelectionTimer: NodeJS.Timeout | undefined;

	const selectionListener = commitsView.onDidChangeSelection(({ selection }) => {
		selectionToken += 1;

		if (singleSelectionTimer) {
			clearTimeout(singleSelectionTimer);
		}

		if (selection.length === 1) {
			const token = selectionToken;
			const commit = selection[0];

			singleSelectionTimer = setTimeout(() => {
				if (token === selectionToken) {
					void commitsViewProvider.showCommitDiff(commit, { preserveFocus: true });
				}
			}, 120);
		} else {
			singleSelectionTimer = undefined;
		}
	});

	const getSelection = (
		commit?: CommitItem,
		multiSelection?: readonly CommitItem[]
	): readonly CommitItem[] | undefined => {
		const selected =
			(multiSelection && multiSelection.length > 0 && multiSelection) ||
			(commitsView.selection.length > 0 && commitsView.selection) ||
			(commit ? [commit] : undefined);

		if (!selected || selected.length === 0) {
			return undefined;
		}

		return selected;
	};

	const refreshCommand = vscode.commands.registerCommand("commity.refreshCommits", () => {
		commitsViewProvider.refresh();
	});

	const showCommitDiffCommand = vscode.commands.registerCommand(
		"commity.showCommitDiff",
		(commit?: CommitItem, multiSelection?: readonly CommitItem[]) => {
			const selection = getSelection(commit, multiSelection);

			if (!selection || selection.length === 0) {
				void vscode.window.showWarningMessage("No commits selected");
				return;
			}

			void commitsViewProvider.showCommitDiff(selection);
		}
	);

	const squashCommitsCommand = vscode.commands.registerCommand(
		"commity.squashCommits",
		(commit?: CommitItem, multiSelection?: readonly CommitItem[]) =>
			handleSquashCommand({
				commit,
				multiSelection,
				interactive: false,
				getSelection,
				commitsViewProvider,
			})
	);

	const squashCommitsInteractiveCommand = vscode.commands.registerCommand(
		"commity.squashCommitsInteractive",
		(commit?: CommitItem, multiSelection?: readonly CommitItem[]) =>
			handleSquashCommand({
				commit,
				multiSelection,
				interactive: true,
				getSelection,
				commitsViewProvider,
			})
	);

	context.subscriptions.push(
		disposable,
		commitsView,
		refreshCommand,
		showCommitDiffCommand,
		squashCommitsCommand,
		squashCommitsInteractiveCommand,
		selectionListener
	);

	context.subscriptions.push({
		dispose: () => {
			if (singleSelectionTimer) {
				clearTimeout(singleSelectionTimer);
			}
		},
	});
}

export function deactivate() {}

type SelectionResolver = (
	commit?: CommitItem,
	multiSelection?: readonly CommitItem[]
) => readonly CommitItem[] | undefined;

interface SquashCommandOptions {
	commit?: CommitItem;
	multiSelection?: readonly CommitItem[];
	interactive: boolean;
	getSelection: SelectionResolver;
	commitsViewProvider: CommitsViewProvider;
}

interface SquashSelectionContext {
	orderedSelection: CommitItem[];
	repository: Repository;
	oldestCommit: CommitItem;
	newestCommit: CommitItem;
}

async function handleSquashCommand({
	commit,
	multiSelection,
	interactive,
	getSelection,
	commitsViewProvider,
}: SquashCommandOptions): Promise<void> {
	const selection = getSelection(commit, multiSelection);

	if (!selection || selection.length === 0) {
		void vscode.window.showWarningMessage("No commits selected");
		return;
	}

	const context = validateSelectionForSquash(commitsViewProvider, selection);

	if (!context) {
		return;
	}

	if (!(await ensureCleanWorkingTree(context.repository))) {
		void vscode.window.showWarningMessage(
			"Please commit or stash your current changes before squashing commits."
		);
		return;
	}

	const commitHashes = context.orderedSelection.map((c) => c.fullHash ?? c.hash);
	const shortHashes = context.orderedSelection.map((c) => c.hash);
	const commitRange = formatCommitRange(shortHashes);
	const isFromHead = commitsViewProvider.selectionStartsAtHead(context.orderedSelection);

	const currentBranch = await getActualCurrentBranch(context.repository);
	if (!currentBranch) {
		void vscode.window.showErrorMessage(
			"Cannot squash: HEAD is detached. Please checkout a branch first."
		);
		return;
	}

	const branchInfo = currentBranch ? ` on branch '${currentBranch}'` : "";
	const confirmation = await vscode.window.showWarningMessage(
		`Squash ${context.orderedSelection.length} commit(s) (${commitRange})${branchInfo}?`,
		"Squash",
		"Cancel"
	);

	if (confirmation !== "Squash") {
		return;
	}

	const message = interactive
		? await promptForCommitMessage(context.orderedSelection)
		: buildQuickSquashMessage(context.orderedSelection);

	if (!message) {
		return;
	}

	try {
		const result = isFromHead
			? await performSoftResetSquash({
					repository: context.repository,
					oldestCommitHash: context.oldestCommit.fullHash ?? context.oldestCommit.hash,
					message,
				})
			: await performRebaseSquash({
					repository: context.repository,
					commitHashes,
					message,
				});

		commitsViewProvider.refresh();

		void vscode.window.showInformationMessage(
			`Created ${result.shortCommitHash} by squashing ${context.orderedSelection.length} commit(s).`
		);
	} catch (error) {
		const detail = error instanceof SquashError && error.stderr ? `\n${error.stderr}` : "";
		const message = error instanceof Error ? error.message : String(error);
		void vscode.window.showErrorMessage(`Failed to squash commits: ${message}${detail}`);
	}
}

function validateSelectionForSquash(
	commitsViewProvider: CommitsViewProvider,
	selection: readonly CommitItem[]
): SquashSelectionContext | undefined {
	if (!commitsViewProvider.areCommitsContiguous(selection)) {
		void vscode.window.showWarningMessage("Select contiguous commits to squash");
		return undefined;
	}

	const repositories = new Set(selection.map((item) => item.repository));

	if (repositories.size !== 1) {
		void vscode.window.showWarningMessage("Select commits from the same repository");
		return undefined;
	}

	const orderedSelection = commitsViewProvider.sortSelectionByHistory(selection);

	return {
		orderedSelection,
		repository: orderedSelection[0].repository,
		oldestCommit: orderedSelection[orderedSelection.length - 1],
		newestCommit: orderedSelection[0],
	};
}

function buildQuickSquashMessage(selection: readonly CommitItem[]): string {
	const baseMessage = selection[0].message;
	if (selection.length === 1) {
		return baseMessage;
	}
	return `${baseMessage} (squashed ${selection.length} commits)`;
}

async function promptForCommitMessage(
	selection: readonly CommitItem[]
): Promise<string | undefined> {
	const defaultMessage = selection.map((commit) => `- ${commit.hash} ${commit.message}`).join("\n");

	const message = await vscode.window.showInputBox({
		value: defaultMessage,
		prompt: "Edit the squashed commit message",
		placeHolder: "Final commit message",
		ignoreFocusOut: true,
		validateInput: (value) =>
			value.trim().length === 0 ? "Commit message cannot be empty" : undefined,
	});

	return message;
}
