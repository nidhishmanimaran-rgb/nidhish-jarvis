class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  subscribe(eventName, listener, { priority = 0 } = {}) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    const listeners = this.listeners.get(eventName);
    listeners.push({ listener, priority });
    listeners.sort((a, b) => b.priority - a.priority);
    return {
      dispose: () => this.unsubscribe(eventName, listener),
    };
  }

  unsubscribe(eventName, listener) {
    const listeners = this.listeners.get(eventName);
    if (!listeners) {
      return;
    }
    this.listeners.set(eventName, listeners.filter((entry) => entry.listener !== listener));
  }

  async publish(eventName, payload) {
    const listeners = this.listeners.get(eventName) || [];
    for (const entry of listeners.slice()) {
      try {
        await entry.listener(payload);
      } catch (error) {
        console.error(`[EventBus] Listener error for ${eventName}:`, error);
      }
    }
  }
}

module.exports = { EventBus };
