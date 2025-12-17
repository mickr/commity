import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { StatusLetter } from "../../types/git";
import { CommityIcon } from "../components/icons/CommityIcon";
import styles from "./working-changes.module.css";
import reflogStyles from "../reflog.module.css";
import { ContextMenuItem } from "../components/context-menu";

interface FileChange {
	path: string;
	status: StatusLetter;
	additions: number;
	deletions: number;
}

type RiskLevel = "low" | "medium" | "high";
type SizeLevel = "small" | "medium" | "large" | "huge";

interface AdvisorMessage {
	id: string;
	level: "info" | "warning" | "danger";
	text: string;
}

interface ComplexitySummary {
	sizeLevel: SizeLevel;
	riskLevel: RiskLevel;

	totalAdditions: number;
	totalDeletions: number;
	directoryCount: number;
	fileTypeCount: number;
	messages: AdvisorMessage[];
}

interface WorkingChangesData {
	staged: {
		count: number;
		additions: number;
		deletions: number;
		files: FileChange[];
	};
	modified: {
		count: number;
		additions: number;
		deletions: number;
		files: FileChange[];
	};
	untracked: {
		count: number;
		files: FileChange[];
	};
	conflicts: { path: string }[];
	complexity?: ComplexitySummary;
}

interface Message {
	type: string;
	data?: WorkingChangesData | null;
}

