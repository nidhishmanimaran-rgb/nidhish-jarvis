const { ProviderRegistry: CoreProviderRegistry } = require('../core/providerRegistry');
const { OllamaProvider } = require('../providers/ollamaProvider');

class ProviderRegistry extends CoreProviderRegistry {
  constructor() {
    super();
    this.register('ollama', OllamaProvider);
  }
}

module.exports = { ProviderRegistry };
