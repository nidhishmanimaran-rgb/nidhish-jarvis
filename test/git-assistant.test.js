const assert = require('assert');
const { GitAssistantService } = require('../src/git/gitAssistantService');

suite('Git assistant service', () => {
  test('parses status and summarizes changed files', async () => {
    const service = new GitAssistantService({
      runner: async () => ({
        ok: true,
        stdout: '## main...origin/main\n M src/app.js\nA  test/app.test.js\n',
        stderr: '',
        exitCode: 0,
      }),
    });

    const status = await service.getStatus('repo');
    const summary = service.summarizeStatus(status);

    assert.strictEqual(status.branch, 'main...origin/main');
    assert.strictEqual(summary.changedFiles, 2);
    assert.strictEqual(summary.counts.M, 1);
    assert.strictEqual(summary.counts.A, 1);
  });

  test('uses read-only git diff arguments and filters unsafe paths', async () => {
    let argsSeen = null;
    const service = new GitAssistantService({
      runner: async (args) => {
        argsSeen = args;
        return { ok: true, stdout: 'diff', stderr: '', exitCode: 0 };
      },
    });

    await service.getDiff('repo', { paths: ['src/app.js', '../secret', 'C:\\secret'] });

    assert.deepStrictEqual(argsSeen, ['diff', '--', 'src/app.js']);
  });

  test('builds safe diff and commit prompts', () => {
    const service = new GitAssistantService();
    assert.match(service.buildDiffPrompt('diff --git'), /Explain this Git diff/);
    assert.match(service.buildDiffPrompt('diff --git', { commit: true }), /conventional commit/);
    assert.match(service.buildDiffPrompt('diff --git'), /Do not suggest destructive Git commands/);
  });
});
