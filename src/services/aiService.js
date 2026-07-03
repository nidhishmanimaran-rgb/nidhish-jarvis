class AIService {
  constructor(providerRegistry, logger, configurationService) {
    this.providerRegistry = providerRegistry;
    this.logger = logger;
    this.configurationService = configurationService;
  }

  async ask(input, options = {}) {
    const providerKey = options.provider || this.configurationService?.get('provider') || 'ollama';
    const config = { ...this.configurationService?.getAll?.(), ...(options.config || {}) };
    const instance = await this.providerRegistry.create(providerKey, { config });
    this.logger?.info('Generating response', { provider: providerKey, input });
    return instance.generate(input, options);
  }
}

module.exports = { AIService };