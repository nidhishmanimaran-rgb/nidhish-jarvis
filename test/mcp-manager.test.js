const assert = require('assert');
const { McpManager } = require('../src/mcp/mcpManager');

suite('MCP manager', () => {
  test('stores servers, permissions, and tool authorization', () => {
    const values = {};
    const manager = new McpManager({ storage: { getWorkspace: (k) => values[k], setWorkspace: (k, v) => { values[k] = v; } } });
    manager.addServer({ id: 'local', command: 'node', args: ['server.js'], permissions: ['search'] });
    manager.registerDiscoveredTools('local', [{ name: 'search', description: 'Search resources' }]);
    assert.strictEqual(manager.authorizeTool('local', 'search').ok, true);
    assert.strictEqual(manager.authorizeTool('local', 'write').ok, false);
    manager.setEnabled('local', false);
    assert.strictEqual(manager.authorizeTool('local', 'search').ok, false);
    assert.strictEqual(new McpManager({ storage: { getWorkspace: (k) => values[k], setWorkspace() {} } }).listServers().length, 1);
  });
});
