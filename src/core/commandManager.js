class CommandManager {
  constructor(eventBus, notificationService) {
    this.eventBus = eventBus;
    this.notificationService = notificationService;
    this.commands = new Map();
  }

  register(commandId, handler) {
    if (this.commands.has(commandId)) {
      throw new Error(`Command ${commandId} is already registered.`);
    }
    this.commands.set(commandId, handler);
  }

  async execute(commandId, payload) {
    const handler = this.commands.get(commandId);
    if (!handler) {
      this.notificationService?.warn(`Unknown command ${commandId}`);
      return;
    }
    this.eventBus.publish('command:before', { commandId, payload });
    try {
      const result = await handler(payload);
      this.eventBus.publish('command:after', { commandId, payload, result });
      return result;
    } catch (error) {
      this.eventBus.publish('command:error', { commandId, payload, error });
      this.notificationService?.error(`Command failed: ${commandId}`);
      throw error;
    }
  }
}

module.exports = { CommandManager };
