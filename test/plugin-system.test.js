const assert = require('assert');
const { PluginSystem } = require('../src/plugins/pluginSystem');

suite('Plugin system', () => {
  test('validates manifests and enforces permissions', () => {
    const values = {};
    const system = new PluginSystem({ storage: { setWorkspace: (k, v) => { values[k] = v; } } });
    const plugin = system.registerManifest({ id: 'demo', name: 'Demo', version: '1.0.0', permissions: ['context'] });
    assert.strictEqual(plugin.enabled, true);
    assert.strictEqual(system.authorize('demo', 'context').ok, true);
    assert.strictEqual(system.authorize('demo', 'terminal').ok, false);
    system.setEnabled('demo', false);
    assert.strictEqual(system.authorize('demo', 'context').ok, false);
    assert.strictEqual(values['jarvis.plugins'].length, 1);
    assert.throws(() => system.registerManifest({ id: 'bad' }), /requires id, name, and version/);
  });
});
