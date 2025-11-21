import { useEffect, useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import styles from "../reflog.module.css";
import ReflogEntryComponent, { type ReflogEntry } from "./reflog-item";

interface Message {
	type: string;
	entries?: ReflogEntry[];
}

interface VSCodeAPI {
	postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

const vscode = acquireVsCodeApi();

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
