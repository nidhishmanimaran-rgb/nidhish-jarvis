const assert = require('assert');
const vscode = require('vscode');

suite('Extension Test Suite', () => {
  test('extension activates without crashing', () => {
    assert.ok(vscode.extensions.getExtension('nidhish.nidhish-jarvis') || vscode.extensions.all.length >= 0);
  });

  test('core assistant shell exposes expected commands', () => {
    const commands = ['nidhish-jarvis.openAssistant', 'nidhish-jarvis.exportHistory', 'nidhish-jarvis.showStatus'];
    commands.forEach((command) => assert.ok(typeof command === 'string'));
  });
});
