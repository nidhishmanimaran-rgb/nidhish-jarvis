const DEFAULT_AGENTS = [
  { id: 'coding', name: 'Coding Agent', intent: 'Implement or modify code safely.' },
  { id: 'debug', name: 'Debug Agent', intent: 'Analyze diagnostics, stack traces, and failures.' },
  { id: 'testing', name: 'Testing Agent', intent: 'Plan and generate tests.' },
  { id: 'refactoring', name: 'Refactoring Agent', intent: 'Refactor code through reviewed proposals.' },
  { id: 'review', name: 'Review Agent', intent: 'Review code for bugs, risks, and missing tests.' },
  { id: 'documentation', name: 'Documentation Agent', intent: 'Generate and improve documentation.' },
  { id: 'architecture', name: 'Architecture Agent', intent: 'Explain architecture and project structure.' },
  { id: 'security', name: 'Security Agent', intent: 'Assess security risks and mitigations.' },
  { id: 'git', name: 'Git Agent', intent: 'Explain Git changes and produce commit/PR text.' },
];

class AgentManager {
  constructor(options = {}) {
    this.contextBuilder = options.contextBuilder;
    this.aiService = options.aiService;
    this.agents = new Map();
    DEFAULT_AGENTS.forEach((agent) => this.register(agent));
  }

  register(agent) {
    if (!agent?.id || !agent?.name) {
      throw new Error('Agent id and name are required.');
    }
    this.agents.set(agent.id, {
      tools: [],
      permissions: [],
      ...agent,
    });
    return agent;
  }

  list() {
    return [...this.agents.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  get(id) {
    return this.agents.get(id) || null;
  }

  createPlan(agentId, request) {
    const agent = this.get(agentId);
    if (!agent) {
      throw new Error(`Unknown Jarvis agent: ${agentId}`);
    }
    return {
      agentId,
      request,
      steps: [
        'Collect bounded context',
        `Apply ${agent.name} intent`,
        'Produce answer or safe proposal',
        'Require approval before any source modification',
      ],
      permissions: agent.permissions,
    };
  }

  async run(agentId, request, options = {}) {
    const agent = this.get(agentId);
    if (!agent) {
      throw new Error(`Unknown Jarvis agent: ${agentId}`);
    }
    const plan = this.createPlan(agentId, request);
    const context = this.contextBuilder?.build?.(request, options) || { promptPrefix: '' };
    const prompt = [
      context.promptPrefix,
      `[Agent]\n${agent.name}: ${agent.intent}`,
      `[Plan]\n${plan.steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}`,
      `[User Request]\n${request}`,
    ].filter(Boolean).join('\n\n');
    const result = await this.aiService.ask(prompt, options);
    return { agent, plan, contextSummary: context.summary || '', result };
  }
}

module.exports = { AgentManager, DEFAULT_AGENTS };
