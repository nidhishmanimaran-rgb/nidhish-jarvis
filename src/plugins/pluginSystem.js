class PluginSystem {
  constructor(options = {}) {
    this.storage = options.storage || null;
    this.plugins = new Map();
  }

  validateManifest(manifest) {
    if (!manifest?.id || !manifest?.name || !manifest?.version) {
      throw new Error('Plugin manifest requires id, name, and version.');
    }
    const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description || '',
      contributes: manifest.contributes || {},
      permissions,
      enabled: manifest.enabled !== false,
    };
  }

  registerManifest(manifest) {
    const plugin = this.validateManifest(manifest);
    this.plugins.set(plugin.id, plugin);
    this.persist();
    return plugin;
  }

  list() {
    return [...this.plugins.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  setEnabled(id, enabled) {
    const plugin = this.plugins.get(id);
    if (!plugin) throw new Error(`Unknown plugin: ${id}`);
    plugin.enabled = Boolean(enabled);
    this.persist();
    return plugin;
  }

  authorize(id, permission) {
    const plugin = this.plugins.get(id);
    if (!plugin?.enabled) return { ok: false, reason: 'Plugin disabled or missing.' };
    if (!plugin.permissions.includes(permission) && !plugin.permissions.includes('*')) {
      return { ok: false, reason: `Plugin lacks permission: ${permission}` };
    }
    return { ok: true };
  }

  persist() {
    this.storage?.setWorkspace?.('jarvis.plugins', this.list());
  }
}

module.exports = { PluginSystem };
