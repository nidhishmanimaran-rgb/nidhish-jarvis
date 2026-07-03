function createPluginLoader() {
  const plugins = [];

  return {
    register(plugin) {
      plugins.push(plugin);
      return plugin;
    },
    list() {
      return plugins.slice();
    },
    load(registry) {
      plugins.forEach((plugin) => plugin.register?.(registry));
      return registry;
    },
  };
}

module.exports = { createPluginLoader };
