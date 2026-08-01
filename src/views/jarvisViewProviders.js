const path = require('path');
const crypto = require('crypto');
const vscode = require('vscode');
const { VIEW_IDS } = require('./jarvisViewIds');

function createNonce() {
  return crypto.randomBytes(16).toString('base64');
}

class JarvisChatViewProvider {
  constructor(container) {
    this.container = container;
  }

  resolveWebviewView(webviewView) {
    try {
      const webviewManager = this.container.resolve('webviewManager');
      const assistantHost = this.container.resolve('assistantWebviewHost');

      webviewView.webview.options = {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.file(path.join(webviewManager.context.extensionPath, 'src', 'webview'))],
      };
      webviewView.webview.html = webviewManager.getAssistantHtml(webviewView.webview);
      assistantHost.wire(webviewView);
    } catch (error) {
      logViewFailure(this.container, VIEW_IDS.chat, error);
      webviewView.webview.options = { enableScripts: false };
      webviewView.webview.html = renderErrorHtml('Chat', error);
    }
  }
}

class JarvisSummaryViewProvider {
  constructor(container, definition) {
    this.container = container;
    this.definition = definition;
  }

  async resolveWebviewView(webviewView) {
    webviewView.webview.options = { enableScripts: true };
    try {
      webviewView.webview.html = await this.renderHtml(webviewView.webview);
      webviewView.webview.onDidReceiveMessage(async (message) => {
        const allowedCommands = new Set((this.definition.actions || []).map((action) => action.command));
        if (message?.type === 'jarvis:command' && allowedCommands.has(message.command)) {
          try {
            await vscode.commands.executeCommand(message.command);
          } catch (error) {
            logViewFailure(this.container, this.definition.title, error);
          }
        }
      });
    } catch (error) {
      logViewFailure(this.container, this.definition.title, error);
      webviewView.webview.html = renderErrorHtml(this.definition.title, error);
    }
  }

  async renderHtml(webview) {
    const state = await this.definition.getState?.(this.container);
    const actions = this.definition.actions || [];
    const cards = this.definition.cards || [];
    const nonce = createNonce();
    const csp = [
      "default-src 'none'",
      `style-src 'nonce-${nonce}'`,
      `script-src 'nonce-${nonce}'`,
      `img-src ${webview.cspSource} https: data:`,
    ].join('; ');

    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      `  <meta http-equiv="Content-Security-Policy" content="${escapeAttribute(csp)}" />`,
      `  <title>${escapeHtml(this.definition.title)}</title>`,
      `  <style nonce="${escapeAttribute(nonce)}">`,
      viewCss(),
      '  </style>',
      '</head>',
      '<body>',
      '  <main class="view-shell">',
      `    <h1>${escapeHtml(this.definition.title)}</h1>`,
      `    <p class="lead">${escapeHtml(this.definition.description)}</p>`,
      state ? `    <section class="state">${renderState(state)}</section>` : '',
      `    <section class="actions">${actions.map(renderAction).join('')}</section>`,
      `    <section class="cards">${cards.map(renderCard).join('')}</section>`,
      '  </main>',
      `  <script nonce="${escapeAttribute(nonce)}">`,
      '    const vscode = acquireVsCodeApi();',
      '    document.addEventListener("click", (event) => {',
      '      const button = event.target.closest("[data-command]");',
      '      if (button) vscode.postMessage({ type: "jarvis:command", command: button.dataset.command });',
      '    });',
      '  </script>',
      '</body>',
      '</html>',
    ].join('\n');
  }
}

