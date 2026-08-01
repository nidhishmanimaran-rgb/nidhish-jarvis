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
const { WorkspaceIntelligenceService } = require('./services/workspaceIntelligenceService');
const { VIEW_IDS } = require('./views/jarvisViewIds');
const { createJarvisViewProviders } = require('./views/jarvisViewProviders');
const { ContextBuilder } = require('./context/contextBuilder');
const { SecretService } = require('./security/secretService');
const { SafeEditService } = require('./editing/safeEditService');
const { DiffPreviewService, createVsCodeEditAdapter, relativeWorkspacePath } = require('./editing/diffPreviewService');
const { RefactoringService } = require('./refactoring/refactoringService');
const { DebuggerService } = require('./debug/debuggerService');
const { TerminalAgentService } = require('./terminal/terminalAgentService');
const { GitAssistantService } = require('./git/gitAssistantService');
const { AgentManager } = require('./agents/agentManager');
const { McpManager } = require('./mcp/mcpManager');
const { PluginSystem } = require('./plugins/pluginSystem');
const { AutomationManager } = require('./automation/automationManager');

let containerInstance = null;

function createBootstrap(context) {
  const container = new ServiceContainer();

  container.register('eventBus', new EventBus());
  container.register('loggingService', new LoggingService());
  container.register('notificationService', new NotificationService());
  container.register('storageService', new StorageService(context.workspaceState, context.globalState));
  container.register('secretService', new SecretService(context.secrets));
  container.registerFactory('configurationService', (c) => new ConfigurationService(c.resolve('storageService'), {}, vscode));
  container.registerFactory('settingsService', (c) => new SettingsService(c.resolve('configurationService')));
  container.registerFactory('errorHandler', (c) => new ErrorHandler(c.resolve('loggingService'), c.resolve('notificationService')));
  container.register('workspaceIntelligenceService', new WorkspaceIntelligenceService());
  container.registerFactory('workspaceManager', (c) => new WorkspaceManager(vscode.workspace, c.resolve('workspaceIntelligenceService'), {
    configurationService: c.resolve('configurationService'),
    storageService: c.resolve('storageService'),
  }));
  container.registerFactory('contextBuilder', (c) => new ContextBuilder({
    workspaceManager: c.resolve('workspaceManager'),
    maxTokens: Number(c.resolve('configurationService').get('context.maxTokens') || 3000),
  }));
  container.registerFactory('safeEditService', () => new SafeEditService({
    fs: createVsCodeEditAdapter(vscode),
    rootPath: vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath || '',
  }));
  container.registerFactory('diffPreviewService', () => new DiffPreviewService({
    vscode,
    storageUri: context.globalStorageUri,
  }));
  container.register('refactoringService', new RefactoringService());
  container.register('debuggerService', new DebuggerService());
  container.register('terminalAgentService', new TerminalAgentService());
  container.register('gitAssistantService', new GitAssistantService());
  container.register('mcpManager', new McpManager({ storage: container.resolve('storageService') }));
  container.register('pluginSystem', new PluginSystem({ storage: container.resolve('storageService') }));
  const automationManager = new AutomationManager({ storage: container.resolve('storageService') });
  automationManager.registerAction('indexWorkspace', () => container.resolve('workspaceManager').indexWorkspace());
  automationManager.registerAction('analyzeProblems', () => vscode.commands.executeCommand('nidhish-jarvis.analyzeProblems'));
  container.register('automationManager', automationManager);
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
  const { MemoryManager } = require('./services/memoryManager');
  const { EventBus: FoundationEventBus } = require('./services/eventBus');
  const { ConfigurationService: FoundationConfigurationService } = require('./services/configurationService');
  const { AssistantWebviewHost } = require('./assistantWebviewHost');

  const configurationService = new FoundationConfigurationService(context.workspaceState || context.globalState);
  container.register('aiService', new AIService(
    container.resolve('providerRegistry'),
    container.resolve('loggingService'),
    configurationService,
    container.resolve('secretService'),
  ));
  container.register('conversationManager', new ConversationManager({ maxMessages: configurationService.get('maxHistory') }));
  container.register('memoryManager', new MemoryManager({
    storage: container.resolve('storageService'),
    enabled: configurationService.get('memoryEnabled'),
  }));
  container.register('foundationEventBus', new FoundationEventBus());
  container.register('assistantWebviewHost', new AssistantWebviewHost(container));
  container.registerFactory('agentManager', (c) => new AgentManager({
    contextBuilder: c.resolve('contextBuilder'),
    aiService: c.resolve('aiService'),
  }));

  return container;
}

