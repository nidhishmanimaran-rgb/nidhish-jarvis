const assert = require('assert');
const path = require('path');
const { SafeEditService, assertInsideWorkspace } = require('../src/editing/safeEditService');
const { DiffPreviewService, createVsCodeEditAdapter } = require('../src/editing/diffPreviewService');

suite('Safe edit service', () => {
  test('creates structured proposals and requires approval before applying', async () => {
    const writes = [];
    const service = new SafeEditService({
      rootPath: path.join('C:', 'workspace'),
      fs: {
        writeFile(file, content) {
          writes.push({ file, content });
        },
      },
    });
    const proposal = service.createProposal([{
      file: 'src/app.js',
      original: 'const oldValue = true;',
      proposed: 'const newValue = true;',
    }]);

    assert.strictEqual(proposal.requiresApproval, true);
    assert.strictEqual(proposal.summary[0].additions, 1);
    assert.strictEqual(proposal.summary[0].removals, 1);
    await assert.rejects(() => service.applyProposal(proposal), /requires explicit approval/);
    assert.strictEqual(await service.applyProposal(proposal, { approved: true }), 1);
    assert.strictEqual(writes[0].content, 'const newValue = true;');
  });

  test('rejects edits outside the workspace root', () => {
    assert.throws(() => assertInsideWorkspace(path.join('C:', 'workspace'), '..\\secret.txt'), /outside workspace/);
  });

  test('opens per-file previews and applies only after explicit acceptance', async () => {
    const calls = [];
    const fakeUri = (fsPath) => ({ fsPath });
    fakeUri.file = fakeUri;
    fakeUri.joinPath = (...parts) => fakeUri(parts.map((part) => part.fsPath || part).join('/'));
    const fakeVscode = {
      Uri: fakeUri,
      workspace: {
        fs: {
          createDirectory(uri) {
            calls.push(['mkdir', uri.fsPath]);
          },
          writeFile(uri, content) {
            calls.push(['write', uri.fsPath, Buffer.from(content).toString('utf8')]);
          },
        },
      },
      commands: {
        executeCommand(command, originalUri, proposedUri) {
          calls.push(['command', command, originalUri.fsPath, proposedUri.fsPath]);
        },
      },
      window: {
        showWarningMessage() {
          calls.push(['prompt']);
          return 'Accept All';
        },
      },
    };
    const service = new SafeEditService({
      rootPath: path.join('C:', 'workspace'),
      fs: {
        applyWorkspaceEdit(proposal) {
          calls.push(['apply', proposal.changes.length]);
        },
      },
    });
    const proposal = service.createProposal([{
      file: 'src/app.js',
      original: 'old',
      proposed: 'new',
    }]);
    const preview = new DiffPreviewService({ vscode: fakeVscode, storageUri: fakeUri('global') });

    const result = await preview.reviewAndApply(proposal, service);

    assert.deepStrictEqual(result, { applied: true, changes: 1 });
    assert.ok(calls.some((call) => call[0] === 'command' && call[1] === 'vscode.diff'));
    assert.ok(calls.some((call) => call[0] === 'apply' && call[1] === 1));
  });

  test('creates a VS Code workspace edit adapter for range replacement', async () => {
    const calls = [];
    class Position {
      constructor(line, character) {
        this.line = line;
        this.character = character;
      }
    }
    class Range {
      constructor(start, end) {
        this.start = start;
        this.end = end;
      }
    }
    class WorkspaceEdit {
      replace(uri, range, value) {
        calls.push(['replace', uri.fsPath, range.start.line, range.end.line, value]);
      }
    }
    const adapter = createVsCodeEditAdapter({
      Uri: { file: (fsPath) => ({ fsPath }) },
      Position,
      Range,
      WorkspaceEdit,
      workspace: {
        applyEdit() {
          calls.push(['applyEdit']);
          return true;
        },
      },
    });

    await adapter.applyWorkspaceEdit({
      changes: [{
        absolutePath: path.join('C:', 'workspace', 'src', 'app.js'),
        operation: 'modify',
        range: { start: { line: 1, character: 0 }, end: { line: 2, character: 0 } },
        proposed: 'replacement',
      }],
    });

    assert.deepStrictEqual(calls[0], ['replace', path.join('C:', 'workspace', 'src', 'app.js'), 1, 2, 'replacement']);
    assert.deepStrictEqual(calls[1], ['applyEdit']);
  });
});
