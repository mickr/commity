# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Commity.ai is a VS Code extension that generates AI-powered Git commit messages. It analyzes staged changes and produces context-aware messages following Conventional Commits specification. The extension also provides a visual reflog browser with squash, amend, reset, and cherry-pick operations.

## Commands

```bash
# Development
npm run compile          # Type-check and build
npm run watch            # Watch mode (runs 3 watchers in parallel: esbuild, tsc, tsc-webview)
npm run check-types      # Type check only

# Testing
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage
npm run test path/to/file.test.ts  # Single test file

# Linting
npm run lint             # ESLint on src/

# Build for release
npm run package          # Type checks + production build
npm run build:patch      # Bump patch version + package .vsix
npm run build:minor      # Bump minor version + package .vsix
npm run build:major      # Bump major version + package .vsix
```

## Architecture

### Two Build Targets

The project has two separate TypeScript configurations and build outputs:

1. **Extension (Node.js)** - `src/extension.ts` → `out/extension.js`
   - VS Code extension host environment
   - Uses `tsconfig.json` (excludes `src/webview/`)
   - Built as CommonJS

2. **Webviews (Browser)** - `src/webview/` → `out/webview/`
   - React 19 components running in VS Code webview panels
   - Uses `src/webview/tsconfig.json`
   - Built as IIFE with CSS modules support
   - Two entry points: `reflog/index.tsx` and `squash-editor/index.tsx`

### Layer Structure

```
src/
├── extension.ts              # Entry point, registers commands & providers
├── commands/                 # User-initiated actions (generateCommitMessage)
├── providers/                # VS Code providers
│   ├── reflogWebviewProvider.ts   # Webview for commit history browser
│   ├── gitContentProvider.ts      # Virtual file provider for diffs
│   └── squashEditorPanel.ts       # Panel for squash message editing
├── services/
│   ├── git.ts                # All git operations (diffs, reflog, squash, reset)
│   ├── config.ts             # YAML config reading with Zod validation
│   └── ai-providers/
│       └── fireworks.ts      # Streaming AI client (SSE)
├── types/                    # TypeScript interfaces (ai.ts, git.ts, config.ts)
└── webview/                  # React components (separate tsconfig)
    ├── reflog/               # Commit history browser UI
    └── squash-editor/        # Squash message editor UI
workers/commity-api/          # Cloudflare Worker backend API (separate)
```

### Key Patterns

**AI Provider Interface** (`src/types/ai.ts`): All AI providers implement `LLMProvider` with streaming support via `AsyncGenerator<string>`.

**Git Operations** (`src/services/git.ts`): Prefer `isomorphic-git` over spawning git commands to avoid shell escaping issues with multi-line messages. Uses native `git` CLI only where necessary (diffs, reset, cherry-pick).

**Multi-repo Support**: The extension supports VS Code workspaces with multiple git repositories. Use `entry.repoRoot` to find the correct repository:
```typescript
const repository = entry.repoRoot
  ? git.repositories.find(r => r.rootUri.fsPath === entry.repoRoot)
  : git.repositories[0];
```

**Webview Communication**: Use `vscode.postMessage` from extension to webview, `window.addEventListener("message", handler)` in webview.

**Configuration**: Users customize commit message prompts via `.commity.yaml` with template variables (`{{changes}}`, `{{branch}}`, `{{author}}`, etc.).

## Code Style

- TypeScript strict mode enabled
- Use `node:` prefix for Node built-ins (e.g., `node:fs`, `node:path`)
- camelCase for variables/functions, PascalCase for types/classes
- Prefix unused vars with `_`
- Semicolons required
- Strict equality (`===`)
- Curly braces required for all control structures

## Webview Design Language

**Use VS Code CSS variables** - Always use VS Code theme variables for colors to ensure proper theming:
- `--vscode-foreground`, `--vscode-descriptionForeground` for text
- `--vscode-button-background`, `--vscode-button-hoverBackground` for buttons
- `--vscode-input-background`, `--vscode-input-border` for inputs
- `--vscode-list-hoverBackground`, `--vscode-list-activeSelectionBackground` for list items
- `--vscode-panel-border` for borders
- `--vscode-editor-font-family` for monospace text (hashes, code)
- `--vscode-gitDecoration-addedResourceForeground` / `deletedResourceForeground` for diff stats

**Commit type color scheme** - Conventional commit types have assigned colors:
- feat: `#66bb6a` (green)
- fix: `#ef5350` (red)
- docs: `#42a5f5` (blue)
- refactor: `#ffa726` (orange)
- test: `#26a69a` (teal)
- chore: `#9e9e9e` (gray)
- ci: `#7e57c2` (purple)

**CSS Modules** - Webview components use `.module.css` files with esbuild's `local-css` loader. Use `styles.className` syntax.

**Icons** - Use VS Code codicons via `<i className="codicon codicon-{name}" />`. The codicons font is copied to `out/codicons/` at build time.

## AI Model Configuration

**DO NOT change models without explicit user instruction.**

All paths use: `accounts/fireworks/models/qwen3-235b-a22b-instruct-2507`

## Testing

Tests are co-located in `__tests__/` directories next to the code they test. Uses Jest with ts-jest. VS Code API is mocked in tests.
