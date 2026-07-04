const { ServiceContainer } = require('./container/serviceContainer');
const { EventBus } = require('./core/events');
const { CommandManager } = require('./core/commandManager');
const { CommandRegistrar } = require('./core/commandRegistrar');
const vscode = require('vscode');
const { ConfigurationService } = require('./core/configurationService');
const { SettingsService } = require('./core/settingsService');
const { LoggingService } = require('./core/loggingService');
const { NotificationService } = require('./core/notificationService');
const { ErrorHandler } = require('./core/errorHandler');
const { StorageService } = require('./core/storageService');
const { WorkspaceManager } = require('./core/workspaceManager');
const { LifecycleManager } = require('./core/lifecycleManager');
const { ProviderRegistry } = require('./services/providerService');
const { PluginManager } = require('./core/pluginManager');
const { TaskScheduler } = require('./core/taskScheduler');
const { WebviewManager } = require('./core/webviewManager');
const { StateService } = require('./core/stateService');

let containerInstance = null;

function createBootstrap(context) {
  const container = new ServiceContainer();

  container.register('eventBus', new EventBus());
  container.register('loggingService', new LoggingService());
  container.register('notificationService', new NotificationService());
  container.register('storageService', new StorageService(context.workspaceState, context.globalState));
  container.registerFactory('configurationService', (c) => new ConfigurationService(c.resolve('storageService'), {}, vscode));
  container.registerFactory('settingsService', (c) => new SettingsService(c.resolve('configurationService')));
  container.registerFactory('errorHandler', (c) => new ErrorHandler(c.resolve('loggingService'), c.resolve('notificationService')));
  container.registerFactory('workspaceManager', () => new WorkspaceManager(context.workspace));
  container.register('providerRegistry', new ProviderRegistry());
  container.register('pluginManager', new PluginManager(container.resolve('eventBus'), container));
  container.register('taskScheduler', new TaskScheduler());
  container.register('webviewManager', new WebviewManager(context));
  container.register('lifecycleManager', new LifecycleManager(container.resolve('eventBus')));
  container.register('commandManager', new CommandManager(container.resolve('eventBus'), container.resolve('notificationService')));
  container.register('commandRegistrar', new CommandRegistrar(context, container.resolve('commandManager')));
  container.register('stateService', new StateService());

  // Assistant dependencies
  const { AIService } = require('./services/aiService');
  const { ConversationManager } = require('./services/conversationManager');
  const { EventBus: FoundationEventBus } = require('./services/eventBus');
  const { ConfigurationService: FoundationConfigurationService } = require('./services/configurationService');
  const { AssistantWebviewHost } = require('./assistantWebviewHost');

  const configurationService = new FoundationConfigurationService(context.workspaceState || context.globalState);
  container.register('aiService', new AIService(container.resolve('providerRegistry'), container.resolve('loggingService'), configurationService));
  container.register('conversationManager', new ConversationManager({ maxMessages: configurationService.get('maxHistory') }));
  container.register('foundationEventBus', new FoundationEventBus());
  container.register('assistantWebviewHost', new AssistantWebviewHost(container));

  return container;
}

function registerCommands(container) {
  const commandRegistrar = container.resolve('commandRegistrar');
  const notificationService = container.resolve('notificationService');
  const webviewManager = container.resolve('webviewManager');

  commandRegistrar.register('nidhish-jarvis.openFoundationPanel', async () => {
    webviewManager.openFoundationPanel();
  });

  commandRegistrar.register('nidhish-jarvis.showStatus', async () => {
    notificationService.info('Jarvis foundation is active.');
  });

  commandRegistrar.register('nidhish-jarvis.openAssistant', async () => {
    const assistantHost = container.resolve('assistantWebviewHost');
    assistantHost.open();
  });

  commandRegistrar.register('nidhish-jarvis.exportHistory', async () => {
    notificationService.info('Export history is pending architecture completion.');
  });
}

function activate(context) {
  containerInstance = createBootstrap(context);
  registerCommands(containerInstance);
  return containerInstance;
}

function deactivate() {
  if (!containerInstance) {
    return;
  }

  try {
    containerInstance.resolve('commandRegistrar')?.dispose();
  } catch {
    // intentionally ignore any dispose failure
  }

  containerInstance = null;
}

module.exports = { createBootstrap, activate, deactivate };
