const assert = require('assert');
const Module = require('module');
const path = require('path');
const { AIService } = require('../src/services/aiService');

let createdPanel;
const originalLoad = Module._load;
Module._load = function loadWithVscodeMock(request, parent, isMain) {
  if (request === 'vscode') {
    return {
      Uri: {
        file(fsPath) {
          return { fsPath };
        },
      },
      ViewColumn: { One: 1 },
      window: {
        createWebviewPanel(_id, _title, _column, options) {
          createdPanel = { webview: { options }, onDidDispose() {} };
          return createdPanel;
        },
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { WebviewManager } = require('../src/core/webviewManager');
Module._load = originalLoad;

suite('Security hardening', () => {
  test('assistant webview uses a restrictive CSP with nonce-based scripts', () => {
    const manager = new WebviewManager({ extensionPath: path.join(__dirname, '..') });
    const webview = {
      cspSource: 'vscode-webview://jarvis',
      asWebviewUri(uri) {
        return { toString: () => `vscode-resource:${uri.fsPath.replace(/\\/g, '/')}` };
      },
    };

    const html = manager.getAssistantHtml(webview);

    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /default-src 'none'/);
    assert.match(html, /script-src 'nonce-[^']+'/);
    assert.match(html, /<script nonce="[^"]+" src="vscode-resource:/);
    assert.doesNotMatch(html, /<!-- JARVIS_CSP -->/);
  });

  test('panel webviews preserve packaged local resource roots', () => {
    const manager = new WebviewManager({ extensionPath: path.join(__dirname, '..') });
    const roots = [{ fsPath: path.join(__dirname, '..', 'src', 'webview') }];
    manager.createPanel('test-panel', 'Test', 1, {
      enableScripts: true,
      localResourceRoots: roots,
    });

    assert.strictEqual(createdPanel.webview.options.enableScripts, true);
    assert.deepStrictEqual(createdPanel.webview.options.localResourceRoots, roots);
  });

  test('AI service does not log raw prompt contents', async () => {
    const prompt = 'secret api key should not be logged';
    let logDetails = null;
    const service = new AIService({
      async create() {
        return { generate: async () => ({ content: 'ok' }) };
      },
    }, {
      info(_message, details) {
        logDetails = details;
      },
    }, {
      get() {
        return 'ollama';
      },
      getAll() {
        return {};
      },
    });

    await service.ask(prompt);

    assert.strictEqual(logDetails.provider, 'ollama');
    assert.strictEqual(logDetails.inputLength, prompt.length);
    assert.deepStrictEqual(Object.keys(logDetails).sort(), ['inputLength', 'provider']);
  });
});
