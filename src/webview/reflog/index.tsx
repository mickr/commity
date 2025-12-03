import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { createRoot } from "react-dom/client";
import styles from "../reflog.module.css";
import ReflogEntryComponent, { type ReflogEntry } from "./reflog-item";
import ContextMenu, { ContextMenuItem } from "../components/context-menu";
import { KeymapProvider } from "../components/keymap-provider";

interface FileInfo {
	name: string;
	status: string;
	additions: number;
	deletions: number;
}

interface Message {
	type: string;
	entries?: ReflogEntry[];
	branch?: string | null;
	parentBranch?: string | null;
	key?: string;
	hash?: string;
	files?: FileInfo[];
	parentHash?: string;
	isCollapsed?: boolean;
	message?: string;
}

const PROTECTED_BRANCHES = ["main", "master", "default", "develop", "production", "prod"];

interface VSCodeAPI {
	postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

const vscode = acquireVsCodeApi();

function App() {
	const [entries, setEntries] = useState<ReflogEntry[]>([]);
	const [branch, setBranch] = useState<string | null>(null);
	const [parentBranch, setParentBranch] = useState<string | null>(null);
	const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
	const [firstClickIndex, setFirstClickIndex] = useState<number | null>(null);
	const [focusedIndex, setFocusedIndex] = useState<number>(0);
	const [expandedFiles, setExpandedFiles] = useState<{
		hash: string;
		files: FileInfo[];
		parentHash?: string;
		isCollapsed?: boolean;
	} | null>(null);
	const [hideParentCommits, setHideParentCommits] = useState(true);
	const listRef = useRef<HTMLDivElement>(null);
	const appRef = useRef<HTMLDivElement>(null);

	const isProtectedBranch = branch !== null && PROTECTED_BRANCHES.includes(branch.toLowerCase());

	// Check if there are any parent commits to potentially hide
	const hasParentCommits = entries.some((e) => e.isNewCommit === false);

	// Filter entries based on hideParentCommits setting
	const visibleEntries = hideParentCommits
		? entries.filter((e) => e.isNewCommit !== false)
		: entries;

	useEffect(() => {
		const messageHandler = (event: MessageEvent<Message>) => {
			const message = event.data;
			if (message.type === "reflogData") {
				setEntries(message.entries || []);
				setBranch(message.branch ?? null);
				setParentBranch(message.parentBranch ?? null);
				setSelectedIndices(new Set());
				setFirstClickIndex(null);
				setFocusedIndex(0);
				setExpandedFiles(null);

				requestAnimationFrame(() => {
					appRef.current?.focus();
				});
			} else if (message.type === "showCommitFiles" && message.hash && message.files) {
				setExpandedFiles({
					hash: message.hash,
					files: message.files,
					parentHash: message.parentHash,
					isCollapsed: message.isCollapsed ?? false,
				});
			}
		};

		window.addEventListener("message", messageHandler);
		vscode.postMessage({ type: "webviewLoaded" });
		return () => window.removeEventListener("message", messageHandler);
	}, []);

	const handleSelectEntry = useCallback(
		(clickedIndex: number, shiftKey: boolean, metaKey: boolean) => {
			// Ensure focus stays in the webview
			appRef.current?.focus();
			setFocusedIndex(clickedIndex);
			setExpandedFiles(null); // Clear expanded files on new selection
			if (shiftKey && firstClickIndex !== null) {
				const startIndex = Math.min(firstClickIndex, clickedIndex);
				const endIndex = Math.max(firstClickIndex, clickedIndex);
				const selectedRange = entries.slice(startIndex, endIndex + 1);
				const newSelectedIndices = new Set(
					Array.from({ length: endIndex - startIndex + 1 }, (_, i) => startIndex + i)
				);

				setSelectedIndices(newSelectedIndices);

				vscode.postMessage({
					type: "selectEntries",
					entries: selectedRange,
				});
			} else if (metaKey) {
				const newSelectedIndices = new Set(selectedIndices);
				if (newSelectedIndices.has(clickedIndex)) {
					newSelectedIndices.delete(clickedIndex);
				} else {
					newSelectedIndices.add(clickedIndex);
				}

				// Check if we have > 2 items
				if (newSelectedIndices.size > 2) {
					const contiguous = isContiguous(newSelectedIndices);
					if (!contiguous) {
						// If not contiguous, restrict to max 2 items (for comparison)
						// Keep the newly clicked one and the most recently focused one (prior to this click)
						// Actually, simpler UX: Keep the clicked one and the one that was focused before
						newSelectedIndices.clear();
						newSelectedIndices.add(focusedIndex);
						newSelectedIndices.add(clickedIndex);
					}
				}

				setSelectedIndices(newSelectedIndices);

				if (newSelectedIndices.size === 0) {
					setFirstClickIndex(null);
				} else if (!firstClickIndex) {
					setFirstClickIndex(clickedIndex);
				}

				const selectedEntries = Array.from(newSelectedIndices)
					.sort((a, b) => a - b)
					.map((i) => entries[i]);

				const contiguous = isContiguous(newSelectedIndices);

				if (selectedEntries.length > 0) {
					if (contiguous) {
						vscode.postMessage({
							type: "selectEntries",
							entries: selectedEntries,
						});
					} else if (selectedEntries.length === 2) {
						vscode.postMessage({
							type: "compareEntries",
							entries: selectedEntries,
						});
					} else {
						// Should not happen with the restriction above, but good fallback
						vscode.postMessage({
							type: "selectEntry",
							entry: entries[clickedIndex],
						});
					}
				}
			} else {
				setFirstClickIndex(clickedIndex);
				setSelectedIndices(new Set([clickedIndex]));
				vscode.postMessage({
					type: "selectEntry",
					entry: entries[clickedIndex],
				});
			}
		},
		[entries, firstClickIndex, selectedIndices]
	);

	const isContiguous = useCallback((indices: Set<number>) => {
		if (indices.size <= 1) {
			return true;
		}
		const sorted = Array.from(indices).sort((a, b) => a - b);
		for (let i = 1; i < sorted.length; i++) {
			if (sorted[i] - sorted[i - 1] !== 1) {
				return false;
			}
		}
		return true;
	}, []);

	const handleSquash = useCallback(
		(interactive: boolean) => {
			const selectedEntries = Array.from(selectedIndices)
				.sort((a, b) => a - b)
				.map((i) => entries[i]);

			vscode.postMessage({
				type: interactive ? "squashCommitsInteractive" : "squashCommits",
				entries: selectedEntries,
			});

			setSelectedIndices(new Set());
		},
		[selectedIndices, entries]
	);

	const handleResetToFocused = useCallback(() => {
		const entry = entries[focusedIndex];
		if (!entry) {
			return;
		}

		vscode.postMessage({
			type: "resetToEntry",
			entry,
		});
	}, [entries, focusedIndex]);

	const handleAmendCommit = useCallback(() => {
		const entry = entries[0];
		if (!entry) {
			return;
		}

		vscode.postMessage({
			type: "amendCommit",
			entry,
		});
	}, [entries]);

	const handleUndoLastCommit = useCallback(() => {
		const entry = entries[0];
		if (!entry) {
			return;
		}

		vscode.postMessage({
			type: "undoLastCommit",
			entry,
		});
	}, [entries]);

	const handleRevertCommit = useCallback(() => {
		const entry = entries[focusedIndex];
		if (!entry) {
			return;
		}

		vscode.postMessage({
			type: "revertCommit",
			entry,
		});
	}, [entries, focusedIndex]);

	const handleCheckoutEntry = useCallback((entry: ReflogEntry) => {
		vscode.postMessage({
			type: "checkoutCommit",
			entry,
		});
	}, []);

	const handleCherryPickEntry = useCallback((entry: ReflogEntry) => {
		vscode.postMessage({
			type: "cherryPickCommit",
			entry,
		});
	}, []);

	const handleOpenFileDiff = useCallback(
		(file: string) => {
			if (expandedFiles) {
				vscode.postMessage({
					type: "openDiff",
					file,
					hash: expandedFiles.hash,
					parentHash: expandedFiles.parentHash,
				});
			}
		},
		[expandedFiles]
	);

	const handleToggleFiles = useCallback(
		(entry: ReflogEntry) => {
			if (expandedFiles && expandedFiles.hash === entry.hash) {
				setExpandedFiles({
					...expandedFiles,
					isCollapsed: !expandedFiles.isCollapsed,
				});
			} else {
				vscode.postMessage({
					type: "requestCommitFiles",
					entry,
				});
			}
		},
		[expandedFiles]
	);

	const handleKeyboardToggle = useCallback(
		(index: number) => {
			const entry = entries[index];
			if (entry) {
				handleToggleFiles(entry);
			}
		},
		[entries, handleToggleFiles]
	);

	return (
		<KeymapProvider
			itemCount={entries.length}
			focusedIndex={focusedIndex}
			setFocusedIndex={setFocusedIndex}
			onSelect={(index, { shift, meta }) => handleSelectEntry(index, shift, meta)}
			onToggle={handleKeyboardToggle}
			className={styles.app}
			ref={appRef}
			tabIndex={0}
			style={{ outline: "none" }}
			onClick={() => appRef.current?.focus()}
		>
			{isProtectedBranch && (
				<div className={styles.protectedBranchWarning}>
					<svg
						width="14"
						height="14"
						viewBox="0 0 16 16"
						fill="currentColor"
						style={{ flexShrink: 0 }}
					>
						<path d="M8.893 1.5c-.183-.31-.52-.5-.887-.5s-.703.19-.886.5L.138 13.499a.98.98 0 0 0 0 1.001c.193.31.53.501.886.501h13.964c.367 0 .704-.19.877-.5a1.03 1.03 0 0 0 .01-1.002L8.893 1.5zm.133 11.497H6.987v-2.003h2.039v2.003zm0-3.004H6.987V5.987h2.039v4.006z" />
					</svg>
					<span>
						You&apos;re on <strong>{branch}</strong> — history changes will rewrite shared commits
					</span>
				</div>
			)}
			<div className={styles.container}>
				{entries.length === 0 ? (
					<p className={styles.loading}>Loading reflog...</p>
				) : (
					<div className={styles.reflogList} ref={listRef}>
						{visibleEntries.map((entry, index) => {
							// Check if we need to show the delimiter before this entry
							// Show delimiter when transitioning from new commits to inherited commits
							const prevEntry = index > 0 ? visibleEntries[index - 1] : null;
							const showDelimiter =
								prevEntry?.isNewCommit === true && entry.isNewCommit === false;

							return (
								<Fragment key={`${entry.hash}-${index}`}>
									{showDelimiter && (
										<div className={styles.branchDelimiter}>
											<div className={styles.delimiterLine} />
											<span className={styles.delimiterText}>
												Commits from parent branch
											</span>
											<div className={styles.delimiterLine} />
										</div>
									)}
									<ReflogEntryComponent
										entry={entry}
										index={index}
										isSelected={selectedIndices.has(index)}
										isFocused={index === focusedIndex}
										onSelect={handleSelectEntry}
										files={expandedFiles?.hash === entry.hash ? expandedFiles.files : undefined}
										isCollapsed={
											expandedFiles?.hash === entry.hash ? expandedFiles.isCollapsed : undefined
										}
										onOpenFile={handleOpenFileDiff}
										onToggleFiles={() => handleToggleFiles(entry)}
									/>
								</Fragment>
							);
						})}
						{hasParentCommits && (() => {
							const parentCommits = entries.filter((e) => e.isNewCommit === false);
							const previewCommits = parentCommits.slice(0, 3);
							const parentSectionId = "parent-commits-section";
							return (
								<div className={styles.parentCommitsDrawer} id={parentSectionId}>
									{hideParentCommits && (
										<button
											type="button"
											className={styles.drawerOverlay}
											onClick={() => setHideParentCommits(false)}
											aria-expanded={false}
											aria-controls={parentSectionId}
											aria-label={`Show ${parentCommits.length} commits from ${parentBranch ?? "parent branch"}`}
										>
											<div className={styles.drawerPreview}>
												{previewCommits.map((entry) => (
													<div key={entry.hash} className={styles.previewItem}>
														{entry.commitType && (
															<span className={styles.previewType}>{entry.commitType}</span>
														)}
														<span className={styles.previewMessage} title={entry.message}>
															{entry.message}
														</span>
														<span className={styles.previewHash}>{entry.hash.substring(0, 7)}</span>
													</div>
												))}
											</div>
											<div className={styles.drawerFade}>
												<span className={styles.drawerLabel}>
													<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
														<path
															d="M3 4.5L6 7.5L9 4.5"
															stroke="currentColor"
															strokeWidth="1.5"
															strokeLinecap="round"
															strokeLinejoin="round"
														/>
													</svg>
													Show {parentCommits.length} from {parentBranch ?? "parent"}
												</span>
											</div>
										</button>
									)}
									{!hideParentCommits && (
										<button
											type="button"
											className={styles.collapseToggle}
											onClick={() => setHideParentCommits(true)}
											aria-expanded={true}
											aria-controls={parentSectionId}
											aria-label={`Hide commits from ${parentBranch ?? "parent branch"}`}
										>
											<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
												<path
													d="M3 7.5L6 4.5L9 7.5"
													stroke="currentColor"
													strokeWidth="1.5"
													strokeLinecap="round"
													strokeLinejoin="round"
												/>
											</svg>
											Hide {parentBranch ?? "parent"} commits
										</button>
									)}
								</div>
							);
						})()}
					</div>
				)}
			</div>

			<ContextMenu triggerRef={listRef}>
				<>
					{focusedIndex === 0 && selectedIndices.size <= 1 && (
						<>
							<ContextMenuItem className={styles.contextMenuItem} onClick={handleAmendCommit}>
								<i className="codicon codicon-edit" />
								Amend this commit
							</ContextMenuItem>
							<ContextMenuItem className={styles.contextMenuItem} onClick={handleUndoLastCommit}>
								<i className="codicon codicon-discard" />
								Undo this commit
							</ContextMenuItem>
						</>
					)}
					{isContiguous(selectedIndices) && selectedIndices.size > 1 && (
						<>
							<ContextMenuItem
								className={styles.contextMenuItem}
								onClick={() => handleSquash(false)}
							>
								<i className="codicon codicon-fold" />
								Squash {selectedIndices.size} commits (simple)
							</ContextMenuItem>
							<ContextMenuItem
								className={styles.contextMenuItem}
								onClick={() => handleSquash(true)}
							>
								<i className="codicon codicon-fold" />
								Squash {selectedIndices.size} commits with message...
							</ContextMenuItem>
						</>
					)}
					{selectedIndices.size <= 1 && (
						<>
							<ContextMenuItem
								className={styles.contextMenuItem}
								onClick={handleCheckoutEntry.bind(null, entries[focusedIndex])}
							>
								<i className="codicon codicon-check" />
								Checkout
							</ContextMenuItem>
							<ContextMenuItem
								className={styles.contextMenuItem}
								onClick={handleCherryPickEntry.bind(null, entries[focusedIndex])}
							>
								<i className="codicon codicon-git-pull-request-create" />
								Cherry-pick
							</ContextMenuItem>
							<ContextMenuItem className={styles.contextMenuItem} onClick={handleRevertCommit}>
								<i className="codicon codicon-discard" />
								Revert
							</ContextMenuItem>
						</>
					)}
					{focusedIndex !== 0 && (
						<ContextMenuItem className={styles.contextMenuItem} onClick={handleResetToFocused}>
							<i className="codicon codicon-history" />
							Reset to {entries[focusedIndex]?.hash?.substring(0, 7)}
						</ContextMenuItem>
					)}
				</>
			</ContextMenu>
		</KeymapProvider>
	);
}

const root = createRoot(document.getElementById("app")!);

root.render(<App />);
