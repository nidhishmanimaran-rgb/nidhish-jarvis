class ServiceContainer {
  constructor() {
    this.services = new Map();
    this.factories = new Map();
  }

  register(name, instance) {
    if (this.services.has(name) || this.factories.has(name)) {
      throw new Error(`Service ${name} is already registered.`);
    }
    this.services.set(name, instance);
    return instance;
  }

  registerFactory(name, factory) {
    if (this.services.has(name) || this.factories.has(name)) {
      throw new Error(`Service ${name} is already registered.`);
    }
    this.factories.set(name, factory);
    return factory;
  }

  resolve(name) {
    if (this.services.has(name)) {
      return this.services.get(name);
    }
    if (this.factories.has(name)) {
      const instance = this.factories.get(name)(this);
      this.services.set(name, instance);
      this.factories.delete(name);
      return instance;
    }
    throw new Error(`Service ${name} is not registered.`);
  }

  has(name) {
    return this.services.has(name) || this.factories.has(name);
  }
}

module.exports = { ServiceContainer };
