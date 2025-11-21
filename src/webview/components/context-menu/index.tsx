import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import styles from "../../reflog.module.css";

interface ContextMenuProps {
	children: React.ReactNode;
	onClose?: () => void;
	triggerRef?: React.RefObject<HTMLElement | null>;
}

export default function ContextMenu({ children, onClose, triggerRef }: ContextMenuProps) {
	const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const handleContextMenu = (event: MouseEvent) => {
			if (triggerRef) {
				if (!triggerRef.current || !triggerRef.current.contains(event.target as Node)) {
					return;
				}
			}

			event.preventDefault();
			setPosition({ x: event.clientX, y: event.clientY });
		};

		document.addEventListener("contextmenu", handleContextMenu);

		return () => {
			document.removeEventListener("contextmenu", handleContextMenu);
		};
	}, [triggerRef]);

	useEffect(() => {
		if (position) {
			const handleEscape = (e: KeyboardEvent) => {
				if (e.key === "Escape") {
					setPosition(null);
					onClose?.();
				}
			};

			const handleClickOutside = (e: MouseEvent) => {
				const target = e.target as HTMLElement;
				if (menuRef.current && !menuRef.current.contains(target)) {
					setPosition(null);
					onClose?.();
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
	}, [position, onClose]);

	useLayoutEffect(() => {
		if (position && menuRef.current) {
			const menu = menuRef.current;
			const rect = menu.getBoundingClientRect();
			const { innerWidth, innerHeight } = window;

			let newX = position.x;
			let newY = position.y;

			// Check right edge
			if (rect.right > innerWidth) {
				newX = innerWidth - rect.width;
			}

			// Check bottom edge
			if (rect.bottom > innerHeight) {
				newY = innerHeight - rect.height;
			}

			// Apply corrections if needed
			if (newX !== position.x || newY !== position.y) {
				menu.style.left = `${newX}px`;
				menu.style.top = `${newY}px`;
			}
		}
	}, [position]);

	if (!position) {
		return null;
	}

	return (
		<div
			ref={menuRef}
			className={styles.contextMenu}
			style={{ top: position.y, left: position.x }}
		>
			{children}
		</div>
	);
}
