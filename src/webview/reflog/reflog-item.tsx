import { useCallback } from "react";
import styles from "../reflog.module.css";

export interface ReflogEntry {
	hash: string;
	// selector: string;
	message: string;
	timestamp: string;
	filesChanged?: number;
}

interface ReflogEntryProps {
	entry: ReflogEntry;
	index: number;
	isSelected: boolean;
	isFocused: boolean;
	onSelect: (index: number, shiftKey: boolean, metaKey: boolean) => void;
	files?: string[];
	onOpenFile?: (file: string) => void;
	isCollapsed?: boolean;
	onToggleFiles?: () => void;
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
	isFocused,
	onSelect,
	files,
	onOpenFile,
	isCollapsed,
	onToggleFiles,
}: ReflogEntryProps) {
	const handleSelectionClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onSelect(index, e.shiftKey, e.metaKey || e.ctrlKey);
		},
		[index, onSelect]
	);

	const handleFileClick = useCallback(
		(e: React.MouseEvent, file: string) => {
			e.stopPropagation();
			onOpenFile?.(file);
		},
		[onOpenFile]
	);

	const handleToggleClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			onToggleFiles?.();
		},
		[onToggleFiles]
	);

	const handleContextMenu = useCallback(() => {
		if (!isSelected) {
			onSelect(index, false, false);
		}
	}, [index, isSelected, onSelect]);

	const hasFiles = files && files.length > 0;

	return (
		<div
			className={`${styles.reflogEntry} ${isSelected ? styles.selected : ""} ${
				isFocused ? styles.focused : ""
			}`}
			onClick={handleSelectionClick}
			onContextMenu={handleContextMenu}
		>
			<div className={styles.entryContent}>
				<div className={styles.entryHeader}>
					{hasFiles && (
						<span
							className={`${styles.toggleIcon} ${isCollapsed ? styles.collapsed : ""}`}
							onClick={handleToggleClick}
						>
							▼
						</span>
					)}
					<span className={styles.entryHash}>{entry.hash.substring(0, 7)}</span>
					{entry.filesChanged !== undefined && (
						<span className={styles.entrySelector} title={`${entry.filesChanged} files changed`}>
							{entry.filesChanged} file{entry.filesChanged !== 1 ? "s" : ""}
						</span>
					)}
					{/* <span className={styles.entrySelector}>{entry.selector}</span> */}
					<span className={styles.entryTimestamp}>{formatTimestamp(entry.timestamp)}</span>
				</div>
				<div className={styles.entryMessage}>{entry.message}</div>
				{hasFiles && !isCollapsed && (
					<div className={styles.fileList}>
						<div className={styles.fileListHeader}>Changed Files:</div>
						{files.map((file) => (
							<div
								key={file}
								className={styles.fileItem}
								onClick={(e) => handleFileClick(e, file)}
								title={`Open diff for ${file}`}
							>
								<span className={styles.fileIcon}>📄</span>
								<span className={styles.fileName}>{file}</span>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

export default ReflogEntryComponent;
