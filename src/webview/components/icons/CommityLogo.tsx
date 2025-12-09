import { useEffect, useState } from "react";

interface CommityLogoProps {
	darkSrc?: string;
	lightSrc?: string;
	className?: string;
	alt?: string;
}

export function CommityLogo({ darkSrc, lightSrc, className, alt = "" }: CommityLogoProps) {
	const [isLight, setIsLight] = useState(false);

	useEffect(() => {
		// Check initial theme
		const checkTheme = () => {
			setIsLight(document.body.classList.contains("vscode-light"));
		};

		checkTheme();

		// Watch for theme changes
		const observer = new MutationObserver(checkTheme);
		observer.observe(document.body, {
			attributes: true,
			attributeFilter: ["class"],
		});

		return () => observer.disconnect();
	}, []);

	const src = isLight ? lightSrc : darkSrc;

	return <img src={src} className={className} alt={alt} />;
}
