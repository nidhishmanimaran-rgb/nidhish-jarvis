const assert = require('assert');
const Module = require('module');
const packageManifest = require('../package.json');

const registeredProviders = [];
const registeredCommands = [];
const fakeVscode = {
  StatusBarAlignment: { Left: 1 },
  ViewColumn: { One: 1 },
  Uri: {
    file: (fsPath) => ({ fsPath, scheme: 'file' }),
    joinPath: (base, ...parts) => ({ fsPath: [base?.fsPath, ...parts].filter(Boolean).join('/') }),
  },
  window: {
    registerWebviewViewProvider(viewId, provider) {
      registeredProviders.push({ viewId, provider });
      return { dispose() {} };
    },
    createStatusBarItem() {
      return {
        show() {},
        dispose() {},
      };
    },
    createWebviewPanel() {
      return {
        webview: createWebview(),
        onDidDispose() {},
      };
    },
    showInputBox: async () => undefined,
    showQuickPick: async () => undefined,
    showWarningMessage: async () => undefined,
  },
  workspace: {
    workspaceFolders: undefined,
    createFileSystemWatcher() {
      return {
        onDidCreate() {},
        onDidChange() {},
        onDidDelete() {},
        dispose() {},
      };
    },
    fs: {
      writeFile: async () => {},
    },
    getWorkspaceFolder: () => null,
  },
  commands: {
    registerCommand(commandId) {
      registeredCommands.push(commandId);
      return { dispose() {} };
    },
    executeCommand: async () => undefined,
  },
};

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'vscode') {
    return fakeVscode;
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { VIEW_IDS, createJarvisViewProviders } = require('../src/views/jarvisViewProviders');
const { activate } = require('../src/bootstrap');

function createWebview() {
  return {
    cspSource: 'vscode-resource:',
    options: {},
    html: '',
    asWebviewUri(uri) {
      return { toString: () => `vscode-resource:${uri.fsPath}` };
    },
    onDidReceiveMessage() {
      return { dispose() {} };
    },
    postMessage: async () => true,
  };
}

function createContext() {
  const storage = {
    get: () => undefined,
    update: async () => {},
  };
  return {
    subscriptions: [],
    extensionPath: 'D:/Extension/nidhish-jarvis',
    globalStorageUri: { fsPath: 'D:/Extension/nidhish-jarvis/.storage' },
    workspaceState: storage,
    globalState: storage,
    secrets: {
      store: async () => {},
      get: async () => undefined,
      delete: async () => {},
    },
  };
}

function createContainer(overrides = {}) {
  const services = {
    loggingService: { error() {} },
    workspaceManager: {
      currentIndex: null,
      indexWorkspace() {
        throw new Error('indexing should be lazy');
      },
    },
    memoryManager: {
      enabled: true,
      list: () => [],
    },
    agentManager: {
      list: () => [{ id: 'review', name: 'Review', intent: 'Review code' }],
    },
    configurationService: {
      get(key) {
        return {
          provider: 'ollama',
          model: 'qwen2.5-coder:3b',
          'ollama.baseUrl': 'http://127.0.0.1:11434',
          streaming: true,
          memoryEnabled: true,
        }[key];
      },
    },
    ...overrides,
  };
  return {
    resolve(name) {
      if (!(name in services)) {
        throw new Error(`missing ${name}`);
      }
      return services[name];
    },
  };
}

suite('Sidebar runtime integration', () => {
  setup(() => {
    registeredProviders.length = 0;
    registeredCommands.length = 0;
  });

  test('every manifest Jarvis view has a matching provider registration', () => {
    const manifestIds = packageManifest.contributes.views['nidhish-jarvis'].map((view) => view.id);
    const providers = createJarvisViewProviders(createContainer());

    assert.deepStrictEqual(Object.keys(providers), manifestIds);
  });

  test('explicit activation events cover every Jarvis sidebar view', () => {
    const activationEvents = new Set(packageManifest.activationEvents);
    Object.values(VIEW_IDS).forEach((viewId) => {
      assert.ok(activationEvents.has(`onView:${viewId}`), viewId);
    });
  });

  test('activation completes without a workspace or provider network availability', () => {
    const originalFetch = global.fetch;
    global.fetch = async () => {
      throw new Error('network unavailable');
    };
    try {
      assert.doesNotThrow(() => activate(createContext()));
      assert.deepStrictEqual(
        registeredProviders.map((entry) => entry.viewId),
        packageManifest.contributes.views['nidhish-jarvis'].map((view) => view.id),
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  test('sidebar provider resolution does not require workspace indexing', async () => {
    const providers = createJarvisViewProviders(createContainer());
    const view = { webview: createWebview() };

    await providers[VIEW_IDS.search].resolveWebviewView(view);

    assert.match(view.webview.html, /Workspace not indexed yet/);
  });

  test('provider initialization failures are rendered instead of leaving a loading view', async () => {
    const providers = createJarvisViewProviders(createContainer({
      memoryManager: {
        list() {
          throw new Error('memory unavailable');
        },
      },
    }));
    const view = { webview: createWebview() };

    await providers[VIEW_IDS.memory].resolveWebviewView(view);

    assert.match(view.webview.html, /Jarvis could not initialize this view/);
    assert.match(view.webview.html, /memory unavailable/);
  });
});