function logViewFailure(container, viewName, error) {
  try {
    container.resolve('loggingService')?.error?.(`Jarvis view failed to initialize: ${viewName}`, {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  } catch {
    // Avoid turning error reporting into another view initialization failure.
  }
}

function renderErrorHtml(title, error) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `  <title>${escapeHtml(title)}</title>`,
    '  <style>',
    viewCss(),
    '  </style>',
    '</head>',
    '<body>',
    '  <main class="view-shell">',
    `    <h1>${escapeHtml(title)}</h1>`,
    '    <p class="lead">Jarvis could not initialize this view.</p>',
    '    <section class="state">',
    '      <div class="state-row">',
    '        <span>Error</span>',
    `        <strong>${escapeHtml(message)}</strong>`,
    '      </div>',
    '    </section>',
    '  </main>',
    '</body>',
    '</html>',
  ].join('\n');
}

function createJarvisViewProviders(container) {
  return {
    [VIEW_IDS.chat]: new JarvisChatViewProvider(container),
    [VIEW_IDS.workspace]: new JarvisSummaryViewProvider(container, {
      title: 'Workspace',
      description: 'Index, summarize, and search the active project.',
      actions: [
        { label: 'Index Workspace', command: 'nidhish-jarvis.indexWorkspace' },
        { label: 'Reindex Workspace', command: 'nidhish-jarvis.reindexWorkspace' },
        { label: 'Explain Project', command: 'nidhish-jarvis.explainProject' },
        { label: 'Semantic Search', command: 'nidhish-jarvis.searchWorkspace' },
        { label: 'Find Symbol', command: 'nidhish-jarvis.findSymbol' },
      ],
      getState: async (c) => {
        const workspaceManager = c.resolve('workspaceManager');
        const index = workspaceManager.currentIndex;
        return index ? [
          ['Project', index.project.name],
          ['Type', index.project.type],
          ['Indexed files', String(index.totals.indexedFiles)],
          ['Languages', index.project.languages.map((entry) => entry.language).join(', ') || 'Unknown'],
        ] : [
          ['Status', 'Workspace not indexed yet'],
          ['Next step', 'Run Index Workspace'],
        ];
      },
      cards: [
        { title: 'Project Graph', body: 'Local imports are mapped during indexing for cross-file understanding.' },
        { title: 'Architecture', body: 'Jarvis detects source, service, provider, core, test, and webview layers.' },
      ],
    }),
    [VIEW_IDS.search]: new JarvisSummaryViewProvider(container, {
      title: 'Search',
      description: 'Search indexed files and symbols in the active workspace.',
      actions: [
        { label: 'Search Workspace', command: 'nidhish-jarvis.searchWorkspace' },
        { label: 'Find Symbol', command: 'nidhish-jarvis.findSymbol' },
        { label: 'Explain Symbol', command: 'nidhish-jarvis.explainSymbol' },
        { label: 'Find References', command: 'nidhish-jarvis.findReferences' },
      ],
      getState: async (c) => {
        const workspaceManager = c.resolve('workspaceManager');
        const index = workspaceManager.currentIndex;
        return index ? [
          ['Index', `${index.totals.indexedFiles} files ready`],
          ['Symbols', String(index.symbolIndex.length)],
          ['Relationships', String(index.graph.edges.length)],
        ] : [
          ['Index', 'Workspace not indexed yet'],
          ['Next step', 'Run Search Workspace to index and search'],
        ];
      },
      cards: [
        { title: 'Hybrid Search', body: 'Search currently ranks file names, summaries, imports, symbols, comments, and code text.' },
        { title: 'Symbol Navigation', body: 'Symbol search returns indexed names with file and line metadata.' },
      ],
    }),
    [VIEW_IDS.files]: new JarvisSummaryViewProvider(container, {
      title: 'Files',
      description: 'Inspect indexed source files and local relationship coverage.',
      actions: [
        { label: 'Index Workspace', command: 'nidhish-jarvis.indexWorkspace' },
        { label: 'Reindex Workspace', command: 'nidhish-jarvis.reindexWorkspace' },
        { label: 'Explain Project', command: 'nidhish-jarvis.explainProject' },
      ],
      getState: async (c) => {
        const workspaceManager = c.resolve('workspaceManager');
        const index = workspaceManager.currentIndex;
        if (!index) {
          return [
            ['Files', 'Workspace not indexed yet'],
            ['Next step', 'Run Index Workspace'],
          ];
        }

        const topLanguages = index.project.languages
          .slice(0, 3)
          .map((entry) => `${entry.language} (${entry.count})`)
          .join(', ');
        return [
          ['Indexed files', String(index.totals.indexedFiles)],
          ['Total scanned', String(index.totals.files)],
          ['Top languages', topLanguages || 'Unknown'],
          ['Import links', String(index.graph.edges.length)],
        ];
      },
      cards: [
        { title: 'Ignored Folders', body: 'Jarvis skips dependency, build, cache, and VCS folders during indexing.' },
        { title: 'File Metadata', body: 'Indexed files include language, summary, imports, exports, symbols, and line counts.' },
      ],
    }),
    [VIEW_IDS.memory]: new JarvisSummaryViewProvider(container, {
      title: 'Memory',
      description: 'Review what Jarvis can retain and control memory behavior.',
      actions: [
        { label: 'Remember Project Fact', command: 'nidhish-jarvis.rememberProjectFact' },
        { label: 'Search Memory', command: 'nidhish-jarvis.searchMemory' },
        { label: 'Clear Memory', command: 'nidhish-jarvis.clearMemory' },
      ],
      getState: async (c) => {
        const memoryManager = c.resolve('memoryManager');
        const entries = memoryManager.list();
        return [
          ['Status', memoryManager.enabled ? 'Enabled' : 'Disabled'],
          ['Entries', String(entries.length)],
          ['Project memories', String(entries.filter((entry) => entry.type === 'project').length)],
        ];
      },
      cards: [
        { title: 'Conversation Memory', body: 'Chat history is retained separately by the conversation manager.' },
        { title: 'Project Memory', body: 'Project facts can be saved, searched, deleted, or cleared without storing provider secrets.' },
      ],
    }),
    [VIEW_IDS.agents]: new JarvisSummaryViewProvider(container, {
      title: 'Agents',
      description: 'Run focused Jarvis workflows as they become available.',
      actions: [
        { label: 'Run Agent', command: 'nidhish-jarvis.runAgent' },
      ],
      getState: async (c) => {
        const agents = c.resolve('agentManager').list();
        return [
          ['Registered agents', String(agents.length)],
          ['Available', agents.map((agent) => agent.id).join(', ')],
        ];
      },
      cards: [
        { title: 'Shared Runtime', body: 'Agents reuse the Context Builder and provider layer.' },
        { title: 'Safety', body: 'Agents route source modifications through safe edit and diff approval flows.' },
      ],
    }),
    [VIEW_IDS.git]: new JarvisSummaryViewProvider(container, {
      title: 'Git',
      description: 'Inspect repository state and prepare safe Git assistance.',
      actions: [
        { label: 'Show Git Status', command: 'nidhish-jarvis.showGitStatus' },
        { label: 'Explain Git Changes', command: 'nidhish-jarvis.explainGitChanges' },
        { label: 'Generate Commit Message', command: 'nidhish-jarvis.generateCommitMessage' },
      ],
      cards: [
        { title: 'Repository State', body: 'Jarvis reads Git status and diffs without running destructive Git operations.' },
        { title: 'Change Summaries', body: 'Jarvis can explain diffs and generate commit-message suggestions from local changes.' },
      ],
    }),
    [VIEW_IDS.terminal]: new JarvisSummaryViewProvider(container, {
      title: 'Terminal',
      description: 'Prepare command assistance with explicit safety boundaries.',
      cards: [
        { title: 'Safe Execution', body: 'Jarvis does not run terminal commands from this view yet.' },
        { title: 'Diagnostics', body: 'Terminal-output analysis is not enabled until a capture and approval model is added.' },
      ],
    }),
    [VIEW_IDS.models]: new JarvisSummaryViewProvider(container, {
      title: 'Models',
      description: 'Review the active provider and model configuration.',
      actions: [
        { label: 'Open VS Code Settings', command: 'workbench.action.openSettings' },
      ],
      getState: async (c) => {
        const configurationService = c.resolve('configurationService');
        return [
          ['Provider', configurationService.get('provider')],
          ['Model', configurationService.get('model')],
          ['Ollama URL', configurationService.get('ollama.baseUrl')],
          ['Streaming', String(configurationService.get('streaming'))],
        ];
      },
      cards: [
        { title: 'Local First', body: 'Ollama is the default provider and is checked by the chat view before sending requests.' },
        { title: 'Secrets', body: 'No cloud API keys are stored by the current provider implementation.' },
      ],
    }),
    [VIEW_IDS.settings]: new JarvisSummaryViewProvider(container, {
      title: 'Settings',
      description: 'Configure providers, models, memory, streaming, and workspace behavior.',
      actions: [
        { label: 'Open VS Code Settings', command: 'workbench.action.openSettings' },
      ],
      getState: async (c) => {
        const configurationService = c.resolve('configurationService');
        return [
          ['Provider', configurationService.get('provider')],
          ['Model', configurationService.get('model')],
          ['Streaming', String(configurationService.get('streaming'))],
          ['Memory', configurationService.get('memoryEnabled') ? 'Enabled' : 'Disabled'],
        ];
      },
    }),
  };
}

