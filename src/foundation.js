const { ConfigurationService } = require('./services/configurationService');
const { ConversationManager } = require('./services/conversationManager');
const { EventBus } = require('./services/eventBus');
const { createPluginLoader } = require('./services/pluginLoader');
const { ProviderRegistry } = require('./services/providerService');

function createFoundation(context) {
  const storage = context.workspaceState || {
    get: () => undefined,
    set: () => undefined,
  };

  const config = new ConfigurationService(storage);
  const conversationManager = new ConversationManager({ maxMessages: config.get('maxHistory') });
  const eventBus = new EventBus();
  const pluginLoader = createPluginLoader();
  const providerRegistry = new ProviderRegistry();

  return {
    config,
    conversationManager,
    eventBus,
    pluginLoader,
    providerRegistry,
  };
}

module.exports = { createFoundation };
