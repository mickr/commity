/* eslint-env node */
/* eslint-disable @typescript-eslint/no-var-requires */

const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
	const extensionCtx = await esbuild.context({
		entryPoints: ["src/extension.ts"],
		bundle: true,
		format: "cjs",
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: "node",
		outfile: "out/extension.js",
		external: ["vscode"],
		logLevel: "silent",
		plugins: [
			{
				name: "watch-plugin",
				setup(build) {
					build.onStart(() => {
						console.log("[watch] build started");
					});

					build.onEnd((result) => {
						result.errors.forEach(({ text, location }) => {
							console.error(`✘ [ERROR] ${text}`);
							console.error(`    ${location.file}:${location.line}:${location.column}:`);
						});
						console.log("[watch] build finished");
					});
				},
			},
		],
	});

	const webviewCtx = await esbuild.context({
		entryPoints: ["src/webview/reflog/index.tsx"],
		bundle: true,
		format: "iife",
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: "browser",
		outfile: "out/webview/reflog/index.js",
		logLevel: "silent",
		loader: {
			".module.css": "local-css",
		},
		jsx: "automatic",
	});

	const squashEditorCtx = await esbuild.context({
		entryPoints: ["src/webview/squash-editor/index.tsx"],
		bundle: true,
		format: "iife",
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: "browser",
		outfile: "out/webview/squash-editor/index.js",
		logLevel: "silent",
		loader: {
			".module.css": "local-css",
		},
		jsx: "automatic",
	});

	const cssSource = path.join(__dirname, "src/webview/reflog.css");
	const cssTarget = path.join(__dirname, "out/webview/reflog.css");

	if (!fs.existsSync(path.dirname(cssTarget))) {
		fs.mkdirSync(path.dirname(cssTarget), { recursive: true });
	}

	fs.copyFileSync(cssSource, cssTarget);

	if (watch) {
		await extensionCtx.watch();
		await webviewCtx.watch();
		await squashEditorCtx.watch();
	} else {
		await extensionCtx.rebuild();
		await webviewCtx.rebuild();
		await squashEditorCtx.rebuild();
		await extensionCtx.dispose();
		await webviewCtx.dispose();
		await squashEditorCtx.dispose();
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
