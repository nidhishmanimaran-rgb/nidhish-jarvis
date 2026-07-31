const Mocha = require('mocha');
const path = require('path');

const mocha = new Mocha({ ui: 'tdd', color: true });
mocha.addFile(path.join(__dirname, 'agent-manager.test.js'));
mocha.addFile(path.join(__dirname, 'activity-bar.test.js'));
mocha.addFile(path.join(__dirname, 'assistant-core.test.js'));
mocha.addFile(path.join(__dirname, 'automation-manager.test.js'));
mocha.addFile(path.join(__dirname, 'context-builder.test.js'));
mocha.addFile(path.join(__dirname, 'debugger.test.js'));
mocha.addFile(path.join(__dirname, 'foundation.test.js'));
mocha.addFile(path.join(__dirname, 'git-assistant.test.js'));
mocha.addFile(path.join(__dirname, 'media.test.js'));
mocha.addFile(path.join(__dirname, 'mcp-manager.test.js'));
mocha.addFile(path.join(__dirname, 'plugin-system.test.js'));
mocha.addFile(path.join(__dirname, 'refactoring.test.js'));
mocha.addFile(path.join(__dirname, 'safe-edit.test.js'));
mocha.addFile(path.join(__dirname, 'security.test.js'));
mocha.addFile(path.join(__dirname, 'terminal-agent.test.js'));
mocha.addFile(path.join(__dirname, 'workspace-intelligence.test.js'));

mocha.run((failures) => {
  process.exitCode = failures ? 1 : 0;
});
