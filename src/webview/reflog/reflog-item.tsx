import { useCallback } from "react";
import styles from "../reflog.module.css";

export interface ReflogEntry {
	hash: string;
	selector: string;
	message: string;
	timestamp: string;
}

interface ReflogEntryProps {
	entry: ReflogEntry;
	index: number;
	isSelected: boolean;
	onSelect: (index: number, shiftKey: boolean, metaKey: boolean) => void;
	onContextMenu: (index: number, event: React.MouseEvent) => void;
	onReset: (entry: ReflogEntry) => void;
}

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

function ReflogEntryComponent({
	entry,
	index,
	isSelected,
	onSelect,
	onContextMenu,
	onReset,
}: ReflogEntryProps) {
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

export default ReflogEntryComponent;
