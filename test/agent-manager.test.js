const assert = require('assert');
const { AgentManager } = require('../src/agents/agentManager');

suite('Agent manager', () => {
  test('registers default agents and creates permission-aware plans', () => {
    const manager = new AgentManager();
    assert.ok(manager.list().some((agent) => agent.id === 'coding'));
    const plan = manager.createPlan('security', 'review auth');
    assert.strictEqual(plan.agentId, 'security');
    assert.ok(plan.steps.some((step) => /approval/i.test(step)));
  });

  test('runs agents through shared context and AI service', async () => {
    let promptSeen = '';
    const manager = new AgentManager({
      contextBuilder: { build: () => ({ promptPrefix: '[context]', summary: 'context used' }) },
      aiService: {
        async ask(prompt) {
          promptSeen = prompt;
          return { content: 'done' };
        },
      },
    });
    const result = await manager.run('review', 'check this code');
    assert.strictEqual(result.result.content, 'done');
    assert.strictEqual(result.contextSummary, 'context used');
    assert.match(promptSeen, /Review Agent/);
    assert.match(promptSeen, /\[context]/);
  });
});
