const { spawn } = require('child_process');

function ensureDisposed(disposables = []) {
  for (const d of disposables) {
    try {
      d?.dispose?.();
    } catch {
      // ignore
    }
  }
}

const SUPPORTED_MODELS = new Set([
  'qwen2.5-coder:3b',
  'qwen2.5-coder:latest',
  'llama3.2:3b',
  'mistral:7b',
  'deepseek-r1:8b',
]);

function parseModelsResponse(body) {
  if (Array.isArray(body?.models)) {
    return body.models
      .map((item) => (typeof item === 'string' ? item : item?.name || item?.tag || item?.id))
      .filter(Boolean);
  }

  if (Array.isArray(body?.tags)) {
    return body.tags
      .map((item) => (typeof item === 'string' ? item : item?.name || item?.tag || item?.id))
      .filter(Boolean);
  }

  return [];
}

function getRequestConfig(message) {
  const source = message.config && typeof message.config === 'object' ? message.config : {};
  const requestedModel = typeof message.model === 'string' ? message.model : source.model;
  const config = {};

  if (requestedModel) {
    if (!SUPPORTED_MODELS.has(requestedModel)) {
      throw new Error(`Model "${requestedModel}" is not supported by Jarvis.`);
    }
    config.model = requestedModel;
  }

  if (typeof source.temperature === 'number') {
    config.temperature = source.temperature;
  }

  if (typeof source.maxTokens === 'number') {
    config.maxTokens = source.maxTokens;
  }

  if (typeof source.streaming === 'boolean') {
    config.streaming = source.streaming;
  }

  return Object.keys(config).length ? config : undefined;
}


/**
 * Create assistant webview panel and wire message passing.
 * Uses vscode.commands / dependency injection indirectly via passed bootstrap container.
 */
class AssistantWebviewHost {
  constructor(container) {
    this.container = container;
    this.panel = null;
    this.disposables = [];
    this.activeController = null;
  }

  open() {
    const webviewManager = this.container.resolve('webviewManager');
    // openAssistantPanel returns the panel instance created by WebviewManager
    const panel = webviewManager.openAssistantPanel();
    this.panel = panel;

    this.wire(panel);
    return panel;
  }

  wire(panel) {
    ensureDisposed(this.disposables);
    this.disposables = [];

    const aiService = this.container.resolve('aiService');

    const disposable = panel.webview.onDidReceiveMessage(async (message) => {
      if (!message || typeof message !== 'object') return;

      if (message.type === 'assistant:models') {
        await this.postModelStatus(panel);
        return;
      }

      if (message.type === 'assistant:startOllama') {
        this.startOllama(panel);
        return;
      }

      if (message.type === 'assistant:stop') {
        this.activeController?.abort?.();
        return;
      }

      if (message.type === 'assistant:ask') {
        const text = message.value;
        const controller = new AbortController();
        this.activeController = controller;
        let full = '';

        try {
          // Tell UI to start streaming
          panel.webview.postMessage({ type: 'assistant:chunk', value: '' });

          const config = getRequestConfig(message);

          const result = await aiService.ask(text, {
            ...(config ? { config } : {}),
            signal: controller,
            // We support streaming by using provider onChunk if available.
            onChunk: (chunk) => {
              full += chunk || '';
              panel.webview.postMessage({ type: 'assistant:chunk', value: chunk || '' });
            },
          });

          // Some providers return {content}. If streaming, result may be empty.
          const content = result?.content || '';
          if (!full && content) {
            full = content;
            panel.webview.postMessage({ type: 'assistant:chunk', value: content });
          }

          panel.webview.postMessage({ type: 'assistant:done' });

          // Store conversation
          const conversationManager = this.container.resolve('conversationManager');
          conversationManager.addMessage({ role: 'user', content: text });
          conversationManager.addMessage({ role: 'assistant', content: full || content || '' });
        } catch (err) {
          if (controller.signal.aborted) {
            panel.webview.postMessage({ type: 'assistant:done' });
            if (full) {
              const conversationManager = this.container.resolve('conversationManager');
              conversationManager.addMessage({ role: 'user', content: text });
              conversationManager.addMessage({ role: 'assistant', content: full });
            }
            return;
          }

          panel.webview.postMessage({ type: 'assistant:error', value: err?.message || String(err) });
        } finally {
          if (this.activeController === controller) {
            this.activeController = null;
          }
        }
      }
    });

    this.disposables.push(disposable);

    panel.onDidDispose(() => {
      ensureDisposed(this.disposables);
      this.disposables = [];
      this.activeController?.abort?.();
      this.activeController = null;
      this.panel = null;
    });
  }

  async postModelStatus(panel) {
    const config = this.container.resolve('aiService').configurationService;
    const baseUrl = (config?.get?.('ollama.baseUrl') || 'http://127.0.0.1:11434').replace(/\/+$/, '');

    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        method: 'GET',
        headers: { 'content-type': 'application/json' },
      });

      if (!response.ok) {
        throw new Error(`Ollama tags request failed: ${response.status}`);
      }

      const models = parseModelsResponse(await response.json());
      panel.webview.postMessage({ type: 'assistant:models', status: models.length ? 'ready' : 'empty', models });
    } catch {
      panel.webview.postMessage({ type: 'assistant:models', status: 'offline', models: [] });
    }
  }

  startOllama(panel) {
    try {
      const child = spawn('ollama', ['serve'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      let reported = false;
      child.once('spawn', () => {
        reported = true;
        child.unref();
        panel.webview.postMessage({ type: 'assistant:ollamaStarted', ok: true });
      });
      child.once('error', (error) => {
        if (!reported) {
          panel.webview.postMessage({
            type: 'assistant:ollamaStarted',
            ok: false,
            value: error instanceof Error ? error.message : String(error),
          });
        }
      });
    } catch (error) {
      panel.webview.postMessage({
        type: 'assistant:ollamaStarted',
        ok: false,
        value: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

module.exports = { AssistantWebviewHost };

