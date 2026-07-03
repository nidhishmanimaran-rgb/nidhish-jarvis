class LifecycleManager {
  constructor(eventBus) {
    this.eventBus = eventBus;
  }

  activate() {
    this.eventBus.publish('lifecycle:activate');
  }

  deactivate() {
    this.eventBus.publish('lifecycle:deactivate');
  }
}

module.exports = { LifecycleManager };
