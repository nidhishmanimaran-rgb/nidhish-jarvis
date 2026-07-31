const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WorkspaceIntelligenceService } = require('../src/services/workspaceIntelligenceService');
const { WorkspaceManager } = require('../src/core/workspaceManager');

async function createFixture() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'jarvis-intelligence-'));
  await fs.promises.mkdir(path.join(root, 'src', 'services'), { recursive: true });
  await fs.promises.mkdir(path.join(root, 'ignored'), { recursive: true });
  await fs.promises.mkdir(path.join(root, 'generated'), { recursive: true });
  await fs.promises.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'fixture-extension',
    dependencies: { react: '^19.0.0' },
    devDependencies: { '@types/vscode': '^1.125.0' },
  }, null, 2));
  await fs.promises.writeFile(path.join(root, 'package-lock.json'), '{}');
  await fs.promises.writeFile(path.join(root, '.gitignore'), 'ignored/\n*.secret.js\n');
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
  await fs.promises.writeFile(path.join(root, 'ignored', 'hidden.js'), 'function hidden() {}');
  await fs.promises.writeFile(path.join(root, 'src', 'secret.secret.js'), 'function secret() {}');
  await fs.promises.writeFile(path.join(root, 'generated', 'client.generated.js'), 'function generatedClient() {}');
  await fs.promises.writeFile(path.join(root, 'src', 'logo.png'), Buffer.from([0, 1, 2, 3]));
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
    assert.ok(index.project.configurations.includes('package.json'));
    assert.ok(!index.files.some((file) => file.relativePath.includes('hidden.js')));
    assert.ok(!index.files.some((file) => file.relativePath.includes('secret.secret.js')));
    assert.ok(!index.files.some((file) => file.relativePath.includes('generated')));
    assert.ok(!index.files.some((file) => file.relativePath.includes('logo.png')));
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

  test('supports hybrid search and public project query APIs', async () => {
    const root = await createFixture();
    const service = new WorkspaceIntelligenceService();
    await service.indexWorkspace(root);

    assert.ok(service.getFile('src/services/authService.js'));
    assert.ok(service.getFiles().length > 0);
    assert.ok(service.getSymbols().some((symbol) => symbol.name === 'AuthService'));
    assert.deepStrictEqual(service.getDependencies('src/extension.js'), ['src/services/authService.js']);
    assert.deepStrictEqual(service.getDependents('src/services/authService.js'), ['src/extension.js']);
    assert.deepStrictEqual(service.getRelatedFiles('src/extension.js'), ['src/services/authService.js']);
    assert.ok(service.getProjectMetadata().project.frameworks.includes('React'));
    assert.ok(service.searchIndex('auth service', { mode: 'hybrid' }).some((entry) => entry.file === 'src/services/authService.js'));
  });

  test('indexes multiple workspace roots into one merged index', async () => {
    const first = await createFixture();
    const second = await createFixture();
    await fs.promises.writeFile(path.join(second, 'src', 'worker.js'), [
      'function runWorker() {',
      '  return true;',
      '}',
      'module.exports = { runWorker };',
    ].join('\n'));

    const service = new WorkspaceIntelligenceService();
    const manager = new WorkspaceManager({
      workspaceFolders: [
        { name: 'api', uri: { fsPath: first } },
        { name: 'worker', uri: { fsPath: second } },
      ],
    }, service);

    const index = await manager.indexWorkspace();

    assert.strictEqual(index.project.type, 'multi-root workspace');
    assert.strictEqual(index.totals.workspaces, 2);
    assert.ok(index.files.some((file) => file.relativePath === 'api/src/extension.js'));
    assert.ok(index.files.some((file) => file.relativePath === 'worker/src/worker.js'));
    assert.ok(manager.findSymbol('runWorker').some((symbol) => symbol.file === 'worker/src/worker.js'));
  });

  test('persists and restores the current index through workspace storage', async () => {
    const root = await createFixture();
    const store = {};
    const storageService = {
      getWorkspace(key) {
        return store[key];
      },
      setWorkspace(key, value) {
        store[key] = value;
      },
    };
    const service = new WorkspaceIntelligenceService();
    const manager = new WorkspaceManager({
      workspaceFolders: [{ name: 'fixture-extension', uri: { fsPath: root } }],
    }, service, { storageService });

    await manager.indexWorkspace();
    const restored = new WorkspaceManager({
      workspaceFolders: [{ name: 'fixture-extension', uri: { fsPath: root } }],
    }, new WorkspaceIntelligenceService(), { storageService });

    await restored.restoreIndex();
    assert.ok(restored.getFile('src/extension.js'));
  });

  test('answers project graph and symbol navigation queries', async () => {
    const root = await createFixture();
    const service = new WorkspaceIntelligenceService();
    const manager = new WorkspaceManager({
      workspaceFolders: [{ name: 'fixture-extension', uri: { fsPath: root } }],
    }, service);

    await manager.indexWorkspace();

    const symbol = manager.getSymbolLocation('AuthService');
    assert.strictEqual(symbol.file, 'src/services/authService.js');

    const references = manager.findReferences('AuthService');
    assert.ok(references.some((reference) => reference.file === 'src/extension.js'));

    const related = manager.getRelatedSymbols('activate');
    assert.ok(related.some((entry) => entry.name === 'AuthService'));

    const entryPoints = manager.getEntryPoints();
    assert.ok(entryPoints.some((entry) => entry.file === 'src/extension.js'));

    const important = manager.getImportantModules();
    assert.ok(important.some((entry) => entry.file === 'src/services/authService.js'));

    const pathToService = manager.getDependencyPath('src/extension.js', 'src/services/authService.js');
    assert.deepStrictEqual(pathToService, ['src/extension.js', 'src/services/authService.js']);
  });

  test('uses embedding-backed semantic search with explicit fallback when disabled', async () => {
    const root = await createFixture();
    const semanticService = new WorkspaceIntelligenceService();
    await semanticService.indexWorkspace(root);

    const semanticResults = semanticService.semanticSearch('authentication login token');
    assert.ok(semanticResults.length > 0);
    assert.ok(semanticResults.every((entry) => entry.mode === 'semantic-embedding'));
    assert.ok(semanticResults.some((entry) => entry.file === 'src/services/authService.js'));

    const fallbackService = new WorkspaceIntelligenceService({ embeddingProvider: false });
    await fallbackService.indexWorkspace(root);
    const fallbackResults = fallbackService.semanticSearch('authentication login token');
    assert.ok(fallbackResults.length > 0);
    assert.ok(fallbackResults.every((entry) => entry.mode === 'keyword-fallback'));
  });
});
