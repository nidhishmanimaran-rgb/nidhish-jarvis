const assert = require('assert');
const { DebuggerService } = require('../src/debug/debuggerService');

suite('Debugger service', () => {
  test('normalizes VS Code diagnostics and creates prompts', () => {
    const service = new DebuggerService();
    const diagnostics = service.collectDiagnostics({
      languages: {
        getDiagnostics() {
          return [[
            { fsPath: 'C:\\repo\\src\\app.js' },
            [{
              message: 'Unexpected token',
              source: 'eslint',
              code: 'parse-error',
              severity: 0,
              range: { start: { line: 2, character: 4 } },
            }],
          ]];
        },
      },
    }, [{ uri: { fsPath: 'C:\\repo' } }]);

    assert.strictEqual(diagnostics[0].workspaceRelativeFile, 'src/app.js');
    assert.strictEqual(diagnostics[0].severity, 'Error');
    const summary = service.summarizeDiagnostics(diagnostics);
    assert.strictEqual(summary.total, 1);
    assert.strictEqual(summary.bySeverity.Error, 1);
    assert.match(service.createPrompt(diagnostics), /Unexpected token/);
  });
});
