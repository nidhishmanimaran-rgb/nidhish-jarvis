const assert = require('assert');
const packageManifest = require('../package.json');
const { VIEW_IDS } = require('../src/views/jarvisViewIds');

suite('Activity bar integration', () => {
  test('contributes a Jarvis activity bar container', () => {
    const containers = packageManifest.contributes.viewsContainers.activitybar;
    const jarvis = containers.find((container) => container.id === 'nidhish-jarvis');

    assert.ok(jarvis);
    assert.strictEqual(jarvis.title, 'Jarvis');
    assert.strictEqual(jarvis.icon, 'media/jarvis.svg');
  });

  test('registers all Jarvis webview sections', () => {
    const views = packageManifest.contributes.views['nidhish-jarvis'];
    const ids = views.map((view) => view.id);

    assert.deepStrictEqual(ids, [
      VIEW_IDS.chat,
      VIEW_IDS.workspace,
      VIEW_IDS.memory,
      VIEW_IDS.agents,
      VIEW_IDS.git,
      VIEW_IDS.terminal,
      VIEW_IDS.settings,
    ]);
    assert.ok(views.every((view) => view.type === 'webview'));
  });

  test('activates when Jarvis views are opened', () => {
    Object.values(VIEW_IDS).forEach((viewId) => {
      assert.ok(packageManifest.activationEvents.includes(`onView:${viewId}`));
    });
  });
});
