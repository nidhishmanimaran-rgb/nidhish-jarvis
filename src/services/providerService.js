const { ProviderRegistry: CoreProviderRegistry } = require('../core/providerRegistry');
const { OllamaProvider } = require('../providers/ollamaProvider');
const {
  OpenAIProvider,
  OpenRouterProvider,
  AzureOpenAIProvider,
  CustomOpenAIProvider,
} = require('../providers/openAiCompatibleProvider');

class ProviderRegistry extends CoreProviderRegistry {
  constructor() {
    super();
    this.register('ollama', OllamaProvider);
    this.register('openai', OpenAIProvider);
    this.register('openrouter', OpenRouterProvider);
    this.register('azureOpenai', AzureOpenAIProvider);
    this.register('custom', CustomOpenAIProvider);
  }
}

module.exports = { ProviderRegistry };
