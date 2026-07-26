const path = require('path');
const vscode = require('vscode');
const { VIEW_IDS } = require('./jarvisViewIds');

class JarvisChatViewProvider {
  constructor(container) {
    this.container = container;
  }

  resolveWebviewView(webviewView) {
    const webviewManager = this.container.resolve('webviewManager');
    const assistantHost = this.container.resolve('assistantWebviewHost');

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(webviewManager.context.extensionPath, 'src', 'webview'))],
    };
    webviewView.webview.html = webviewManager.getAssistantHtml(webviewView.webview);
    assistantHost.wire(webviewView);
  }
}

class JarvisSummaryViewProvider {
  constructor(container, definition) {
    this.container = container;
    this.definition = definition;
  }

  async resolveWebviewView(webviewView) {
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = await this.renderHtml();
    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message?.type === 'jarvis:command' && message.command) {
        await vscode.commands.executeCommand(message.command);
      }
    });
  }

  async renderHtml() {
    const state = await this.definition.getState?.(this.container);
    const actions = this.definition.actions || [];
    const cards = this.definition.cards || [];

    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8" />',
      '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
      `  <title>${escapeHtml(this.definition.title)}</title>`,
      '  <style>',
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
      '  <script>',
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

function createJarvisViewProviders(container) {
  return {
    [VIEW_IDS.chat]: new JarvisChatViewProvider(container),
    [VIEW_IDS.workspace]: new JarvisSummaryViewProvider(container, {
      title: 'Workspace',
      description: 'Index, summarize, and search the active project.',
      actions: [
        { label: 'Index Workspace', command: 'nidhish-jarvis.indexWorkspace' },
        { label: 'Explain Project', command: 'nidhish-jarvis.explainProject' },
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
    [VIEW_IDS.memory]: new JarvisSummaryViewProvider(container, {
      title: 'Memory',
      description: 'Conversation, project, and user memory will live here as Jarvis learns preferences.',
      cards: [
        { title: 'Conversation Memory', body: 'Chat history is retained by the existing conversation manager.' },
        { title: 'Workspace Memory', body: 'Project architecture and conventions are ready for the next memory milestone.' },
      ],
    }),
    [VIEW_IDS.agents]: new JarvisSummaryViewProvider(container, {
      title: 'Agents',
      description: 'Specialized coding, review, debugging, testing, and documentation agents.',
      cards: [
        { title: 'Coding Agent', body: 'Plans and implements tasks through the assistant core.' },
        { title: 'Review Agent', body: 'Reviews code, tests, and security posture in a future milestone.' },
      ],
    }),
    [VIEW_IDS.git]: new JarvisSummaryViewProvider(container, {
      title: 'Git',
      description: 'Natural-language Git workflows, commit summaries, and diff explanations.',
      cards: [
        { title: 'Repository State', body: 'Git commands will be routed through approved command flows.' },
        { title: 'Change Summaries', body: 'Jarvis will generate commit messages and PR summaries.' },
      ],
    }),
    [VIEW_IDS.terminal]: new JarvisSummaryViewProvider(container, {
      title: 'Terminal',
      description: 'Command suggestions, approved execution, log explanation, and background tasks.',
      cards: [
        { title: 'Safe Execution', body: 'Commands will require user approval before running.' },
        { title: 'Diagnostics', body: 'Terminal output will feed debugging and fix suggestions.' },
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
