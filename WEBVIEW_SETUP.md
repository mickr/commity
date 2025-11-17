# Webview Infrastructure Setup

This document describes the webview infrastructure added to support the Reflog panel.

## Architecture

The webview system consists of three main components:

### 1. Provider (`src/providers/reflogWebviewProvider.ts`)
- Implements `vscode.WebviewViewProvider`
- Manages lifecycle of the webview panel
- Handles communication between extension and webview
- Fetches reflog data from git service

### 2. Webview UI (`src/webview/`)
- **reflog.ts**: Client-side TypeScript for interactivity
- **reflog.css**: Styles following VS Code theming
- **vscode.d.ts**: Type definitions for webview API
- **tsconfig.json**: Separate TypeScript config for DOM environment

### 3. Build Configuration
- `esbuild.js` builds both extension and webview code
- Extension: Node.js target (CommonJS)
- Webview: Browser target (IIFE)
- CSS files are copied during build

## Message Passing

### Extension → Webview
```typescript
webview.postMessage({ 
  type: "reflogData", 
  entries: ReflogEntry[] 
});
```

### Webview → Extension
```typescript
vscode.postMessage({ 
  type: "refresh" | "selectEntry" | "resetToEntry",
  entry?: ReflogEntry 
});
```

## Features Implemented

- ✅ Display reflog entries with hash, selector, message, and timestamp
- ✅ Entry selection with checkboxes
- ✅ Hover actions for reset buttons
- ✅ Relative timestamp formatting
- ✅ Refresh functionality
- ✅ VS Code theme integration

## Next Steps

To enhance the reflog webview for squashing capabilities:

1. **Multi-selection UI**: Add visual indicators for selected commit ranges
2. **Squash action**: Implement squash button when multiple commits selected
3. **Commit range validation**: Ensure contiguous selection
4. **Interactive squash dialog**: Allow editing commit message in webview
5. **Diff preview**: Show combined diff for selected commits
6. **Drag-and-drop reordering**: Reorder commits before squashing

## Development

Build the extension:
```bash
npm run compile
```

Watch mode:
```bash
npm run watch
```

Test in VS Code:
- Press F5 to launch Extension Development Host
- Open Commity sidebar
- View the Reflog panel
