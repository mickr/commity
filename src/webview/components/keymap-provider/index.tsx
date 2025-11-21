import React, { useEffect } from "react";

interface KeymapProviderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onSelect"> {
	children: React.ReactNode;
	itemCount: number;
	focusedIndex: number;
	setFocusedIndex: (index: number) => void;
	onSelect: (index: number, options: { shift: boolean; meta: boolean }) => void;
}

export const KeymapProvider = React.forwardRef<HTMLDivElement, KeymapProviderProps>(
	({ children, itemCount, focusedIndex, setFocusedIndex, onSelect, ...props }, ref) => {
		useEffect(() => {
			const handleMessage = (event: MessageEvent) => {
				const message = event.data;
				if (message.type === "key") {
					handleKeyEvent(message.key, false, false);
				}
			};

			window.addEventListener("message", handleMessage);
			return () => window.removeEventListener("message", handleMessage);
		}, [itemCount, focusedIndex, setFocusedIndex, onSelect]);

		const handleKeyEvent = (
			key: string,
			shift: boolean,
			meta: boolean,
			e?: React.KeyboardEvent
		) => {
			if (itemCount === 0) return;

			switch (key) {
				case "ArrowUp": {
					e?.preventDefault();
					const newIndex = Math.max(0, focusedIndex - 1);
					setFocusedIndex(newIndex);
					if (shift) {
						onSelect(newIndex, { shift: true, meta: false });
					}
					break;
				}
				case "ArrowDown": {
					e?.preventDefault();
					const newIndex = Math.min(itemCount - 1, focusedIndex + 1);
					setFocusedIndex(newIndex);
					if (shift) {
						onSelect(newIndex, { shift: true, meta: false });
					}
					break;
				}
				case " ":
				case "Enter": {
					e?.preventDefault();
					// Space/Enter selects the current focused item.
					onSelect(focusedIndex, { shift: shift, meta: meta });
					break;
				}
			}
		};

		return (
			<div
				{...props}
				ref={ref}
				onKeyDown={(e) => {
					handleKeyEvent(e.key, e.shiftKey, e.metaKey || e.ctrlKey, e);
					props.onKeyDown?.(e);
				}}
			>
				{children}
			</div>
		);
	}
);
