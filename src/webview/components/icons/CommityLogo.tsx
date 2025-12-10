import { useEffect, useState } from "react";

interface CommityLogoProps {
	darkSrc?: string;
	lightSrc?: string;
	className?: string;
	alt?: string;
}

export function CommityLogo({ darkSrc, lightSrc, className, alt = "" }: CommityLogoProps) {
	// Check initial theme synchronously to avoid flash
	const [isLight, setIsLight] = useState(() => document.body.classList.contains("vscode-light"));

	useEffect(() => {
		// Watch for theme changes
		const checkTheme = () => {
			setIsLight(document.body.classList.contains("vscode-light"));
		};

		const observer = new MutationObserver(checkTheme);
		observer.observe(document.body, {
			attributes: true,
			attributeFilter: ["class"],
		});

		return () => observer.disconnect();
	}, []);

	const src = isLight ? lightSrc : darkSrc;

	// Don't render if no source is available
	if (!src) {
		return null;
	}

	return <img src={src} className={className} alt={alt} />;
}
