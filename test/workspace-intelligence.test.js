const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WorkspaceIntelligenceService } = require('../src/services/workspaceIntelligenceService');
const { WorkspaceManager } = require('../src/core/workspaceManager');

async function createFixture() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'jarvis-intelligence-'));
  await fs.promises.mkdir(path.join(root, 'src', 'services'), { recursive: true });
  await fs.promises.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'fixture-extension',
    dependencies: { react: '^19.0.0' },
    devDependencies: { '@types/vscode': '^1.125.0' },
  }, null, 2));
  await fs.promises.writeFile(path.join(root, 'package-lock.json'), '{}');
  await fs.promises.writeFile(path.join(root, 'vsc-extension-quickstart.md'), '# VS Code extension');
  await fs.promises.writeFile(path.join(root, 'src', 'extension.js'), [
    "const { AuthService } = require('./services/authService');",
    'function activate() {',
    '  return new AuthService();',
    '}',
    'module.exports = { activate };',
  ].join('\n'));
  await fs.promises.writeFile(path.join(root, 'src', 'services', 'authService.js'), [
    'class AuthService {',
    '  login(token) {',
    '    const isReady = Boolean(token);',
    '    return isReady;',
    '  }',
    '}',
    'module.exports = { AuthService };',
  ].join('\n'));
  return root;
}

suite('Workspace intelligence', () => {
  test('indexes project metadata, symbols, and file relationships', async () => {
    const root = await createFixture();
    const service = new WorkspaceIntelligenceService();

    const index = await service.indexWorkspace(root);

    assert.strictEqual(index.project.type, 'VS Code extension');
    assert.ok(index.project.packageManagers.includes('npm'));
    assert.ok(index.project.frameworks.includes('React'));
    assert.ok(index.project.frameworks.includes('VS Code Extension'));
    assert.ok(index.project.languages.some((entry) => entry.language === 'JavaScript'));
    assert.ok(index.graph.edges.some((edge) => edge.from === 'src/extension.js' && edge.to === 'src/services/authService.js'));
    assert.ok(index.files.some((file) => file.symbols.classes.includes('AuthService')));
  });

  test('explains and searches the current workspace index', async () => {
    const root = await createFixture();
    const service = new WorkspaceIntelligenceService();
    const manager = new WorkspaceManager({
      workspaceFolders: [{ name: 'fixture-extension', uri: { fsPath: root } }],
    }, service);

    await manager.indexWorkspace();
    const summary = manager.getProjectSummary();
    const results = manager.search('auth login service');

    assert.match(summary, /VS Code extension/);
    assert.ok(results.some((entry) => entry.file === 'src/services/authService.js'));
  });
});
