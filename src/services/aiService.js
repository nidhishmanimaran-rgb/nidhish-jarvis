class AIService {
  constructor(providerRegistry, logger, configurationService, secretService = null) {
    this.providerRegistry = providerRegistry;
    this.logger = logger;
    this.configurationService = configurationService;
    this.secretService = secretService;
  }

  async ask(input, options = {}) {
    const providerKey = options.provider || this.configurationService?.get('provider') || 'ollama';
    const apiKey = await this.secretService?.getApiKey?.(providerKey);
    const config = { ...this.configurationService?.getAll?.(), ...(apiKey ? { apiKey } : {}), ...(options.config || {}) };
    const instance = await this.providerRegistry.create(providerKey, { config });
    this.logger?.info('Generating response', {
      provider: providerKey,
      inputLength: String(input || '').length,
    });
    return instance.generate(input, options);
  }

  async listModels(provider = null) {
    const providerKey = provider || this.configurationService?.get('provider') || 'ollama';
    const apiKey = await this.secretService?.getApiKey?.(providerKey);
    const config = { ...this.configurationService?.getAll?.(), ...(apiKey ? { apiKey } : {}) };
    const instance = await this.providerRegistry.create(providerKey, { config });
    return instance.listModels?.() || [];
  }

  async health(provider = null) {
    const providerKey = provider || this.configurationService?.get('provider') || 'ollama';
    const apiKey = await this.secretService?.getApiKey?.(providerKey);
    const config = { ...this.configurationService?.getAll?.(), ...(apiKey ? { apiKey } : {}) };
    const instance = await this.providerRegistry.create(providerKey, { config });
    return instance.health();
  }
}

module.exports = { AIService };
