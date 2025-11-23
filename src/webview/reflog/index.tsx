import { useEffect, useState, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import styles from "../reflog.module.css";
import ReflogEntryComponent, { type ReflogEntry } from "./reflog-item";
import ContextMenu from "../components/context-menu";
import { KeymapProvider } from "../components/keymap-provider";

interface Message {
	type: string;
	entries?: ReflogEntry[];
	key?: string;
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
	const [focusedIndex, setFocusedIndex] = useState<number>(0);
	const listRef = useRef<HTMLDivElement>(null);
	const appRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const messageHandler = (event: MessageEvent<Message>) => {
			const message = event.data;
			if (message.type === "reflogData") {
				setEntries(message.entries || []);
				setFocusedIndex(0);
				// Focus the app container so keyboard shortcuts work immediately
				setTimeout(() => {
					appRef.current?.focus();
				}, 0);
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
						// Fallback: just show the clicked entry
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

	const handleSquash = useCallback(() => {
		const selectedEntries = Array.from(selectedIndices)
			.sort((a, b) => a - b)
			.map((i) => entries[i]);

		vscode.postMessage({
			type: "squashCommits",
			entries: selectedEntries,
		});

		setSelectedIndices(new Set());
	}, [selectedIndices, entries]);

	return (
		<KeymapProvider
			itemCount={entries.length}
			focusedIndex={focusedIndex}
			setFocusedIndex={setFocusedIndex}
			onSelect={(index, { shift, meta }) => handleSelectEntry(index, shift, meta)}
			className={styles.app}
			ref={appRef}
			tabIndex={0}
			style={{ outline: "none" }}
			onClick={() => appRef.current?.focus()}
		>
			<div className={styles.container}>
				{entries.length === 0 ? (
					<p className={styles.loading}>Loading reflog...</p>
				) : (
					<div className={styles.reflogList} ref={listRef}>
						{entries.map((entry, index) => (
							<ReflogEntryComponent
								key={`${entry.hash}-${index}`}
								entry={entry}
								index={index}
								isSelected={selectedIndices.has(index)}
								isFocused={index === focusedIndex}
								onSelect={handleSelectEntry}
							/>
						))}
					</div>
				)}
			</div>

			<ContextMenu triggerRef={listRef}>
				<>
					{focusedIndex === 0 && (
						<button className={styles.contextMenuItem}>Amend this commit</button>
					)}
					{isContiguous(selectedIndices) && selectedIndices.size > 1 && (
						<button className={styles.contextMenuItem} onClick={handleSquash}>
							Squash {selectedIndices.size} commits
						</button>
					)}
					{focusedIndex !== 0 && (
						<button className={styles.contextMenuItem}>
							Reset to {entries[focusedIndex]?.hash?.substring(0, 7)}
						</button>
					)}
				</>
			</ContextMenu>
		</KeymapProvider>
	);
}

const root = createRoot(document.getElementById("app")!);
root.render(<App />);
