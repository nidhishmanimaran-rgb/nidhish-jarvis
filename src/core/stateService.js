class StateService {
  constructor() {
    this.state = {
      workspace: {},
      extension: {},
      conversation: {},
      ui: {},
      task: {},
      memory: {},
      settings: {},
    };
  }

  get(scope, key) {
    const container = this.state[scope];
    return container ? container[key] : undefined;
  }

  set(scope, key, value) {
    if (!this.state[scope]) {
      this.state[scope] = {};
    }
    this.state[scope][key] = value;
  }

  getScope(scope) {
    return { ...this.state[scope] };
  }
}

module.exports = { StateService };