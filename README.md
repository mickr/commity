# Commity

AI-powered commit message generator that analyzes your staged changes and generates meaningful commit messages following best practices.

## Features

- **One-Click Generation**: Generate commit messages instantly from the Source Control toolbar
- **Context-Aware**: Analyzes your staged changes, current branch, and author information
- **Customizable**: Configure commit message format using `.commity.yaml`
- **Conventional Commits**: Supports Conventional Commits specification out of the box

## Usage

1. Stage your changes in the Source Control view
2. Click the robot icon (🤖) in the Source Control toolbar
3. Review and edit the generated commit message
4. Commit as usual

## Configuration

Create a `.commity.yaml` file in your project root to customize the commit message format:

```yaml
commitMessagePrompt: |
  Generate a commit message following the Conventional Commits specification.

  Format: <type>(<scope>): <subject>

  Types:
  - feat: A new feature
  - fix: A bug fix
  - docs: Documentation only changes
  - style: Code style changes
  - refactor: Code change that neither fixes a bug nor adds a feature
  - perf: Performance improvement
  - test: Adding or updating tests
  - chore: Changes to build process or auxiliary tools

  Changes: {{changes}}
  Branch: {{branch}}
  Author: {{author}}
```

### Template Variables

Use these variables in your prompt to inject context:

- **`{{changes}}`** - Full diff of staged changes (file paths and diffs)
- **`{{branch}}`** - Current Git branch name
- **`{{author}}`** - Current Git author (name and email)

Example usage:

```yaml
commitMessagePrompt: |
  You are generating a commit for {{author}} on branch {{branch}}.

  Analyze these changes and create a concise commit message:
  {{changes}}

  Keep it under 50 characters and use imperative mood.
```

## Requirements

- VS Code 1.80.0 or higher
- Git repository

## License

MIT
