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
	isSelected: boolean;
	onSelect: (hash: string) => void;
	onReset: (entry: ReflogEntry) => void;
}

function ReflogEntryComponent({ entry, isSelected, onSelect, onReset }: ReflogEntryProps) {
	const handleSelectionClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			console.log("selectionClick", entry.hash);
			onSelect(entry.hash);
		},
		[entry.hash, onSelect]
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
	const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());

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
		(hash: string) => {
			console.log("selectEntry", hash);
			const entry = entries.find((e) => e.hash === hash);
			if (entry) {
				vscode.postMessage({ type: "selectEntry", entry });
			}
		},
		[entries]
	);

	const handleToggleCheckbox = useCallback((hash: string, checked: boolean) => {
		setSelectedHashes((prev) => {
			const next = new Set(prev);
			if (checked) {
				next.add(hash);
			} else {
				next.delete(hash);
			}
			return next;
		});
	}, []);

	const handleReset = useCallback((entry: ReflogEntry) => {
		vscode.postMessage({ type: "resetToEntry", entry });
	}, []);

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
						{entries.map((entry) => (
							<ReflogEntryComponent
								key={entry.hash}
								entry={entry}
								isSelected={selectedHashes.has(entry.hash)}
								onSelect={handleSelectEntry}
								onToggleCheckbox={handleToggleCheckbox}
								onReset={handleReset}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

const root = createRoot(document.getElementById("app")!);
root.render(<App />);
