const assert = require('assert');
const { PluginRegistry, createConversationStore } = require('../assistantCore');

function createMemoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    get(key) {
      return data[key];
    },
    update(key, value) {
      data[key] = value;
    },
  };
}

suite('Assistant core', () => {
  test('routes prompts to the matching plugin', async () => {
    const registry = new PluginRegistry();
    registry.register('writing', {
      canHandle: ({ input }) => input.toLowerCase().includes('rewrite'),
      handle: async () => ({ plugin: 'writing', response: 'Rewritten copy ready.' }),
    });

    const result = await registry.execute({ input: 'Please rewrite this draft' });
    assert.strictEqual(result.plugin, 'writing');
    assert.match(result.response, /Rewritten/);
  });

  test('stores and exports conversation history with a bounded limit', () => {
    const storage = createMemoryStorage();
    const store = createConversationStore(storage, { maxMessages: 2 });

    store.append({ role: 'user', content: 'First turn' });
    store.append({ role: 'assistant', content: 'Second turn' });
    store.append({ role: 'user', content: 'Third turn' });

    const messages = store.getMessages();
    assert.strictEqual(messages.length, 2);
    assert.strictEqual(messages[0].content, 'Second turn');
    assert.strictEqual(messages[1].content, 'Third turn');

    const exported = JSON.parse(store.exportJson());
    assert.strictEqual(exported.length, 2);
    assert.strictEqual(exported[0].content, 'Second turn');
  });
});
