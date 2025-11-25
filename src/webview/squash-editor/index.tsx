import { useEffect, useState, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import styles from "./squash-editor.module.css";

interface SquashData {
	commitCount: number;
	defaultMessage: string;
	commits: Array<{ hash: string; message: string }>;
}

interface Message {
	type: string;
	data?: SquashData;
}

interface VSCodeAPI {
	postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

const vscode = acquireVsCodeApi();

function App() {
	const [message, setMessage] = useState("");
	const [commits, setCommits] = useState<Array<{ hash: string; message: string }>>([]);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		const messageHandler = (event: MessageEvent<Message>) => {
			const msg = event.data;
			if (msg.type === "init" && msg.data) {
				setMessage(msg.data.defaultMessage);
				setCommits(msg.data.commits);
				requestAnimationFrame(() => {
					textareaRef.current?.focus();
					textareaRef.current?.select();
				});
			}
		};

		window.addEventListener("message", messageHandler);
		vscode.postMessage({ type: "ready" });
		return () => window.removeEventListener("message", messageHandler);
	}, []);

	const handleSubmit = useCallback(() => {
		if (message.trim()) {
			vscode.postMessage({ type: "squash", message: message.trim() });
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

	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<h2 className={styles.title}>Squash {commits.length} Commits</h2>
				<p className={styles.subtitle}>Edit the commit message for the squashed commit</p>
			</div>

			<div className={styles.commitsPreview}>
				<div className={styles.commitsHeader}>Commits to squash:</div>
				<div className={styles.commitsList}>
					{commits.map((commit) => (
						<div key={commit.hash} className={styles.commitItem}>
							<span className={styles.commitHash}>{commit.hash.substring(0, 7)}</span>
							<span className={styles.commitMessage}>{commit.message}</span>
						</div>
					))}
				</div>
			</div>

			<div className={styles.editorSection}>
				<label className={styles.label} htmlFor="commit-message">
					New commit message:
				</label>
				<textarea
					ref={textareaRef}
					id="commit-message"
					className={styles.textarea}
					value={message}
					onChange={(e) => setMessage(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Enter commit message..."
					rows={10}
				/>
				<div className={styles.hint}>Press ⌘+Enter to squash, Escape to cancel</div>
			</div>

			<div className={styles.actions}>
				<button className={styles.cancelBtn} onClick={handleCancel}>
					Cancel
				</button>
				<button className={styles.submitBtn} onClick={handleSubmit} disabled={!message.trim()}>
					Squash Commits
				</button>
			</div>
		</div>
	);
}

const root = createRoot(document.getElementById("app")!);
root.render(<App />);
