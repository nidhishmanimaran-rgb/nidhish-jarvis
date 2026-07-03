class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  subscribe(eventName, listener) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }

    const handlers = this.listeners.get(eventName);
    handlers.add(listener);

    return {
      dispose: () => handlers.delete(listener),
    };
  }

  publish(eventName, payload) {
    const handlers = this.listeners.get(eventName);
    if (!handlers) {
      return;
    }

    handlers.forEach((listener) => listener(payload));
  }
}

module.exports = { EventBus };
