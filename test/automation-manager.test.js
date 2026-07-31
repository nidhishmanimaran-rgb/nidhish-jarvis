const assert = require('assert');
const { AutomationManager } = require('../src/automation/automationManager');

suite('Automation manager', () => {
  test('runs enabled rules for matching triggers only', async () => {
    const manager = new AutomationManager();
    let seen = 0;
    manager.registerAction('count', async (payload) => {
      seen += payload.value;
      return seen;
    });
    manager.addRule({ id: 'on-save', trigger: 'fileSave', action: 'count' });
    manager.addRule({ id: 'on-diagnostics', trigger: 'diagnosticsChange', action: 'count' });
    manager.setEnabled('on-diagnostics', false);
    const results = await manager.handleTrigger('fileSave', { value: 2 });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].result, 2);
    assert.strictEqual(seen, 2);
  });
});
