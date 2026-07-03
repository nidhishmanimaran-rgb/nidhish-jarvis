class BaseProvider {
  constructor(options = {}) {
    this.options = options;
  }

  async init() {
    return true;
  }

  async generate(input) {
    return { output: `Base provider received: ${input}` };
  }

  async health() {
    return true;
  }
}

module.exports = { BaseProvider };