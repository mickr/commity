# Commity.ai

Lightning-fast AI commit messages. Smart, instant, and context-aware.

Generate meaningful commit messages in milliseconds by analyzing your staged changes with advanced AI. Built for developers who value speed and quality.

## Features

- **Lightning Fast**: Sub-second commit message generation
- **Smart Analysis**: Deep understanding of code changes and context
- **One-Click Generation**: Instant messages from the Source Control toolbar
- **Context-Aware**: Analyzes staged changes, branch, and author information
- **Customizable**: Configure message format using `.commity.yaml`
- **Conventional Commits**: Supports Conventional Commits specification out of the box

## Usage

1. Stage your changes in the Source Control view
2. Click the robot icon (🤖) in the Source Control toolbar
3. Review and edit the generated commit message
4. Commit as usual

## Configuration

Create a `.commity.yaml` file in your project root to customize the commit message format. See [commity.example.yaml](commity.example.yaml) for a complete example.

### Example Configuration

```yaml
commitMessagePrompt: |
  You will be generating a Git commit message based on file changes presented in unified diff format.
  
  Your task is to analyze these changes and generate a commit message that describes what was modified, added, or removed. Focus on the user-visible purpose and logical intent of the changes.
  
  Consider:
  - What functionality is being added, modified, or removed?
  - Are these bug fixes, new features, refactoring, or maintenance changes?
  - Group related changes by logical intent rather than listing every file
  
  Output format:
  Use Conventional Commits specification: <type>(<scope>): <subject>
  
  If the branch: {{branch}}, contains a JIRA ticket ID (pattern: case-insensitive match of letters followed by dash and numbers, like WEBAPP-000 or webapp-000), extract the ticket ID and postfix the commit message with (TICKET-ID) in uppercase.
  Example: feat(ui): add commit generation button (WEBAPP-000)
  
  Types:
  - feat: A new feature
  - fix: A bug fix
  - docs: Documentation only changes
  - style: Code style changes (formatting, missing semi colons, etc)
  - refactor: Code change that neither fixes a bug nor adds a feature
  - perf: Performance improvement
  - test: Adding or updating tests
  - chore: Changes to build process or auxiliary tools
  - ci: CI/CD changes
  
  Scopes (customize to your project): api, ui, core, config, docs
  
  Guidelines:
  - Use imperative mood (e.g., "add feature" not "added feature")
  - Don't capitalize first letter of subject (except for proper nouns)
  - No period at the end of subject line
  - Keep subject under 72 characters
  - Focus on what the change accomplishes, not how it was implemented
  - Optionally add bullet points after a blank line for significant changes
  - Each bullet starts with "- ", capitalized, no trailing period
  - Never sign the commit or state it was generated with an LLM
  
  Context:
  Author: {{author}}
  Changes: {{changes}}
  Branch: {{branch}}
  
  Return only the commit message without any additional text, explanations, or formatting.
```

### Template Variables

Use these variables in your prompt to inject context:

**Basic Variables:**
- **`{{changes}}`** - Full diff of staged changes (file paths and diffs)
- **`{{branch}}`** - Current Git branch name
- **`{{author}}`** - Current Git author (name and email)

**Statistics Variables:**
- **`{{fileCount}}`** - Number of files changed
- **`{{linesAdded}}`** - Total lines added (+)
- **`{{linesRemoved}}`** - Total lines removed (-)
- **`{{fileTypes}}`** - Comma-separated list of file extensions (e.g., ".ts, .js, .md")
- **`{{changedFolders}}`** - Comma-separated list of modified directories
- **`{{files}}`** - Comma-separated list of changed file paths

Example usage:

```yaml
commitMessagePrompt: |
  You are generating a commit for {{author}} on branch {{branch}}.
  
  Scope: {{fileCount}} files changed ({{fileTypes}})
  Stats: +{{linesAdded}}/-{{linesRemoved}}
  Areas: {{changedFolders}}

  Analyze these changes and create a concise commit message:
  {{changes}}

  Keep it under 50 characters and use imperative mood.
```

## Development

### Building

The extension includes version-aware build commands:

```bash
npm run build:patch  # Increments patch version (0.0.1 → 0.0.2)
npm run build:minor  # Increments minor version (0.0.1 → 0.1.0)
npm run build:major  # Increments major version (0.0.1 → 1.0.0)
```

Each command:

1. Bumps the version in `package.json`
2. Runs type checking and production build
3. Packages the extension as a `.vsix` file

### Manual Version Control

```bash
npm run version:patch  # Just bump version, no build
npm run version:minor
npm run version:major
```

## Requirements

- VS Code 1.80.0 or higher
- Git repository

## License

MIT
