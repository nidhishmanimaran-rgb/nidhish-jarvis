// @ts-check

/**
 * @typedef {{
 *   id: string,
 *   canHandle: (context: any) => boolean,
 *   handle: (context: any) => Promise<any>
 * }} PluginDefinition
 */

class PluginRegistry {
  constructor() {
    /** @type {PluginDefinition[]} */
    this.plugins = [];
  }

  /**
   * @param {string} id
   * @param {{ canHandle: (context: any) => boolean, handle: (context: any) => Promise<any> }} plugin
   */
  register(id, plugin) {
    if (!id || typeof id !== 'string') {
      throw new Error('Plugin id must be a non-empty string.');
    }

    if (!plugin || typeof plugin.canHandle !== 'function' || typeof plugin.handle !== 'function') {
      throw new Error(`Plugin ${id} must expose canHandle and handle functions.`);
    }

    this.plugins.push({ id, ...plugin });
    return this;
  }

  /**
   * @param {any} context
   */
  async execute(context) {
    const plugin = this.plugins.find((candidate) => candidate.canHandle(context));
    if (!plugin) {
      return {
        plugin: 'general',
        response: 'I can help with conversations, planning, writing, coding, and workspace tasks. Tell me what you want to do next.',
      };
    }

    return plugin.handle(context);
  }

  /**
   * @returns {string[]}
   */
  list() {
    return this.plugins.map((plugin) => plugin.id);
  }
}

/**
 * @param {{ get: (key: string) => any, update: (key: string, value: any) => void }} storage
 * @param {{ maxMessages?: number }} options
 */
function createConversationStore(storage, options = {}) {
  const maxMessages = Number(options.maxMessages || 25);
  const messages = Array.isArray(storage.get('messages')) ? storage.get('messages').slice(-maxMessages) : [];

  return {
    /**
     * @param {{ role: string, content: string }} message
     */
    append(message) {
      messages.push(message);
      if (messages.length > maxMessages) {
        messages.splice(0, messages.length - maxMessages);
      }
      storage.update('messages', messages.slice());
      return messages.length;
    },
    getMessages() {
      return messages.slice();
    },
    exportJson() {
      return JSON.stringify(messages, null, 2);
    },
    clear() {
      messages.length = 0;
      storage.update('messages', []);
    },
  };
}

/**
 * @param {{ get: (key: string) => any, update: (key: string, value: any) => void }} storage
 */
function createPreferencesStore(storage) {
  const defaults = {
    provider: 'ollama',
    model: 'qwen2.5-coder:3b',
    memoryEnabled: true,
    maxHistory: 25,
    instructions: 'You are Jarvis, a helpful AI productivity companion for software teams.',
  };

  const persisted = storage.get('preferences') || {};
  const preferences = { ...defaults, ...persisted };

  return {
    /** @param {string} key */
    get(key) {
      return preferences[key];
    },
    /**
     * @param {string} key
     * @param {any} value
     */
    set(key, value) {
      preferences[key] = value;
      storage.update('preferences', { ...preferences });
    },
    getAll() {
      return { ...preferences };
    },
  };
}

/**
 * @param {{ conversationStore: any, preferencesStore: any, workspaceFolder?: { uri?: { fsPath?: string }, name?: string } }} options
 */
function createAssistantRuntime({ conversationStore, preferencesStore, workspaceFolder }) {
  const registry = new PluginRegistry();
  const workspace = {
    folder: workspaceFolder?.uri?.fsPath || '',
    name: workspaceFolder?.name || 'workspace',
  };

  registry.register('general', {
    canHandle: () => true,
    handle: async ({ input }) => ({
      plugin: 'general',
      response: generateGeneralResponse(input, workspace),
    }),
  });

  registry.register('reasoning', {
    canHandle: ({ input }) => /plan|analyze|reason|root cause|trade-off|decision|architecture/i.test(input),
    handle: async ({ input }) => ({
      plugin: 'reasoning',
      response: `Reasoning workflow for "${input}":\n1. Clarify the goal and constraints.\n2. Break the problem into manageable steps.\n3. Compare options and surface trade-offs.\n4. Recommend an implementation path and next action.`,
    }),
  });

  registry.register('writing', {
    canHandle: ({ input }) => /rewrite|draft|email|document|write|summarize|notes|grammar|translate/i.test(input),
    handle: async ({ input }) => ({
      plugin: 'writing',
      response: `Writing support ready for: ${input}\n- Draft a polished response.\n- Rewrite for tone and clarity.\n- Generate notes, email copy, or documentation.`,
    }),
  });

  registry.register('coding', {
    canHandle: ({ input }) => /code|function|class|test|api|schema|docker|ci|debug|refactor/i.test(input),
    handle: async ({ input }) => ({
      plugin: 'coding',
      response: `Development assistance for "${input}":\n- Generate or refine code.\n- Explain an error and propose a fix.\n- Create tests, schemas, Dockerfiles, and CI steps.`,
    }),
  });

  return {
    conversationStore,
    preferencesStore,
    registry,
    workspace,
  };
}

/**
 * @param {string | undefined} input
 * @param {{ folder?: string }} workspace
 */
function generateGeneralResponse(input, workspace) {
  const safeInput = (input || '').trim();
  const workspaceHint = workspace?.folder ? ` I can also reason over the workspace at ${workspace.folder}.` : '';

  if (!safeInput) {
    return `Hello! I am Jarvis, your modular AI productivity companion.${workspaceHint}\nTry asking for planning, writing help, code generation, or a workspace summary.`;
  }

  return `You asked: ${safeInput}.${workspaceHint}\nI can help with conversations, planning, writing, coding, summarization, and future plugin-driven tasks.`;
}

module.exports = {
  PluginRegistry,
  createConversationStore,
  createPreferencesStore,
  createAssistantRuntime,
};
