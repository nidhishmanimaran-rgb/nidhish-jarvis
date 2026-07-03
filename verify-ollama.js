const { ProviderRegistry } = require('./src/services/providerService');
const { AIService } = require('./src/services/aiService');
const { ConfigurationService } = require('./src/services/configurationService');
const { LoggingService } = require('./src/core/loggingService');

(async () => {
  try {
    const storage = { get: () => undefined, set: () => undefined };
    const config = new ConfigurationService(storage, {}, null);
    console.log('provider', config.get('provider'));
    console.log('model', config.get('model'));
    console.log('baseUrl', config.get('ollama.baseUrl'));
    console.log('temperature', config.get('temperature'));
    console.log('streaming', config.get('streaming'));

    const registry = new ProviderRegistry();
    const provider = await registry.create('ollama', { config: config.getAll() });
    console.log('provider instance', provider.name);
    console.log('provider currentModel', provider.currentModel);
    console.log('provider status', provider.status);

    const aiService = new AIService(registry, new LoggingService(), config);
    const result = await aiService.ask('Hello Jarvis', { onChunk: (chunk) => process.stdout.write(chunk) });
    console.log('\nresponse', result);
  } catch (error) {
    console.error('ERROR', error);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
})();
