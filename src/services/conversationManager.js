class ConversationManager {
  constructor(options = {}) {
    this.maxMessages = options.maxMessages || 50;
    this.messages = [];
  }

  addMessage(message) {
    this.messages.push(message);
    if (this.messages.length > this.maxMessages) {
      this.messages.splice(0, this.messages.length - this.maxMessages);
    }
    return this.messages.length;
  }

  getHistory() {
    return this.messages.slice();
  }

  exportHistory() {
    return JSON.stringify(this.messages, null, 2);
  }

  clear() {
    this.messages = [];
  }
}

module.exports = { ConversationManager };