function registerViews(container) {
  const context = container.resolve('webviewManager').context;
  const providers = createJarvisViewProviders(container);

  Object.entries(providers).forEach(([viewId, provider]) => {
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(viewId, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }));
  });
}

function runBackground(container, label, task) {
  Promise.resolve()
    .then(task)
    .catch((error) => {
      try {
        container.resolve('loggingService')?.error?.(`Jarvis background initialization failed: ${label}`, {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      } catch {
        // Never fail activation while reporting a background startup error.
      }
    });
}

function registerStatusBar(container) {
  const context = container.resolve('webviewManager').context;
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.name = 'Jarvis';
  statusBar.text = 'Jarvis: Ready';
  statusBar.tooltip = 'Open Jarvis Assistant';
  statusBar.command = 'nidhish-jarvis.openAssistant';
  statusBar.show();
  container.register('statusBar', statusBar);
  context.subscriptions.push(statusBar);
}

function extractProposedCode(responseText) {
  const text = String(responseText || '').trim();
  const fenced = /```[a-zA-Z0-9_#+.-]*\s*\n([\s\S]*?)```/.exec(text);
  return (fenced ? fenced[1] : text).trim();
}

async function runSelectionEdit(container, options) {
  const editor = vscode.window.activeTextEditor;
  const notificationService = container.resolve('notificationService');
  if (!editor) {
    notificationService.warn('Open a file before running Jarvis editing commands.');
    return null;
  }
  if (editor.selection.isEmpty) {
    notificationService.warn('Select code before running this Jarvis command.');
    return null;
  }

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
  if (!workspaceFolder) {
    notificationService.warn('Jarvis can only edit files inside the active workspace.');
    return null;
  }

  const original = editor.document.getText(editor.selection);
  const instruction = await vscode.window.showInputBox({
    title: options.title,
    prompt: options.prompt,
    placeHolder: options.placeHolder,
  });
  if (!instruction && options.requiresInstruction !== false) {
    return null;
  }

  const contextBuilder = container.resolve('contextBuilder');
  const context = contextBuilder.build(`${options.intent}: ${instruction || ''}`, {
    selectionText: original,
    currentFile: relativeWorkspacePath(workspaceFolder.uri.fsPath, editor.document.uri.fsPath),
    currentFileText: editor.document.getText(),
    maxTokens: 2500,
  });
  const prompt = [
    context.promptPrefix,
    `[Task]\n${options.aiPrompt}`,
    instruction ? `\n[User Instruction]\n${instruction}` : '',
    '\n[Selected Code]\n',
    original,
    '\nReturn only the complete replacement code for the selected range. Do not include explanations.',
  ].join('\n');

  const result = await container.resolve('aiService').ask(prompt);
  const proposed = extractProposedCode(result?.content || result?.output || '');
  if (!proposed) {
    notificationService.warn('Jarvis did not return replacement code.');
    return null;
  }

  const relativePath = relativeWorkspacePath(workspaceFolder.uri.fsPath, editor.document.uri.fsPath);
  const safeEditService = new SafeEditService({
    fs: createVsCodeEditAdapter(vscode),
    rootPath: workspaceFolder.uri.fsPath,
  });
  const proposal = safeEditService.createProposal([{
    file: relativePath,
    operation: 'modify',
    range: editor.selection,
    original,
    proposed,
  }], { rootPath: workspaceFolder.uri.fsPath });

  const diffPreviewService = container.resolve('diffPreviewService');
  const outcome = await diffPreviewService.reviewAndApply(proposal, safeEditService);
  if (outcome.applied) {
    notificationService.info(`Jarvis applied ${outcome.changes} approved change(s).`);
  } else {
    notificationService.info('Jarvis edit proposal rejected.');
  }
  return { proposal, outcome };
}

function registerCommands(container) {
  const commandRegistrar = container.resolve('commandRegistrar');
  const notificationService = container.resolve('notificationService');
  const webviewManager = container.resolve('webviewManager');
  const providerChoices = ['ollama', 'openai', 'openrouter', 'azureOpenai', 'custom'];

  commandRegistrar.register('nidhish-jarvis.openFoundationPanel', async () => {
    webviewManager.openFoundationPanel();
  });

  commandRegistrar.register('nidhish-jarvis.showStatus', async () => {
    const statusBar = container.resolve('statusBar');
    statusBar.text = 'Jarvis: Ready';
    notificationService.info('Jarvis foundation is active.');
  });

  commandRegistrar.register('nidhish-jarvis.openSettings', async () => {
    return vscode.commands.executeCommand('workbench.action.openSettings', 'jarvis');
  });

  commandRegistrar.register('nidhish-jarvis.newChat', async () => {
    container.resolve('conversationManager').clear();
    await vscode.commands.executeCommand('nidhish-jarvis.openAssistant');
    notificationService.info('Jarvis started a new chat.');
  });

  commandRegistrar.register('nidhish-jarvis.clearChat', async () => {
    container.resolve('conversationManager').clear();
    notificationService.info('Jarvis chat history cleared.');
  });

  commandRegistrar.register('nidhish-jarvis.indexWorkspace', async () => {
    const workspaceManager = container.resolve('workspaceManager');
    const statusBar = container.resolve('statusBar');
    statusBar.text = 'Jarvis: Indexing';
    try {
      const index = await workspaceManager.indexWorkspace();
      statusBar.text = 'Jarvis: Ready';
      notificationService.info(`Jarvis indexed ${index.totals.indexedFiles} project files.`);
      return index;
    } catch (error) {
      statusBar.text = 'Jarvis: Error';
      throw error;
    }
  });

  commandRegistrar.register('nidhish-jarvis.reindexWorkspace', async () => {
    const workspaceManager = container.resolve('workspaceManager');
    const statusBar = container.resolve('statusBar');
    statusBar.text = 'Jarvis: Indexing';
    try {
      const index = await workspaceManager.reindexWorkspace();
      statusBar.text = 'Jarvis: Ready';
      notificationService.info(`Jarvis reindexed ${index.totals.indexedFiles} project files.`);
      return index;
    } catch (error) {
      statusBar.text = 'Jarvis: Error';
      throw error;
    }
  });

  commandRegistrar.register('nidhish-jarvis.explainProject', async () => {
    const workspaceManager = container.resolve('workspaceManager');
    if (!workspaceManager.currentIndex) {
      await workspaceManager.indexWorkspace();
    }
    const summary = workspaceManager.getProjectSummary();
    notificationService.info(summary);
    return summary;
  });

  commandRegistrar.register('nidhish-jarvis.searchWorkspace', async () => {
    const workspaceManager = container.resolve('workspaceManager');
    if (!workspaceManager.currentIndex) {
      await workspaceManager.indexWorkspace();
    }

    const query = await vscode.window.showInputBox({
      title: 'Jarvis Semantic Search',
      prompt: 'Search files, symbols, imports, and summaries',
      placeHolder: 'authentication service, extension activation, provider registry...',
    });
    if (!query) {
      return [];
    }

    const results = workspaceManager.searchIndex(query, { mode: 'hybrid' });
    await vscode.window.showQuickPick(results.map((entry) => ({
      label: entry.file,
      description: entry.language,
      detail: `${entry.summary} Score: ${entry.score}`,
      entry,
    })), { title: 'Jarvis Workspace Search', matchOnDescription: true, matchOnDetail: true });
    return results;
  });

  commandRegistrar.register('nidhish-jarvis.findSymbol', async () => {
    const workspaceManager = container.resolve('workspaceManager');
    if (!workspaceManager.currentIndex) {
      await workspaceManager.indexWorkspace();
    }

    const query = await vscode.window.showInputBox({
      title: 'Jarvis Symbol Navigation',
      prompt: 'Find a class, interface, method, function, or variable',
      placeHolder: 'WorkspaceManager, activate, AuthService...',
    });
    if (!query) {
      return [];
    }

    const results = workspaceManager.findSymbol(query);
    await vscode.window.showQuickPick(results.map((symbol) => ({
      label: symbol.name,
      description: `${symbol.kind} - ${symbol.file}:${symbol.line}`,
      detail: symbol.language,
      symbol,
    })), { title: 'Jarvis Symbols', matchOnDescription: true, matchOnDetail: true });
    return results;
  });

  commandRegistrar.register('nidhish-jarvis.explainSymbol', async () => {
    const workspaceManager = container.resolve('workspaceManager');
    if (!workspaceManager.currentIndex) {
      await workspaceManager.indexWorkspace();
    }

    const query = await vscode.window.showInputBox({
      title: 'Jarvis Explain Symbol',
      prompt: 'Enter a symbol name to explain from the workspace graph',
      placeHolder: 'WorkspaceManager, activate, AuthService...',
    });
    if (!query) {
      return null;
    }

    const symbol = workspaceManager.getSymbolLocation(query);
    if (!symbol) {
      notificationService.warn(`Jarvis could not find symbol "${query}".`);
      return null;
    }

    const related = workspaceManager.getRelatedSymbols(symbol.name, { limit: 8 });
    const references = workspaceManager.findReferences(symbol.name, { limit: 8 });
    const summary = [
      `${symbol.name} is a ${symbol.kind} in ${symbol.file}:${symbol.line}.`,
      related.length ? `Related symbols: ${related.map((entry) => `${entry.name} (${entry.file}:${entry.line})`).join(', ')}.` : 'No related indexed symbols found.',
      references.length ? `References found: ${references.length}.` : 'No references found in the index.',
    ].join('\n');
    notificationService.info(summary);
    return { symbol, related, references, summary };
  });

  commandRegistrar.register('nidhish-jarvis.findReferences', async () => {
    const workspaceManager = container.resolve('workspaceManager');
    if (!workspaceManager.currentIndex) {
      await workspaceManager.indexWorkspace();
    }

    const query = await vscode.window.showInputBox({
      title: 'Jarvis Find References',
      prompt: 'Find indexed references to a symbol',
      placeHolder: 'AuthService, activate, runWorker...',
    });
    if (!query) {
      return [];
    }

    const references = workspaceManager.findReferences(query);
    await vscode.window.showQuickPick(references.map((reference) => ({
      label: reference.file,
      description: `${reference.line}:${reference.column}`,
      detail: reference.preview,
      reference,
    })), { title: 'Jarvis References', matchOnDescription: true, matchOnDetail: true });
    return references;
  });

  commandRegistrar.register('nidhish-jarvis.explainSelection', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      notificationService.warn('Select code before asking Jarvis to explain it.');
      return null;
    }
    const text = editor.document.getText(editor.selection);
    const result = await container.resolve('aiService').ask(`Explain this code clearly:\n\n${text}`);
    notificationService.info(result?.content || result?.output || 'Jarvis did not return an explanation.');
    return result;
  });

  commandRegistrar.register('nidhish-jarvis.fixSelection', () => runSelectionEdit(container, {
    title: 'Jarvis: Fix Selection',
    prompt: 'Describe the bug or desired fix',
    placeHolder: 'Fix null handling and preserve existing behavior',
    intent: 'fix selected code',
    aiPrompt: 'Fix the selected code while preserving its public behavior unless the user asks otherwise.',
  }));

  commandRegistrar.register('nidhish-jarvis.refactorSelection', () => runSelectionEdit(container, {
    title: 'Jarvis: Refactor Selection',
    prompt: 'Describe the refactor goal',
    placeHolder: 'Make this easier to read without changing behavior',
    intent: 'refactor selected code',
    aiPrompt: 'Refactor the selected code without changing behavior.',
  }));

  commandRegistrar.register('nidhish-jarvis.optimizeSelection', () => runSelectionEdit(container, {
    title: 'Jarvis: Optimize Selection',
    prompt: 'Describe the optimization goal',
    placeHolder: 'Reduce repeated work and keep output identical',
    intent: 'optimize selected code',
    aiPrompt: 'Optimize the selected code while preserving behavior.',
  }));

  commandRegistrar.register('nidhish-jarvis.generateDocumentation', () => runSelectionEdit(container, {
    title: 'Jarvis: Generate Documentation',
    prompt: 'Describe the documentation style',
    placeHolder: 'Add concise JSDoc comments',
    intent: 'document selected code',
    aiPrompt: 'Add useful documentation comments to the selected code. Keep implementation logic unchanged.',
    requiresInstruction: false,
  }));

  commandRegistrar.register('nidhish-jarvis.generateTests', () => runSelectionEdit(container, {
    title: 'Jarvis: Generate Tests',
    prompt: 'Describe the expected test style',
    placeHolder: 'Generate focused unit tests',
    intent: 'generate tests for selected code',
    aiPrompt: 'Generate test code for the selected code.',
    requiresInstruction: false,
  }));

  commandRegistrar.register('nidhish-jarvis.reviewCode', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) {
      notificationService.warn('Select code before asking Jarvis to review it.');
      return null;
    }
    const text = editor.document.getText(editor.selection);
    const result = await container.resolve('aiService').ask(`Review this code for bugs, security risks, and missing tests:\n\n${text}`);
    notificationService.info(result?.content || result?.output || 'Jarvis did not return a review.');
    return result;
  });

  commandRegistrar.register('nidhish-jarvis.renameAcrossProject', async () => {
    const workspaceManager = container.resolve('workspaceManager');
    if (!workspaceManager.currentIndex) {
      await workspaceManager.indexWorkspace();
    }
    const rootPath = container.resolve('refactoringService').getRootPathForIndex(workspaceManager.currentIndex);
    if (!rootPath) {
      notificationService.warn('Multi-root rename requires running the command from a single-root workspace for now.');
      return null;
    }
    const oldName = await vscode.window.showInputBox({ title: 'Jarvis Rename Across Project', prompt: 'Identifier to rename' });
    if (!oldName) return null;
    const newName = await vscode.window.showInputBox({ title: 'Jarvis Rename Across Project', prompt: `Rename ${oldName} to` });
    if (!newName) return null;

    const safeEditService = new SafeEditService({ fs: createVsCodeEditAdapter(vscode), rootPath });
    const proposal = await container.resolve('refactoringService').createRenameProposal({
      index: workspaceManager.currentIndex,
      rootPath,
      oldName,
      newName,
      safeEditService,
    });
    const outcome = await container.resolve('diffPreviewService').reviewAndApply(proposal, safeEditService);
    notificationService.info(outcome.applied ? `Jarvis renamed ${oldName} to ${newName}.` : 'Jarvis rename rejected.');
    return { proposal, outcome };
  });

  commandRegistrar.register('nidhish-jarvis.updateImports', async () => {
    const workspaceManager = container.resolve('workspaceManager');
    if (!workspaceManager.currentIndex) {
      await workspaceManager.indexWorkspace();
    }
    const rootPath = container.resolve('refactoringService').getRootPathForIndex(workspaceManager.currentIndex);
    if (!rootPath) {
      notificationService.warn('Multi-root import updates require a single-root workspace for now.');
      return null;
    }
    const fromImport = await vscode.window.showInputBox({ title: 'Jarvis Update Imports', prompt: 'Existing import path' });
    if (!fromImport) return null;
    const toImport = await vscode.window.showInputBox({ title: 'Jarvis Update Imports', prompt: `Replace ${fromImport} with` });
    if (!toImport) return null;

    const safeEditService = new SafeEditService({ fs: createVsCodeEditAdapter(vscode), rootPath });
    const proposal = await container.resolve('refactoringService').createImportUpdateProposal({
      index: workspaceManager.currentIndex,
      rootPath,
      fromImport,
      toImport,
      safeEditService,
    });
    const outcome = await container.resolve('diffPreviewService').reviewAndApply(proposal, safeEditService);
    notificationService.info(outcome.applied ? `Jarvis updated imports from ${fromImport} to ${toImport}.` : 'Jarvis import update rejected.');
    return { proposal, outcome };
  });

  commandRegistrar.register('nidhish-jarvis.analyzeProblems', async () => {
    const debuggerService = container.resolve('debuggerService');
    const diagnostics = debuggerService.collectDiagnostics(vscode, vscode.workspace.workspaceFolders || []);
    if (!diagnostics.length) {
      notificationService.info('Jarvis found no current VS Code diagnostics.');
      return { diagnostics: [], summary: debuggerService.summarizeDiagnostics([]) };
    }
    const prompt = debuggerService.createPrompt(diagnostics);
    const context = container.resolve('contextBuilder').build('@problems analyze diagnostics', { diagnostics });
    const result = await container.resolve('aiService').ask(`${context.promptPrefix}\n\n${prompt}`);
    notificationService.info(result?.content || result?.output || 'Jarvis analyzed the current problems.');
    return { diagnostics, result };
  });

  commandRegistrar.register('nidhish-jarvis.explainError', async () => {
    const debuggerService = container.resolve('debuggerService');
    const diagnostics = debuggerService.collectDiagnostics(vscode, vscode.workspace.workspaceFolders || []);
    if (!diagnostics.length) {
      notificationService.info('Jarvis found no current VS Code diagnostics to explain.');
      return null;
    }
    const prompt = debuggerService.createPrompt(diagnostics.slice(0, 5), { limit: 5 });
    const result = await container.resolve('aiService').ask(prompt);
    notificationService.info(result?.content || result?.output || 'Jarvis explained the current error.');
    return { diagnostics: diagnostics.slice(0, 5), result };
  });

  commandRegistrar.register('nidhish-jarvis.fixError', async () => {
    const debuggerService = container.resolve('debuggerService');
    const diagnostics = debuggerService.collectDiagnostics(vscode, vscode.workspace.workspaceFolders || []);
    if (!diagnostics.length) {
      notificationService.info('Jarvis found no current VS Code diagnostics to fix.');
      return null;
    }
    const prompt = debuggerService.createPrompt(diagnostics.slice(0, 5), { limit: 5, fix: true });
    const context = container.resolve('contextBuilder').build('@problems propose a safe fix', { diagnostics });
    const result = await container.resolve('aiService').ask([
      context.promptPrefix,
      prompt,
      'Return an explanation and, if you propose code changes, keep them as clearly fenced code for user review.',
    ].join('\n\n'));
    notificationService.info(result?.content || result?.output || 'Jarvis proposed a diagnostic fix.');
    return { diagnostics: diagnostics.slice(0, 5), result };
  });

  commandRegistrar.register('nidhish-jarvis.explainTerminalOutput', async () => {
    const output = await vscode.window.showInputBox({
      title: 'Jarvis Explain Terminal Output',
      prompt: 'Paste terminal output or error text',
      ignoreFocusOut: true,
    });
    if (!output) return null;
    const prompt = container.resolve('terminalAgentService').explainFailure('terminal output', output);
    const result = await container.resolve('aiService').ask(prompt);
    notificationService.info(result?.content || result?.output || 'Jarvis analyzed the terminal output.');
    return result;
  });

  commandRegistrar.register('nidhish-jarvis.runApprovedCommand', async () => {
    const command = await vscode.window.showInputBox({
      title: 'Jarvis Run Approved Command',
      prompt: 'Enter a command to classify and optionally run',
      ignoreFocusOut: true,
    });
    if (!command) return null;
    const terminalAgent = container.resolve('terminalAgentService');
    const classification = terminalAgent.classifyCommand(command);
    let approved = !classification.requiresApproval;
    if (!approved) {
      const choice = await vscode.window.showWarningMessage(
        `Run command? Risk: ${classification.risk}. ${classification.reason}`,
        { modal: true },
        'Run',
        'Cancel',
      );
      approved = choice === 'Run';
    }
    if (!approved) {
      notificationService.info('Jarvis command execution cancelled.');
      return { command, classification, cancelled: true };
    }
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    const result = await terminalAgent.runApproved(command, { approved, cwd });
    notificationService.info(result.ok ? `Jarvis command completed: ${command}` : `Jarvis command failed: ${command}`);
    return result;
  });

  commandRegistrar.register('nidhish-jarvis.showGitStatus', async () => {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    if (!cwd) {
      notificationService.warn('Open a workspace before using Jarvis Git commands.');
      return null;
    }
    const git = container.resolve('gitAssistantService');
    const status = await git.getStatus(cwd);
    const summary = git.summarizeStatus(status);
    notificationService.info(`Git ${summary.branch || 'repository'}: ${summary.changedFiles} changed file(s).`);
    return summary;
  });

  commandRegistrar.register('nidhish-jarvis.explainGitChanges', async () => {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    if (!cwd) {
      notificationService.warn('Open a workspace before using Jarvis Git commands.');
      return null;
    }
    const git = container.resolve('gitAssistantService');
    const diff = await git.getDiff(cwd);
    if (!diff.stdout.trim()) {
      notificationService.info('Jarvis found no unstaged Git diff to explain.');
      return diff;
    }
    const result = await container.resolve('aiService').ask(git.buildDiffPrompt(diff.stdout));
    notificationService.info(result?.content || result?.output || 'Jarvis explained the Git changes.');
    return { diff, result };
  });

  commandRegistrar.register('nidhish-jarvis.generateCommitMessage', async () => {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
    if (!cwd) {
      notificationService.warn('Open a workspace before using Jarvis Git commands.');
      return null;
    }
    const git = container.resolve('gitAssistantService');
    const staged = await git.getDiff(cwd, { staged: true });
    const unstaged = staged.stdout.trim() ? staged : await git.getDiff(cwd);
    if (!unstaged.stdout.trim()) {
      notificationService.info('Jarvis found no Git diff for a commit message.');
      return unstaged;
    }
    const result = await container.resolve('aiService').ask(git.buildDiffPrompt(unstaged.stdout, { commit: true }));
    notificationService.info(result?.content || result?.output || 'Jarvis generated a commit message.');
    return { diff: unstaged, result };
  });

  commandRegistrar.register('nidhish-jarvis.rememberProjectFact', async () => {
    const content = await vscode.window.showInputBox({
      title: 'Jarvis Project Memory',
      prompt: 'Project fact or convention to remember',
      ignoreFocusOut: true,
    });
    if (!content) return null;
    const title = content.length > 60 ? `${content.slice(0, 57)}...` : content;
    const entry = container.resolve('memoryManager').remember({ type: 'project', title, content });
    notificationService.info('Jarvis saved project memory.');
    return entry;
  });

  commandRegistrar.register('nidhish-jarvis.searchMemory', async () => {
    const query = await vscode.window.showInputBox({
      title: 'Jarvis Search Memory',
      prompt: 'Search saved Jarvis memories',
    });
    if (query === undefined) return [];
    const results = container.resolve('memoryManager').search(query);
    await vscode.window.showQuickPick(results.map((entry) => ({
      label: entry.title,
      description: entry.type,
      detail: entry.content,
      entry,
    })), { title: 'Jarvis Memory', matchOnDescription: true, matchOnDetail: true });
    return results;
  });

  commandRegistrar.register('nidhish-jarvis.clearMemory', async () => {
    const choice = await vscode.window.showWarningMessage(
      'Clear all Jarvis memory for this workspace?',
      { modal: true },
      'Clear',
      'Cancel',
    );
    if (choice !== 'Clear') return false;
    container.resolve('memoryManager').clear();
    notificationService.info('Jarvis memory cleared.');
    return true;
  });

  commandRegistrar.register('nidhish-jarvis.runAgent', async () => {
    const agentManager = container.resolve('agentManager');
    const agent = await vscode.window.showQuickPick(agentManager.list().map((entry) => ({
      label: entry.name,
      description: entry.id,
      detail: entry.intent,
      id: entry.id,
    })), { title: 'Run Jarvis Agent' });
    if (!agent) return null;
    const request = await vscode.window.showInputBox({
      title: agent.label,
      prompt: 'What should this agent do?',
      ignoreFocusOut: true,
    });
    if (!request) return null;
    const result = await agentManager.run(agent.id, request);
    notificationService.info(result.result?.content || result.result?.output || `${agent.label} completed.`);
    return result;
  });

  commandRegistrar.register('nidhish-jarvis.addApiKey', async () => {
    const provider = await vscode.window.showQuickPick(providerChoices.filter((choice) => choice !== 'ollama'), {
      title: 'Jarvis Provider API Key',
      placeHolder: 'Select provider',
    });
    if (!provider) {
      return null;
    }

    const value = await vscode.window.showInputBox({
      title: `Jarvis ${provider} API Key`,
      prompt: 'Enter API key. It will be stored in VS Code SecretStorage.',
      password: true,
      ignoreFocusOut: true,
    });
    if (!value) {
      return null;
    }

    await container.resolve('secretService').storeApiKey(provider, value);
    notificationService.info(`Jarvis stored API key for ${provider}.`);
    return provider;
  });

  commandRegistrar.register('nidhish-jarvis.removeApiKey', async () => {
    const provider = await vscode.window.showQuickPick(providerChoices.filter((choice) => choice !== 'ollama'), {
      title: 'Remove Jarvis Provider API Key',
      placeHolder: 'Select provider',
    });
    if (!provider) {
      return null;
    }
    await container.resolve('secretService').deleteApiKey(provider);
    notificationService.info(`Jarvis removed API key for ${provider}.`);
    return provider;
  });

  commandRegistrar.register('nidhish-jarvis.testProvider', async () => {
    const provider = await vscode.window.showQuickPick(providerChoices, {
      title: 'Test Jarvis Provider',
      placeHolder: 'Select provider',
    });
    if (!provider) {
      return false;
    }

    try {
      const ok = await container.resolve('aiService').health(provider);
      notificationService.info(ok ? `Jarvis provider ${provider} is configured.` : `Jarvis provider ${provider} is unavailable.`);
      return ok;
    } catch (error) {
      notificationService.warn(error instanceof Error ? error.message : String(error));
      return false;
    }
  });

  commandRegistrar.register('nidhish-jarvis.openAssistant', async () => {
    await vscode.commands.executeCommand('workbench.view.extension.nidhish-jarvis');
    await vscode.commands.executeCommand(`${VIEW_IDS.chat}.focus`);
  });

  commandRegistrar.register('nidhish-jarvis.exportHistory', async () => {
    const conversationManager = container.resolve('conversationManager');
    const history = conversationManager.getHistory();
    if (!history.length) {
      notificationService.info('Jarvis has no conversation history to export yet.');
      return null;
    }

    const defaultFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    const defaultUri = defaultFolder
      ? vscode.Uri.joinPath(defaultFolder, `jarvis-conversation-${Date.now()}.json`)
      : undefined;
    const target = await vscode.window.showSaveDialog({
      defaultUri,
      filters: { JSON: ['json'] },
      saveLabel: 'Export Conversation',
      title: 'Export Jarvis Conversation',
    });

    if (!target) {
      return null;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      messages: history,
    };
    await vscode.workspace.fs.writeFile(target, Buffer.from(JSON.stringify(payload, null, 2), 'utf8'));
    notificationService.info(`Jarvis conversation exported to ${target.fsPath}.`);
    return target;
  });
}

function activate(context) {
  containerInstance = createBootstrap(context);
  const workspaceManager = containerInstance.resolve('workspaceManager');
  runBackground(containerInstance, 'restore workspace index', () => workspaceManager.restoreIndex?.());
  runBackground(containerInstance, 'start workspace watcher', () => workspaceManager.startWatching?.());
  registerViews(containerInstance);
  registerStatusBar(containerInstance);
  registerCommands(containerInstance);
  return containerInstance;
}

function deactivate() {
  if (!containerInstance) {
    return;
  }

  try {
    containerInstance.resolve('commandRegistrar')?.dispose();
    containerInstance.resolve('workspaceManager')?.dispose?.();
  } catch {
    // intentionally ignore any dispose failure
  }

  containerInstance = null;
}

module.exports = { createBootstrap, registerViews, runBackground, activate, deactivate };
