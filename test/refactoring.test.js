const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WorkspaceIntelligenceService } = require('../src/services/workspaceIntelligenceService');
const { SafeEditService } = require('../src/editing/safeEditService');
const { RefactoringService } = require('../src/refactoring/refactoringService');

async function createRefactorFixture() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'jarvis-refactor-'));
  await fs.promises.mkdir(path.join(root, 'src'), { recursive: true });
  await fs.promises.writeFile(path.join(root, 'src', 'a.js'), [
    "const { AuthService } = require('./auth');",
    'const service = new AuthService();',
    'module.exports = { service };',
  ].join('\n'));
  await fs.promises.writeFile(path.join(root, 'src', 'auth.js'), [
    'class AuthService {}',
    'module.exports = { AuthService };',
  ].join('\n'));
  return root;
}

suite('Refactoring service', () => {
  test('creates a multi-file identifier rename proposal', async () => {
    const root = await createRefactorFixture();
    const index = await new WorkspaceIntelligenceService().indexWorkspace(root);
    const safeEditService = new SafeEditService({ rootPath: root });
    const proposal = await new RefactoringService().createRenameProposal({
      index,
      rootPath: root,
      oldName: 'AuthService',
      newName: 'IdentityService',
      safeEditService,
    });

    assert.strictEqual(proposal.changes.length, 2);
    assert.ok(proposal.changes.every((change) => change.proposed.includes('IdentityService')));
    assert.strictEqual(proposal.requiresApproval, true);
  });

  test('creates an import migration proposal', async () => {
    const root = await createRefactorFixture();
    const index = await new WorkspaceIntelligenceService().indexWorkspace(root);
    const safeEditService = new SafeEditService({ rootPath: root });
    const proposal = await new RefactoringService().createImportUpdateProposal({
      index,
      rootPath: root,
      fromImport: './auth',
      toImport: './identity',
      safeEditService,
    });

    assert.strictEqual(proposal.changes.length, 1);
    assert.match(proposal.changes[0].proposed, /require\('\.\/identity'\)/);
  });
});
