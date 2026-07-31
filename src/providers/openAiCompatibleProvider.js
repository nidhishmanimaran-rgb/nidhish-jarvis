const { BaseProvider } = require('./baseProvider');

const PROVIDER_DEFAULTS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    modelsPath: '/models',
    chatPath: '/chat/completions',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4.1-mini',
    modelsPath: '/models',
    chatPath: '/chat/completions',
  },
  azureOpenai: {
    baseUrl: '',
    model: '',
    modelsPath: '',
    chatPath: '',
  },
  custom: {
    baseUrl: '',
    model: '',
    modelsPath: '/models',
    chatPath: '/chat/completions',
  },
};

function normalizeBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeError(provider, error) {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${provider} provider error: ${message}`);
}

function redactSecret(text, secret) {
  const value = String(text || '');
  if (!secret) return value;
  return value.split(secret).join('[redacted]');
}

function extractContent(json) {
  if (!json) {
    return '';
  }
  if (Array.isArray(json.choices) && json.choices[0]?.message?.content) {
    return json.choices[0].message.content;
  }
  if (typeof json.output_text === 'string') {
    return json.output_text;
  }
  return '';
}

function parseStreamingLine(line) {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith('data:')) {
    return null;
  }
  const payload = trimmed.slice(5).trim();
  if (payload === '[DONE]') {
    return { done: true };
  }
  try {
    const json = JSON.parse(payload);
    return { text: json.choices?.[0]?.delta?.content || '', done: false };
  } catch {
    return null;
  }
}

class OpenAiCompatibleProvider extends BaseProvider {
  constructor(options = {}) {
    super(options);
    this.provider = options.provider || options.config?.provider || 'custom';
    const defaults = PROVIDER_DEFAULTS[this.provider] || PROVIDER_DEFAULTS.custom;
    this.config = { ...defaults, ...(options.config || {}) };
    this.baseUrl = normalizeBaseUrl(this.config.baseUrl || this.config[`${this.provider}.baseUrl`]);
    this.apiKey = this.config.apiKey;
    this.model = this.config.model || defaults.model;
    this.temperature = Number(this.config.temperature ?? 0.7);
    this.maxTokens = Number(this.config.maxTokens ?? 1024);
    this.streaming = Boolean(this.config.streaming);
  }

  get name() {
    return `${this.provider}Provider`;
  }

  getCapabilities() {
    return {
      chat: true,
      streaming: true,
      models: Boolean(this.config.modelsPath),
      toolCalling: true,
      vision: true,
      embeddings: true,
      cancellation: true,
      contextWindow: this.config.contextWindow || null,
    };
  }

  assertConfigured() {
    if (!this.baseUrl) {
      throw new Error('Base URL is not configured.');
    }
    if (!this.apiKey) {
      throw new Error('API key is not configured. Use Jarvis: Add API Key.');
    }
    if (!this.model) {
      throw new Error('Model is not configured.');
    }
  }

  async health() {
    this.assertConfigured();
    return true;
  }

  async listModels() {
    this.assertConfigured();
    if (!this.config.modelsPath) {
      return [];
    }

    const response = await fetch(`${this.baseUrl}${this.config.modelsPath}`, {
      headers: this.headers(),
    });
    if (!response.ok) {
      throw normalizeError(this.provider, `${response.status} ${response.statusText}`);
    }
    const json = await response.json();
    return (json.data || json.models || [])
      .map((item) => (typeof item === 'string' ? item : item.id || item.name))
      .filter(Boolean);
  }

  async generate(input, options = {}) {
    this.assertConfigured();
    const payload = {
      model: this.model,
      messages: [{ role: 'user', content: String(input || '') }],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: this.streaming,
    };
    const response = await fetch(`${this.baseUrl}${this.config.chatPath}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload),
      signal: options.signal?.signal || options.signal,
    });
    if (!response.ok) {
      throw normalizeError(this.provider, `${response.status} ${response.statusText} ${redactSecret(await response.text(), this.apiKey)}`);
    }

    if (!this.streaming || !response.body) {
      return { content: extractContent(await response.json()) };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let content = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf('\n');
      while (boundary >= 0) {
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 1);
        const parsed = parseStreamingLine(line);
        if (parsed?.done) break;
        if (parsed?.text) {
          content += parsed.text;
          options.onChunk?.(parsed.text);
        }
        boundary = buffer.indexOf('\n');
      }
    }
    return { content };
  }

  headers() {
    return {
      authorization: `Bearer ${this.apiKey}`,
      'content-type': 'application/json',
    };
  }
}

class OpenAIProvider extends OpenAiCompatibleProvider {
  constructor(options = {}) {
    super({ ...options, provider: 'openai' });
  }
}

class OpenRouterProvider extends OpenAiCompatibleProvider {
  constructor(options = {}) {
    super({ ...options, provider: 'openrouter' });
  }
}

class AzureOpenAIProvider extends OpenAiCompatibleProvider {
  constructor(options = {}) {
    const config = options.config || {};
    const deployment = config.azureDeployment || config.model;
    const apiVersion = config.azureApiVersion || '2024-02-15-preview';
    const baseUrl = normalizeBaseUrl(config.azureEndpoint || config.baseUrl || '');
    super({
      ...options,
      provider: 'azureOpenai',
      config: {
        ...config,
        baseUrl,
        model: deployment,
        chatPath: `/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`,
      },
    });
  }

  headers() {
    return {
      'api-key': this.apiKey,
      'content-type': 'application/json',
    };
  }
}

class CustomOpenAIProvider extends OpenAiCompatibleProvider {
  constructor(options = {}) {
    super({ ...options, provider: 'custom' });
  }
}

module.exports = {
  OpenAiCompatibleProvider,
  OpenAIProvider,
  OpenRouterProvider,
  AzureOpenAIProvider,
  CustomOpenAIProvider,
  redactSecret,
};
