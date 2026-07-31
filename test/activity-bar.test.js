const assert = require('assert');
const packageManifest = require('../package.json');
const { VIEW_IDS } = require('../src/views/jarvisViewIds');

suite('Activity bar integration', () => {
  test('contributes a Jarvis activity bar container', () => {
    const containers = packageManifest.contributes.viewsContainers.activitybar;
    const jarvis = containers.find((container) => container.id === 'nidhish-jarvis');

    assert.ok(jarvis);
    assert.strictEqual(jarvis.title, "Nidhish's Jarvis");
    assert.strictEqual(jarvis.icon, 'media/jarvis-activity.svg');
  });

  test('registers all Jarvis webview sections', () => {
    const views = packageManifest.contributes.views['nidhish-jarvis'];
    const ids = views.map((view) => view.id);

    assert.deepStrictEqual(ids, [
      VIEW_IDS.chat,
      VIEW_IDS.workspace,
      VIEW_IDS.search,
      VIEW_IDS.files,
      VIEW_IDS.memory,
      VIEW_IDS.agents,
      VIEW_IDS.git,
      VIEW_IDS.terminal,
      VIEW_IDS.models,
      VIEW_IDS.settings,
    ]);
    assert.ok(views.every((view) => view.type === 'webview'));
  });

  test('relies on generated activation events for contributed views', () => {
    assert.strictEqual(packageManifest.activationEvents, undefined);
    Object.values(VIEW_IDS).forEach((viewId) => {
      assert.ok(packageManifest.contributes.views['nidhish-jarvis'].some((view) => view.id === viewId));
    });
  });

  test('contributes editor submenu and core command palette actions', () => {
    const commands = new Set(packageManifest.contributes.commands.map((entry) => entry.command));
    [
      'nidhish-jarvis.newChat',
      'nidhish-jarvis.clearChat',
      'nidhish-jarvis.openSettings',
      'nidhish-jarvis.explainSelection',
      'nidhish-jarvis.fixSelection',
      'nidhish-jarvis.explainGitChanges',
      'nidhish-jarvis.generateCommitMessage',
    ].forEach((command) => assert.ok(commands.has(command), command));
    assert.ok(packageManifest.contributes.menus['editor/context'].some((entry) => entry.submenu === 'nidhish-jarvis.editorMenu'));
    assert.ok(packageManifest.contributes.menus['explorer/context'].some((entry) => entry.command === 'nidhish-jarvis.indexWorkspace'));
  });
});
