const assert = require('assert');
const { TerminalAgentService } = require('../src/terminal/terminalAgentService');

suite('Terminal agent service', () => {
  test('classifies destructive commands as high risk', () => {
    const service = new TerminalAgentService();
    const classification = service.classifyCommand('git reset --hard HEAD');
    assert.strictEqual(classification.risk, 'high');
    assert.strictEqual(classification.requiresApproval, true);
  });

  test('allows known inspection commands without approval', () => {
    const service = new TerminalAgentService();
    const classification = service.classifyCommand('git status --short');
    assert.strictEqual(classification.risk, 'low');
    assert.strictEqual(classification.requiresApproval, false);
  });

  test('does not treat arbitrary npm or shell-control commands as low risk', () => {
    const service = new TerminalAgentService();
    assert.strictEqual(service.classifyCommand('npm publish').requiresApproval, true);
    assert.strictEqual(service.classifyCommand('git status && del file').risk, 'high');
  });

  test('blocks unknown commands until approved', async () => {
    const service = new TerminalAgentService();
    assert.throws(() => service.runApproved('some-tool --write'), /requires approval/);
  });

  test('builds terminal failure explanation prompts', () => {
    const service = new TerminalAgentService();
    assert.match(service.explainFailure('npm test', 'failed'), /npm test/);
    assert.match(service.explainFailure('npm test', 'failed'), /failed/);
  });
});