function renderAction(action) {
  return `<button type="button" data-command="${escapeAttribute(action.command)}">${escapeHtml(action.label)}</button>`;
}

function renderCard(card) {
  return [
    '<article class="card">',
    `  <h2>${escapeHtml(card.title)}</h2>`,
    `  <p>${escapeHtml(card.body)}</p>`,
    '</article>',
  ].join('');
}

function renderState(rows) {
  return rows.map(([label, value]) => [
    '<div class="state-row">',
    `  <span>${escapeHtml(label)}</span>`,
    `  <strong>${escapeHtml(value || 'None')}</strong>`,
    '</div>',
  ].join('')).join('');
}

function viewCss() {
  return `
    :root {
      color-scheme: light dark;
      --bg: var(--vscode-sideBar-background, var(--vscode-editor-background));
      --fg: var(--vscode-sideBar-foreground, var(--vscode-editor-foreground));
      --muted: var(--vscode-descriptionForeground);
      --border: var(--vscode-panel-border, var(--vscode-input-border));
      --surface: var(--vscode-editorWidget-background, var(--vscode-input-background));
      --button-bg: var(--vscode-button-background);
      --button-fg: var(--vscode-button-foreground);
      --button-hover: var(--vscode-button-hoverBackground);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .view-shell {
      display: grid;
      gap: 12px;
      padding: 14px;
    }
    h1, h2, p { margin: 0; letter-spacing: 0; }
    h1 { font-size: 16px; font-weight: 650; }
    h2 { font-size: 13px; font-weight: 650; }
    .lead, .card p { color: var(--muted); line-height: 1.45; }
    .actions { display: grid; gap: 8px; }
    button {
      min-height: 30px;
      padding: 0 10px;
      border: 0;
      border-radius: 6px;
      background: var(--button-bg);
      color: var(--button-fg);
      cursor: pointer;
      font: inherit;
      text-align: center;
    }
    button:hover { background: var(--button-hover); }
    .state, .cards { display: grid; gap: 8px; }
    .state {
      padding: 8px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
    }
    .state-row {
      display: grid;
      grid-template-columns: minmax(80px, 0.8fr) minmax(0, 1.2fr);
      gap: 8px;
      padding: 5px 0;
      border-bottom: 1px solid var(--border);
    }
    .state-row:last-child { border-bottom: 0; }
    .state-row span { color: var(--muted); }
    .state-row strong {
      min-width: 0;
      overflow-wrap: anywhere;
      font-weight: 600;
    }
    .card {
      display: grid;
      gap: 5px;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
    }
  `;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

module.exports = { VIEW_IDS, createJarvisViewProviders };
