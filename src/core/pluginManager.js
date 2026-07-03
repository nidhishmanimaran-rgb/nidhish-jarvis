class PluginManager {
  constructor(eventBus, serviceContainer) {
    this.eventBus = eventBus;
    this.serviceContainer = serviceContainer;
    this.plugins = new Map();
  }

  register(plugin) {
    if (!plugin || !plugin.id) {
      throw new Error('Plugin must have an id.');
    }
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Plugin ${plugin.id} is already registered.`);
    }
    this.plugins.set(plugin.id, plugin);
    plugin.register?.(this.serviceContainer, this.eventBus);
    return plugin;
  }

  get(id) {
    return this.plugins.get(id);
  }

  list() {
    return Array.from(this.plugins.values());
  }
}

module.exports = { PluginManager };
