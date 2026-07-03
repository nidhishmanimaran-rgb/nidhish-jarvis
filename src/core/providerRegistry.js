class ProviderRegistry {
  constructor() {
    this.providers = new Map();
  }

  register(name, providerClass) {
    if (this.providers.has(name)) {
      throw new Error(`Provider ${name} is already registered.`);
    }
    this.providers.set(name, providerClass);
    return providerClass;
  }

  get(name) {
    return this.providers.get(name);
  }

  async create(name, options = {}) {
    const Provider = this.providers.get(name);
    if (!Provider) {
      throw new Error(`Provider ${name} is not registered.`);
    }

    const instance = new Provider(options);
    if (typeof instance.init === 'function') {
      await instance.init();
    }

    return instance;
  }
}

module.exports = { ProviderRegistry };