interface VSCodeAPI {
	postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

const vscode = acquireVsCodeApi();

interface ContextMenu {
	x: number;
	y: number;
	file: FileChange;
	isStaged: boolean;
}

function App() {
	const [data, setData] = useState<WorkingChangesData | null>(null);
	const [loading, setLoading] = useState(true);
	const [stagedCollapsed, setStagedCollapsed] = useState(false);
	const [unstagedCollapsed, setUnstagedCollapsed] = useState(false);
	const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const messageHandler = (event: MessageEvent<Message>) => {
			const message = event.data;
			if (message.type === "workingChangesData") {
				setData(message.data ?? null);
				setLoading(false);
			}
		};

		window.addEventListener("message", messageHandler);
		vscode.postMessage({ type: "webviewLoaded" });
		return () => window.removeEventListener("message", messageHandler);
	}, []);

	useEffect(() => {
		if (!contextMenu) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setContextMenu(null);
			}
		};

		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
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
	}, [contextMenu]);

	if (loading) {
		return (
			<div className={styles.container}>
				<div className={styles.loading}>Loading...</div>
			</div>
		);
	}

	const isClean =
		data === null ||
		(data.staged.count === 0 && data.modified.count === 0 && data.untracked.count === 0);

	if (isClean) {
		return (
			<div className={styles.container}>
				<div className={styles.emptyState}>
					<div className={styles.emptyIcon}>
						<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
							<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
							<path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
							<path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
							<path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
						</svg>
					</div>
					<div className={styles.emptyMessage}>Ready to ship!</div>
					<div className={styles.emptyHint}>Working tree is clean</div>
				</div>
			</div>
		);
	}

	const hasUnstaged = data.modified.count > 0 || data.untracked.count > 0;

	const handleViewAllChanges = () => {
		vscode.postMessage({ type: "viewAllChanges" });
	};

	const handleOpenFileDiff = (path: string, isStaged: boolean) => {
		vscode.postMessage({ type: "openFileDiff", path, isStaged });
	};

	const handleOpenMergeEditor = (path: string) => {
		vscode.postMessage({ type: "openMergeEditor", path });
	};

	const handleOpenSourceControl = () => {
		vscode.postMessage({ type: "openSourceControl" });
	};

	const handleGenerateAndCommit = () => {
		vscode.postMessage({ type: "generateAndCommit" });
	};

	const handleContextMenu = (e: React.MouseEvent, file: FileChange, isStaged: boolean) => {
		e.preventDefault();
		setContextMenu({ x: e.clientX, y: e.clientY, file, isStaged });
	};

	const handleStageFile = (path: string) => {
		vscode.postMessage({ type: "stageFile", path });
		setContextMenu(null);
	};

	const handleUnstageFile = (path: string) => {
		vscode.postMessage({ type: "unstageFile", path });
		setContextMenu(null);
	};

	const handleDiscardChanges = (file: FileChange) => {
		vscode.postMessage({ type: "discardChanges", path: file.path, status: file.status });
		setContextMenu(null);
	};

	const STATUS_CLASSES: Record<StatusLetter, string> = {
		A: styles.statusAdded,
		M: styles.statusModified,
		D: styles.statusDeleted,
		R: styles.statusRenamed,
		C: styles.statusModified,
		U: styles.statusUntracked,
		"?": "",
	};

	const renderFileList = (files: FileChange[], isStaged: boolean) => (
		<div className={styles.fileList}>
			{files.map((file) => (
				<button
					key={file.path}
					type="button"
					className={styles.fileItem}
					onClick={() => handleOpenFileDiff(file.path, isStaged)}
					onContextMenu={(e) => handleContextMenu(e, file, isStaged)}
					title={file.path}
				>
					<span className={`${styles.fileStatus} ${STATUS_CLASSES[file.status]}`}>
						{file.status}
					</span>
					<span className={styles.fileName}>
						<bdi>{file.path}</bdi>
					</span>
					{(file.additions > 0 || file.deletions > 0) && (
						<span className={styles.fileDiff}>
							{file.additions > 0 && (
								<span className={styles.additions}>+{file.additions}</span>
							)}
							{file.deletions > 0 && (
								<span className={styles.deletions}>-{file.deletions}</span>
							)}
						</span>
					)}
				</button>
			))}
		</div>
	);

	return (
		<div className={styles.container}>
			{data.conflicts.length > 0 && (
				<div className={styles.conflictSection}>
					<div className={styles.conflictWarning}>
						<i className="codicon codicon-warning" />
						<span>
							{data.conflicts.length} {data.conflicts.length === 1 ? "conflict" : "conflicts"}
						</span>
					</div>
					<div className={styles.conflictList}>
						{data.conflicts.map((file) => (
							<button
								key={file.path}
								type="button"
								className={styles.conflictItem}
								onClick={() => handleOpenMergeEditor(file.path)}
								title={`Resolve ${file.path}`}
							>
								<i className="codicon codicon-git-merge" />
								<span className={styles.fileName}>
									<bdi>{file.path}</bdi>
								</span>
								<span className={styles.resolveLabel}>Resolve</span>
							</button>
						))}
					</div>
				</div>
			)}

			{data.complexity && data.complexity.messages.length > 0 && (
				<div className={styles.advisorCard}>
					<div className={styles.advisorHeader}>
						<i className="codicon codicon-lightbulb" />
						<span className={styles.advisorTitle}>Commit advisor</span>
						<span className={`${styles.riskBadge} ${styles[`risk-${data.complexity.riskLevel}`]}`}>
							{data.complexity.riskLevel === "low" && "Good to commit"}
							{data.complexity.riskLevel === "medium" && "Review suggested"}
							{data.complexity.riskLevel === "high" && "Consider splitting"}
						</span>
					</div>
					<ul className={styles.advisorMessages}>
						{data.complexity.messages.slice(0, 3).map((msg) => (
							<li
								key={msg.id}
								className={`${styles.advisorMessage} ${styles[`message-${msg.level}`]}`}
							>
								<i className={`codicon codicon-${msg.level === "info" ? "info" : msg.level === "warning" ? "warning" : "error"}`} />
								<span>{msg.text}</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{/* Staged group */}
			{data.staged.count > 0 && (
				<div className={styles.group}>
					<button
						type="button"
						className={styles.groupHeader}
						onClick={() => setStagedCollapsed(!stagedCollapsed)}
					>
						<span className={styles.groupHeaderLeft}>
							<i className={`codicon codicon-chevron-${stagedCollapsed ? "right" : "down"}`} />
							<span>Staged</span>
						</span>
						<span className={styles.groupStats}>
							<span className={styles.groupCount}>{data.staged.count}</span>
							{(data.staged.additions > 0 || data.staged.deletions > 0) && (
								<span className={styles.statDiff}>
									{data.staged.additions > 0 && (
										<span className={styles.additions}>+{data.staged.additions}</span>
									)}
									{data.staged.deletions > 0 && (
										<span className={styles.deletions}>-{data.staged.deletions}</span>
									)}
								</span>
							)}
						</span>
					</button>
					{!stagedCollapsed && renderFileList(data.staged.files, true)}
				</div>
			)}

			{/* Unstaged group */}
			{hasUnstaged && (
				<div className={styles.group}>
					<button
						type="button"
						className={styles.groupHeader}
						onClick={() => setUnstagedCollapsed(!unstagedCollapsed)}
					>
						<span className={styles.groupHeaderLeft}>
							<i className={`codicon codicon-chevron-${unstagedCollapsed ? "right" : "down"}`} />
							<span>Unstaged</span>
						</span>
						<span className={styles.groupStats}>
							<span className={styles.groupCount}>
								{data.modified.count + data.untracked.count}
							</span>
							{(data.modified.additions > 0 || data.modified.deletions > 0) && (
								<span className={styles.statDiff}>
									{data.modified.additions > 0 && (
										<span className={styles.additions}>+{data.modified.additions}</span>
									)}
									{data.modified.deletions > 0 && (
										<span className={styles.deletions}>-{data.modified.deletions}</span>
									)}
								</span>
							)}
						</span>
					</button>
					{!unstagedCollapsed && renderFileList([...data.modified.files, ...data.untracked.files], false)}
				</div>
			)}

			<div className={styles.actionBar}>
				<button
					type="button"
					className={`${styles.actionButton} ${styles.secondary}`}
					onClick={handleViewAllChanges}
				>
					<i className="codicon codicon-diff" />
					<span>View changes</span>
				</button>
				<button
					type="button"
					className={`${styles.actionButton} ${styles.primary}`}
					onClick={handleGenerateAndCommit}
				>
					<CommityIcon size={14} />
					<span>Commit</span>
				</button>
			</div>

			{contextMenu && (
				<div
					ref={menuRef}
					className={reflogStyles.contextMenu}
					style={{ top: contextMenu.y, left: contextMenu.x }}
				>
					<ContextMenuItem
						className={reflogStyles.contextMenuItem}
						onClick={() => handleDiscardChanges(contextMenu.file)}
					>
						<i className="codicon codicon-discard" />
						Discard changes
					</ContextMenuItem>
					{contextMenu.isStaged ? (
						<ContextMenuItem
							className={reflogStyles.contextMenuItem}
							onClick={() => handleUnstageFile(contextMenu.file.path)}
						>
							<i className="codicon codicon-remove" />
							Unstage
						</ContextMenuItem>
					) : (
						<ContextMenuItem
							className={reflogStyles.contextMenuItem}
							onClick={() => handleStageFile(contextMenu.file.path)}
						>
							<i className="codicon codicon-add" />
							Stage
						</ContextMenuItem>
					)}
				</div>
			)}
		</div>
	);
}

const root = createRoot(document.getElementById("app")!);
root.render(<App />);
