# Commity.ai - VS Code Extension for AI Commit Messages

## Commands

- **Build**: `npm run package` (type checks + production build)
- **Compile**: `npm run compile` (type checks + dev build)
- **Type check**: `npm run check-types`
- **Lint**: `npm run lint`
- **Test all**: `npm run test`
- **Test single file**: `npm run test path/to/file.test.ts`
- **Test watch mode**: `npm run test:watch`

## Architecture

- **Extension entry**: `src/extension.ts` - activates the VS Code extension and registers commands
- **Commands**: `src/commands/` - user-facing commands (e.g., `generateCommitMessage`)
- **Services**: `src/services/` - core logic (git operations, config reading, AI providers)
- **Workers**: `workers/commity-api/` - separate Cloudflare Worker for backend API
- **Types**: `src/types/` - TypeScript interfaces and Zod schemas
- Uses VS Code Git extension API for repository interactions
- AI providers in `src/services/ai-providers/` (Fireworks, mock)
- **Git operations**: Prefer `isomorphic-git` over spawning git commands to avoid shell escaping issues with multi-line messages

## AI Model Configuration

- **IMPORTANT**: DO NOT change models without explicit user instruction
- **All paths**: `accounts/fireworks/models/qwen3-235b-a22b-instruct-2507`
- No GPT-OSS or reasoning models should be used

## Code Style

- **Language**: TypeScript with strict mode enabled
- **Imports**: Use named imports, prefer `node:` prefix for Node built-ins (e.g., `node:fs`, `node:path`)
- **Naming**: camelCase for variables/functions, PascalCase for types/classes
- **Unused vars**: Prefix with `_` to ignore warnings
- **Semicolons**: Required (enforced by ESLint)
- **Equality**: Use strict equality (`===`)
- **Curly braces**: Required for all control structures
- **Error handling**: Use try/catch, avoid `throw` of non-Error objects
- **React and Webviews**: Prefer standard React patterns and conventions in TSX files (e.g., functional components, hooks, event handling via props)

## Webview

- **Message Passing**: Use `vscode.postMessage` to send messages from the extension to the webview and `window.addEventListener("message", handleMessage)` to handle messages in the webview.
- **Focus Management**: Use `vscode.commands.executeCommand("commity.reflog.focusUp")` to focus the up arrow key and `vscode.commands.executeCommand("commity.reflog.focusDown")` to focus the down arrow key.
- **Selection Management**: Use `vscode.commands.executeCommand("commity.reflog.select")` to select the current focused item.

## React

- **Components**: Use functional components and hooks.
- **Event Handling**: Use event handling via props.
- **State Management**: Use useState, useEffect, and useCallback.
- **Context**: Use React Context for state management.
- **Hooks**: Use React Hooks for state management.
