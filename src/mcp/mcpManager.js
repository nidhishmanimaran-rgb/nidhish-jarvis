class McpManager {
  constructor(options = {}) {
    this.storage = options.storage || null;
    this.servers = new Map();
    this.load();
  }

  load() {
    const stored = this.storage?.getWorkspace?.('jarvis.mcp.servers') || [];
    if (Array.isArray(stored)) {
      stored.forEach((server) => this.servers.set(server.id, server));
    }
  }

  persist() {
    this.storage?.setWorkspace?.('jarvis.mcp.servers', this.listServers());
  }

  addServer(server) {
    if (!server?.id || !server?.command) {
      throw new Error('MCP server id and command are required.');
    }
    const normalized = {
      id: server.id,
      command: server.command,
      args: Array.isArray(server.args) ? server.args : [],
      enabled: server.enabled !== false,
      permissions: server.permissions || [],
      tools: [],
      resources: [],
      status: 'configured',
    };
    this.servers.set(normalized.id, normalized);
    this.persist();
    return normalized;
  }

  removeServer(id) {
    const removed = this.servers.delete(id);
    this.persist();
    return removed;
  }

  setEnabled(id, enabled) {
    const server = this.getServer(id);
    if (!server) throw new Error(`Unknown MCP server: ${id}`);
    server.enabled = Boolean(enabled);
    this.persist();
    return server;
  }

  getServer(id) {
    return this.servers.get(id) || null;
  }

  listServers() {
    return [...this.servers.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  registerDiscoveredTools(id, tools = []) {
    const server = this.getServer(id);
    if (!server) throw new Error(`Unknown MCP server: ${id}`);
    server.tools = tools.map((tool) => ({ name: tool.name, description: tool.description || '' }));
    this.persist();
    return server.tools;
  }

  authorizeTool(id, toolName) {
    const server = this.getServer(id);
    if (!server?.enabled) {
      return { ok: false, reason: 'MCP server is disabled or missing.' };
    }
    if (!server.permissions.includes(toolName) && !server.permissions.includes('*')) {
      return { ok: false, reason: `Tool ${toolName} is not authorized.` };
    }
    return { ok: true };
  }
}

module.exports = { McpManager };
