class ConfigurationService {
  constructor(storage, defaults = {}, vscodeApi = null) {
    this.storage = storage;
    this.vscodeApi = vscodeApi;
    this.defaults = {
      provider: 'ollama',
      model: 'qwen2.5-coder:3b',
      memoryEnabled: true,
      maxHistory: 50,
      theme: 'system',
      debug: false,
      'ollama.baseUrl': 'http://127.0.0.1:11434',
      temperature: 0.7,
      maxTokens: 512,
      streaming: true,
      ...defaults,
    };
    this.values = { ...this.defaults, ...(this.storage.get?.('jarvis.config') || {}) };
  }

  get(key) {
    let value = this.values[key];
    if (this.vscodeApi?.workspace?.getConfiguration) {
      const settings = this.vscodeApi.workspace.getConfiguration('jarvis');
      const configValue = settings.get(key);
      if (configValue !== undefined) {
        value = configValue;
      }
    }
    return value;
  }

  set(key, value) {
    this.values[key] = value;
    this.storage.set?.('jarvis.config', { ...this.values });
    return value;
  }

  getAll() {
    const stored = { ...this.defaults, ...(this.storage.get?.('jarvis.config') || {}) };
    if (this.vscodeApi?.workspace?.getConfiguration) {
      const settings = this.vscodeApi.workspace.getConfiguration('jarvis');
      Object.keys(this.defaults).forEach((key) => {
        const configValue = settings.get(key);
        if (configValue !== undefined) {
          stored[key] = configValue;
        }
      });
    }
    return stored;
  }
}

module.exports = { ConfigurationService };
