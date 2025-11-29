import { useEffect, useState, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import styles from "./squash-editor.module.css";
import { CommityIcon } from "../components/icons/CommityIcon";

type CommitType =
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
type EditorMode = "squash" | "amend";

interface Commit {
	hash: string;
	message: string;
	author?: { name: string; email?: string };
	timestamp?: string;
	totalAdditions?: number;
	totalDeletions?: number;
	commitType?: CommitType;
}

interface InitData {
	mode: EditorMode;
	commitCount: number;
	defaultMessage: string;
	commits: Commit[];
}

interface Message {
	type: string;
	data?: InitData | { message: string } | { chunk: string; message: string } | { error: string };
}

interface VSCodeAPI {
	postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

const vscode = acquireVsCodeApi();

function App() {
	const [mode, setMode] = useState<EditorMode>("squash");
	const [message, setMessage] = useState("");
	const [commits, setCommits] = useState<Commit[]>([]);
	const [isGenerating, setIsGenerating] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const isAmend = mode === "amend";

	useEffect(() => {
		const messageHandler = (event: MessageEvent<Message>) => {
			const msg = event.data;

			switch (msg.type) {
				case "init":
					if (msg.data && "defaultMessage" in msg.data) {
						setMode(msg.data.mode);
						setMessage(msg.data.defaultMessage);
						setCommits(msg.data.commits);
						requestAnimationFrame(() => {
							textareaRef.current?.focus();
							textareaRef.current?.select();
						});
					}
					break;
				case "messageChunk":
					if (msg.data && "message" in msg.data) {
						setMessage(msg.data.message);
					}
					break;
				case "messageComplete":
					setIsGenerating(false);
					if (msg.data && "message" in msg.data) {
						setMessage(msg.data.message);
					}
					break;
				case "messageAborted":
					setIsGenerating(false);
					break;
				case "messageError":
					setIsGenerating(false);
					break;
			}
		};

		window.addEventListener("message", messageHandler);
		vscode.postMessage({ type: "ready" });
		return () => window.removeEventListener("message", messageHandler);
	}, []);

	const handleSubmit = useCallback(() => {
		if (message.trim()) {
			vscode.postMessage({ type: "submit", message: message.trim() });
		}
	}, [message]);

	const handleCancel = useCallback(() => {
		vscode.postMessage({ type: "cancel" });
	}, []);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				handleSubmit();
			} else if (e.key === "Escape") {
				handleCancel();
			}
		},
		[handleSubmit, handleCancel]
	);

	const handleGenerateMessage = useCallback(() => {
		if (isGenerating) {
			vscode.postMessage({ type: "abortGeneration" });
		} else {
			setIsGenerating(true);
			setMessage("");
			vscode.postMessage({ type: "generateMessage", data: { commits } });
		}
	}, [commits, isGenerating]);

	const handleMouseMove = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
		const btn = e.currentTarget;
		const rect = btn.getBoundingClientRect();
		const x = ((e.clientX - rect.left) / rect.width) * 100;
		const y = ((e.clientY - rect.top) / rect.height) * 100;
		btn.style.setProperty("--mouse-x", `${x}%`);
		btn.style.setProperty("--mouse-y", `${y}%`);
	}, []);

	const title = isAmend ? "Amend Commit" : `Squash ${commits.length} Commits`;
	const subtitle = isAmend
		? "Edit the commit message for HEAD"
		: "Edit the commit message for the squashed commit";
	const commitListHeader = isAmend ? "Current commit" : "Commits to squash";
	const placeholder = isAmend
		? "Enter the new commit message"
		: "Enter the new commit message for the squashed commit";
	const hint = isAmend
		? "Press ⌘+Enter to amend, Escape to cancel"
		: "Press ⌘+Enter to squash, Escape to cancel";
	const submitLabel = isAmend ? "Amend Commit" : "Squash Commits";

	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<h2 className={styles.title}>{title}</h2>
				<p className={styles.subtitle}>{subtitle}</p>
			</div>

			<div className={styles.commitsPreview}>
				<div className={styles.commitsHeader}>
					<span>{commitListHeader}</span>
					{!isAmend && <span className={styles.commitCount}>{commits.length}</span>}
				</div>
				<div className={styles.commitsList}>
					{commits.map((commit) => (
						<div
							key={commit.hash}
							className={`${styles.commitItem} ${commit.commitType ? styles[`type${commit.commitType.charAt(0).toUpperCase()}${commit.commitType.slice(1)}`] : ""}`}
						>
							<div className={styles.commitMain}>
								{commit.commitType && (
									<span
										className={`${styles.commitType} ${styles[`type${commit.commitType.charAt(0).toUpperCase()}${commit.commitType.slice(1)}`]}`}
									>
										{commit.commitType}
									</span>
								)}
								<span className={styles.commitMessage}>{commit.message}</span>
							</div>
							<div className={styles.commitMeta}>
								{commit.author && <span className={styles.commitAuthor}>{commit.author.name}</span>}
								<span className={styles.commitHash}>{commit.hash.substring(0, 7)}</span>
								{(commit.totalAdditions !== undefined || commit.totalDeletions !== undefined) && (
									<span className={styles.commitStats}>
										<span className={styles.additions}>+{commit.totalAdditions ?? 0}</span>
										<span className={styles.deletions}>-{commit.totalDeletions ?? 0}</span>
									</span>
								)}
							</div>
						</div>
					))}
				</div>
			</div>

			<div className={styles.editorSection}>
				<div className={styles.editorHeader}>
					<label htmlFor="commit-message">New commit message:</label>
					<button
						className={`${styles.generateBtn} ${isGenerating ? styles.generating : ""}`}
						onClick={handleGenerateMessage}
						onMouseMove={handleMouseMove}
					>
						{isGenerating ? (
							<i className={`codicon codicon-debug-stop ${styles.stopIcon}`} />
						) : (
							<CommityIcon size={14} />
						)}{" "}
						Generate message
					</button>
				</div>
				<textarea
					ref={textareaRef}
					id="commit-message"
					className={styles.textarea}
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={isGenerating ? "Generating..." : placeholder}
					rows={10}
				/>
				<div className={styles.hint}>{hint}</div>
			</div>

			<div className={styles.actions}>
				<button className={styles.cancelBtn} onClick={handleCancel}>
					Cancel
				</button>
				<button className={styles.submitBtn} onClick={handleSubmit} disabled={!message.trim()}>
					{submitLabel}
				</button>
			</div>
		</div>
	);
}

const root = createRoot(document.getElementById("app")!);
root.render(<App />);
