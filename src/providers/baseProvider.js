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

  async listModels() {
    return [];
  }

  getCapabilities() {
    return {
      chat: false,
      streaming: false,
      models: false,
      toolCalling: false,
      vision: false,
      embeddings: false,
      cancellation: false,
      contextWindow: null,
    };
  }

  async health() {
    return true;
  }
}

module.exports = { BaseProvider };
