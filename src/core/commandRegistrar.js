const vscode = require('vscode');

class CommandRegistrar {
  constructor(context, commandManager) {
    this.context = context;
    this.commandManager = commandManager;
    this.subscriptions = [];
  }

  register(commandId, handler) {
    this.commandManager.register(commandId, handler);

    const disposable = vscode.commands.registerCommand(commandId, async (payload) => {
      return this.commandManager.execute(commandId, payload);
    });

    this.context.subscriptions.push(disposable);
    this.subscriptions.push(disposable);
    return disposable;
  }

  dispose() {
    this.subscriptions.forEach((disposable) => disposable.dispose?.());
    this.subscriptions = [];
  }
}

module.exports = { CommandRegistrar };