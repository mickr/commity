import { useCallback } from "react";
import styles from "../reflog.module.css";

export type CommitType =
	| "feat"
	| "fix"
	| "docs"
	| "style"
	| "refactor"
	| "perf"
	| "test"
	| "chore"
	| "ci"
	| "build"
	| "revert"
	| "merge"
	| "other";

export interface ReflogEntry {
	hash: string;
	message: string;
	timestamp: string;
	filesChanged?: number;
	author?: {
		name: string;
		email?: string;
	};
	isMerge?: boolean;
	totalAdditions?: number;
	totalDeletions?: number;
	commitType?: CommitType;
	isNewCommit?: boolean; // True if this commit is after the merge base (new to this branch)
}

export interface FileInfo {
	name: string;
	status: string;
	additions: number;
	deletions: number;
}

interface ReflogEntryProps {
	entry: ReflogEntry;
	index: number;
	isSelected: boolean;
	isFocused: boolean;
	onSelect: (index: number, shiftKey: boolean, metaKey: boolean) => void;
	files?: FileInfo[];
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
	const hasFiles =
		(entry.filesChanged !== undefined && entry.filesChanged > 0) || (files && files.length > 0);

	const handleSelectionClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			const isMultiSelect = e.shiftKey || e.metaKey || e.ctrlKey;
			onSelect(index, e.shiftKey, e.metaKey || e.ctrlKey);
			if (hasFiles && !isMultiSelect) {
				onToggleFiles?.();
			}
		},
		[index, onSelect, hasFiles, onToggleFiles]
	);

	const handleFileClick = useCallback(
		(e: React.MouseEvent, filename: string) => {
			e.stopPropagation();
			onOpenFile?.(filename);
		},
		[onOpenFile]
	);

	const getStatusLabel = (status: string) => {
		switch (status) {
			case "A":
				return "Added";
			case "D":
				return "Deleted";
			case "M":
				return "Modified";
			case "R":
				return "Renamed";
			case "C":
				return "Copied";
			default:
				return "Changed";
		}
	};

	const handleHashClick = useCallback(
		(e: React.MouseEvent) => {
			e.stopPropagation();
			navigator.clipboard.writeText(entry.hash);
			const target = e.currentTarget as HTMLElement;
			target.classList.add(styles.copied);
			setTimeout(() => target.classList.remove(styles.copied), 1000);
		},
		[entry.hash]
	);

	const handleContextMenu = useCallback(() => {
		if (!isSelected) {
			onSelect(index, false, false);
		}
	}, [index, isSelected, onSelect]);

	const isExpanded = isCollapsed === false;

	const getCommitTypeClass = (type?: CommitType) => {
		if (!type) {
			return "";
		}
		return styles[`type${type.charAt(0).toUpperCase()}${type.slice(1)}`] || "";
	};

	const getCommitTypeLabel = (type: CommitType) => {
		const labels: Record<CommitType, string> = {
			feat: "Feature",
			fix: "Bug Fix",
			docs: "Documentation",
			style: "Style",
			refactor: "Refactor",
			perf: "Performance",
			test: "Test",
			chore: "Chore",
			ci: "CI",
			build: "Build",
			revert: "Revert",
			merge: "Merge",
			other: "Other",
		};
		return labels[type];
	};

	const classNames = [
		styles.reflogEntry,
		isSelected && styles.selected,
		isFocused && styles.focused,
		isExpanded && styles.glowing,
		entry.commitType && getCommitTypeClass(entry.commitType),
	]
		.filter(Boolean)
		.join(" ");

	return (
		<div className={classNames} onClick={handleSelectionClick} onContextMenu={handleContextMenu}>
			<div className={styles.entryContent}>
				<div className={styles.entryMain}>
					{entry.isMerge && (
						<span className={styles.mergeIndicator} title="Merge commit">
							<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
								<path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-11.5a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
							</svg>
						</span>
					)}
					{entry.commitType && (
						<span
							className={`${styles.commitType} ${getCommitTypeClass(entry.commitType)}`}
							title={getCommitTypeLabel(entry.commitType)}
						>
							{entry.commitType}
						</span>
					)}
					<span
						className={isExpanded ? styles.entryMessageExpanded : styles.entryMessage}
						title={isExpanded ? undefined : entry.message}
					>
						{entry.message}
					</span>
				</div>
				<div className={styles.entryMeta}>
					{entry.author && (
						<span className={styles.entryAuthor} title={entry.author.email || entry.author.name}>
							{entry.author.name}
						</span>
					)}
					<span className={styles.entryHash} onClick={handleHashClick} title="Click to copy">
						{entry.hash.substring(0, 7)}
					</span>
					<span className={styles.entryTimestamp}>{formatTimestamp(entry.timestamp)}</span>
					{(entry.totalAdditions !== undefined || entry.totalDeletions !== undefined) && (
						<span className={styles.entryStats}>
							<span className={styles.additions}>+{entry.totalAdditions ?? 0}</span>
							<span className={styles.deletions}>-{entry.totalDeletions ?? 0}</span>
						</span>
					)}
					{hasFiles && (
						<span className={`${styles.entryFiles} ${isExpanded ? styles.expanded : ""}`}>
							<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
								<path
									d="M4.5 3L7.5 6L4.5 9"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
							{entry.filesChanged}
						</span>
					)}
				</div>
				{files && !isCollapsed && (
					<div className={styles.fileList}>
						{files.map((file, i) => (
							<button
								type="button"
								key={file.name}
								className={styles.fileItem}
								style={{ animationDelay: `${i * 30}ms` }}
								onClick={(e) => handleFileClick(e, file.name)}
								title={getStatusLabel(file.status)}
							>
								<span className={`${styles.fileStatus} ${styles[`status${file.status}`]}`}>
									{file.status}
								</span>
								<span className={styles.fileStats}>
									<span className={styles.additions}>+{file.additions}</span>
									<span className={styles.deletions}>-{file.deletions}</span>
								</span>
								<span className={styles.fileName}>{file.name}</span>
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

export default ReflogEntryComponent;
