import { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import styles from "./reflog.module.css";

interface ReflogEntry {
	hash: string;
	selector: string;
	message: string;
	timestamp: string;
}

interface Message {
	type: string;
	entries?: ReflogEntry[];
}

interface VSCodeAPI {
	postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

const vscode = acquireVsCodeApi();

function formatTimestamp(timestamp: string): string {
	try {
		const date = new Date(timestamp);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 7) {
			return date.toLocaleDateString();
		} else if (days > 0) {
			return `${days} day${days > 1 ? "s" : ""} ago`;
		} else if (hours > 0) {
			return `${hours} hour${hours > 1 ? "s" : ""} ago`;
		} else if (minutes > 0) {
			return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
		} else {
			return "just now";
		}
	} catch {
		return timestamp;
	}
}

interface ReflogEntryProps {
	entry: ReflogEntry;
	index: number;
	isSelected: boolean;
	onSelect: (index: number, shiftKey: boolean, metaKey: boolean) => void;
	onContextMenu: (index: number, event: React.MouseEvent) => void;
	onReset: (entry: ReflogEntry) => void;
}

function ReflogEntryComponent({ entry, index, isSelected, onSelect, onContextMenu, onReset }: ReflogEntryProps) {
	const handleSelectionClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onSelect(index, e.shiftKey, e.metaKey || e.ctrlKey);
		},
		[index, onSelect]
	);

	const handleContextMenu = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			onContextMenu(index, e);
		},
		[index, onContextMenu]
	);

	const handleReset = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onReset(entry);
		},
		[entry, onReset]
	);

	return (
		<div
			className={`${styles.reflogEntry} ${isSelected ? styles.selected : ""}`}
			onClick={handleSelectionClick}
			onContextMenu={handleContextMenu}
		>
			<div className={styles.entryContent}>
				<div className={styles.entryHeader}>
					<span className={styles.entryHash}>{entry.hash.substring(0, 7)}</span>
					<span className={styles.entrySelector}>{entry.selector}</span>
					<span className={styles.entryTimestamp}>{formatTimestamp(entry.timestamp)}</span>
				</div>
				<div className={styles.entryMessage}>{entry.message}</div>
			</div>
			<div className={styles.entryActions}>
				<button className={`${styles.btnSmall} ${styles.resetBtn}`} onClick={handleReset}>
					Reset
				</button>
			</div>
		</div>
	);
}

function App() {
	const [entries, setEntries] = useState<ReflogEntry[]>([]);
	const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
	const [firstClickIndex, setFirstClickIndex] = useState<number | null>(null);
	const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

	useEffect(() => {
		const messageHandler = (event: MessageEvent<Message>) => {
			const message = event.data;
			if (message.type === "reflogData") {
				setEntries(message.entries || []);
			}
		};

		window.addEventListener("message", messageHandler);
		return () => window.removeEventListener("message", messageHandler);
	}, []);

	const handleRefresh = useCallback(() => {
		vscode.postMessage({ type: "refresh" });
	}, []);

	const handleSelectEntry = useCallback(
		(clickedIndex: number, shiftKey: boolean, metaKey: boolean) => {
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
				setSelectedIndices(newSelectedIndices);

				if (newSelectedIndices.size === 0) {
					setFirstClickIndex(null);
				} else if (!firstClickIndex) {
					setFirstClickIndex(clickedIndex);
				}
			} else {
				setFirstClickIndex(clickedIndex);
				setSelectedIndices(new Set([clickedIndex]));
			}
		},
		[entries, firstClickIndex, selectedIndices]
	);

	const handleReset = useCallback((entry: ReflogEntry) => {
		vscode.postMessage({ type: "resetToEntry", entry });
	}, []);

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

	const handleContextMenu = useCallback(
		(_index: number, event: React.MouseEvent) => {
			if (selectedIndices.size > 1) {
				setContextMenu({ x: event.clientX, y: event.clientY });
			}
		},
		[selectedIndices]
	);

	const handleSquash = useCallback(() => {
		const selectedEntries = Array.from(selectedIndices)
			.sort((a, b) => a - b)
			.map((i) => entries[i]);

		vscode.postMessage({
			type: "squashCommits",
			entries: selectedEntries,
		});

		setContextMenu(null);
		setSelectedIndices(new Set());
	}, [selectedIndices, entries]);

	useEffect(() => {
		if (contextMenu) {
			const handleEscape = (e: KeyboardEvent) => {
				if (e.key === "Escape") {
					setContextMenu(null);
				}
			};

			const handleClickOutside = (e: MouseEvent) => {
				const target = e.target as HTMLElement;
				if (!target.closest(`.${styles.contextMenu}`)) {
					setContextMenu(null);
				}
			};

			const timeoutId = setTimeout(() => {
				window.addEventListener("mousedown", handleClickOutside);
			}, 0);

			window.addEventListener("keydown", handleEscape);

			return () => {
				clearTimeout(timeoutId);
				window.removeEventListener("mousedown", handleClickOutside);
				window.removeEventListener("keydown", handleEscape);
			};
		}
	}, [contextMenu]);

	return (
		<div className={styles.app}>
			<div className={styles.toolbar}>
				<button className={styles.btn} onClick={handleRefresh}>
					Refresh
				</button>
			</div>
			<div className={styles.container}>
				{entries.length === 0 ? (
					<p className={styles.loading}>Loading reflog...</p>
				) : (
					<div className={styles.reflogList}>
						{entries.map((entry, index) => (
							<ReflogEntryComponent
								key={`${entry.hash}-${index}`}
								entry={entry}
								index={index}
								isSelected={selectedIndices.has(index)}
								onSelect={handleSelectEntry}
								onContextMenu={handleContextMenu}
								onReset={handleReset}
							/>
						))}
					</div>
				)}
			</div>
			{contextMenu && (
				<div
					className={styles.contextMenu}
					style={{ top: contextMenu.y, left: contextMenu.x }}
					onClick={(e) => e.stopPropagation()}
				>
					{isContiguous(selectedIndices) ? (
						<button className={styles.contextMenuItem} onClick={handleSquash}>
							Squash {selectedIndices.size} commits
						</button>
					) : (
						<div className={styles.contextMenuDisabled}>
							Squash only works on contiguous commits
						</div>
					)}
				</div>
			)}
		</div>
	);
}

const root = createRoot(document.getElementById("app")!);
root.render(<App />);
