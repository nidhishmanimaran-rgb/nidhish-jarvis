const { BaseProvider } = require('./baseProvider');

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_MODEL = 'qwen2.5-coder:3b';
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 1024;
const DEFAULT_STREAMING = true;

function normalizeBaseUrl(url) {
  if (!url) {
    return DEFAULT_BASE_URL;
  }

  return url.replace(/\/+$/, '') || DEFAULT_BASE_URL;
}

function parseModelsResponse(body) {
  if (!body) {
    return [];
  }

  if (Array.isArray(body)) {
    return body
      .map((item) => (typeof item === 'string' ? item : item?.name || item?.tag || item?.id))
      .filter(Boolean);
  }

  if (Array.isArray(body.tags)) {
    return body.tags
      .map((item) => (typeof item === 'string' ? item : item?.name || item?.tag || item?.id))
      .filter(Boolean);
  }

  if (Array.isArray(body.models)) {
    return body.models
      .map((item) => (typeof item === 'string' ? item : item?.name || item?.tag || item?.id))
      .filter(Boolean);
  }

  return [];
}

function extractContentFromChunk(chunk) {
  if (!chunk) {
    return '';
  }

  if (typeof chunk === 'string') {
    return chunk;
  }

  if (chunk.text && typeof chunk.text === 'string') {
    return chunk.text;
  }

  if (chunk.message && typeof chunk.message.content === 'string') {
    return chunk.message.content;
  }

  if (Array.isArray(chunk.choices) && chunk.choices.length) {
    const choice = chunk.choices[0];
    if (choice.delta && typeof choice.delta.content === 'string') {
      return choice.delta.content;
    }
    if (choice.message && typeof choice.message.content === 'string') {
      return choice.message.content;
    }
  }

  if (chunk.delta && typeof chunk.delta.content === 'string') {
    return chunk.delta.content;
  }

  return '';
}

function parseOllamaStreamLine(line) {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const prefix = 'data:';
  const payload = trimmed.startsWith(prefix) ? trimmed.slice(prefix.length).trim() : trimmed;
  if (!payload || payload === '[DONE]') {
    return { done: true };
  }

  let parsed;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  if (parsed.error) {
    throw new Error(parsed.error.message || parsed.error || 'Ollama returned an error.');
  }

  const text = extractContentFromChunk(parsed);
  return { text, done: false };
}

function extractTextFromResponse(json) {
  if (!json) {
    return '';
  }

  if (typeof json.text === 'string') {
    return json.text;
  }

  if (json.message && typeof json.message.content === 'string') {
    return json.message.content;
  }

  if (Array.isArray(json.choices) && json.choices.length) {
    const choice = json.choices[0];
    if (choice.message && typeof choice.message.content === 'string') {
      return choice.message.content;
    }
    if (choice.delta && typeof choice.delta.content === 'string') {
      return choice.delta.content;
    }
  }

  if (json.output && Array.isArray(json.output) && json.output.length) {
    return json.output.map((item) => item.content || '').join('');
  }

  return '';
}

class OllamaProvider extends BaseProvider {
  constructor(options = {}) {
    super(options);
    this.config = options.config || {};
    this.baseUrl = normalizeBaseUrl(this.config.ollama?.baseUrl || this.config['ollama.baseUrl'] || this.config.baseUrl);
    this.temperature = Number(this.config.temperature ?? DEFAULT_TEMPERATURE);
    this.maxTokens = Number(this.config.maxTokens ?? DEFAULT_MAX_TOKENS);
    this.streaming = typeof this.config.streaming === 'boolean' ? this.config.streaming : DEFAULT_STREAMING;
    this.model = this.config.model || DEFAULT_MODEL;
    this.installedModels = [];
    this.connected = false;
    this.lastError = null;
  }

  get name() {
    return 'OllamaProvider';
  }

  get currentModel() {
    return this.selectModel();
  }

  get status() {
    if (this.connected) {
      return `Connected to Ollama (${this.currentModel})`;
    }
    return this.lastError ? `Ollama disconnected: ${this.lastError}` : 'Ollama server is not running.';
  }

  async init() {
    try {
      this.installedModels = await this.discoverModels();
      this.connected = this.installedModels.length > 0;
      this.lastError = null;
    } catch (error) {
      this.connected = false;
      this.lastError = error instanceof Error ? error.message : String(error);
      this.installedModels = [];
    }
  }

  async health() {
    await this.init();
    return this.connected;
  }

  async discoverModels() {
    const response = await fetch(`${this.baseUrl}/api/tags`, {
      method: 'GET',
      headers: { 'content-type': 'application/json' },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama tags request failed: ${response.status} ${response.statusText} ${body}`);
    }

    const body = await response.json();
    const models = parseModelsResponse(body);
    if (!models.length) {
      throw new Error('No installed Ollama models were discovered.');
    }

    return models;
  }

  selectModel() {
    const normalizedPreferred = this.model?.toString()?.trim();
    const installed = this.installedModels || [];

    if (normalizedPreferred && installed.includes(normalizedPreferred)) {
      return normalizedPreferred;
    }

    const preferred = installed.find((modelName) => modelName.toLowerCase() === DEFAULT_MODEL.toLowerCase());
    if (preferred) {
      return preferred;
    }

    return installed[0] || normalizedPreferred || DEFAULT_MODEL;
  }

  async generate(input, options = {}) {
    const text = input?.toString().trim();
    if (!text) {
      return { content: '' };
    }

    await this.init();
    if (!this.connected) {
      throw new Error('Ollama server is not running.');
    }

    const model = this.selectModel();
    const payload = {
      model,
      messages: [{ role: 'user', content: text }],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: Boolean(this.streaming),
    };

    const controller = options.signal || new AbortController();
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama chat failed: ${response.status} ${response.statusText} ${body}`);
    }

    if (!this.streaming || !response.body) {
      const json = await response.json();
      return { content: extractTextFromResponse(json) };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n');

      while (boundary >= 0) {
        const chunkLine = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 1);
        const parsed = parseOllamaStreamLine(chunkLine);

        if (parsed) {
          if (parsed.done) {
            break;
          }

          if (parsed.text) {
            content += parsed.text;
            options.onChunk?.(parsed.text);
          }
        }

        boundary = buffer.indexOf('\n');
      }
    }

    if (buffer.trim()) {
      const parsed = parseOllamaStreamLine(buffer);
      if (parsed?.text) {
        content += parsed.text;
        options.onChunk?.(parsed.text);
      }
    }

    return { content };
  }
}

module.exports = { OllamaProvider };
