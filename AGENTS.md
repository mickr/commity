# Commity.ai - VS Code Extension for AI Commit Messages

## Commands
- **Build**: `pnpm run package` (type checks + production build)
- **Compile**: `pnpm run compile` (type checks + dev build)
- **Type check**: `pnpm run check-types`
- **Lint**: `pnpm run lint`
- **Test all**: `pnpm run test`
- **Test single file**: `pnpm run test path/to/file.test.ts`
- **Test watch mode**: `pnpm run test:watch`

## Architecture
- **Extension entry**: `src/extension.ts` - activates the VS Code extension and registers commands
- **Commands**: `src/commands/` - user-facing commands (e.g., `generateCommitMessage`)
- **Services**: `src/services/` - core logic (git operations, config reading, AI providers)
- **Workers**: `workers/commity-api/` - separate Cloudflare Worker for backend API
- **Types**: `src/types/` - TypeScript interfaces and Zod schemas
- Uses VS Code Git extension API for repository interactions
- AI providers in `src/services/ai-providers/` (Fireworks, mock)

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
