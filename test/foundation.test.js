const assert = require('assert');
const { ConfigurationService } = require('../src/services/configurationService');
const { ConversationManager } = require('../src/services/conversationManager');
const { EventBus } = require('../src/services/eventBus');
const { createPluginLoader } = require('../src/services/pluginLoader');
const { ProviderRegistry } = require('../src/services/providerService');
const { MemoryManager } = require('../src/services/memoryManager');
const { ErrorHandler } = require('../src/services/errorHandler');

suite('Foundation services', () => {
  test('loads defaults and saves settings', () => {
    const storage = { values: {}, get(key) { return this.values[key]; }, set(key, value) { this.values[key] = value; } };
    const config = new ConfigurationService(storage);

    assert.strictEqual(config.get('provider'), 'ollama');
    config.set('provider', 'ollama');
    assert.strictEqual(config.get('provider'), 'ollama');
  });

  test('stores conversation history and exports it', () => {
    const manager = new ConversationManager({ maxMessages: 2 });
    manager.addMessage({ role: 'user', content: 'First' });
    manager.addMessage({ role: 'assistant', content: 'Second' });
    manager.addMessage({ role: 'user', content: 'Third' });

    const history = manager.getHistory();
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[1].content, 'Third');

    const exported = JSON.parse(manager.exportHistory());
    assert.strictEqual(exported.length, 2);
  });

  test('publishes and unsubscribes from events', () => {
    const bus = new EventBus();
    let seen = 0;
    const sub = bus.subscribe('chat', () => { seen += 1; });

    bus.publish('chat', { ok: true });
    sub.dispose();
    bus.publish('chat', { ok: false });

    assert.strictEqual(seen, 1);
  });

  test('loads plugins and resolves providers', async () => {
    const loader = createPluginLoader();
    const plugin = { id: 'demo', register: (registry) => registry.register('demo', { name: 'Demo' }) };
    loader.register(plugin);

    const registry = new ProviderRegistry();
    const provider = await registry.create('ollama', { config: { model: 'qwen2.5-coder:latest', 'ollama.baseUrl': 'http://127.0.0.1:11434' } });
    assert.strictEqual(provider.name, 'OllamaProvider');
  });

  test('persists memory entries and reports failures', () => {
    const memory = new MemoryManager();
    memory.set('topic', 'foundation');
    assert.strictEqual(memory.get('topic'), 'foundation');

    const handler = new ErrorHandler();
    const result = handler.handle(new Error('boom'));
    assert.strictEqual(result.severity, 'error');
  });
});
