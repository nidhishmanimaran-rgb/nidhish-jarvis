class AutomationManager {
  constructor(options = {}) {
    this.storage = options.storage || null;
    this.rules = new Map();
    this.handlers = new Map();
  }

  registerAction(name, handler) {
    if (!name || typeof handler !== 'function') throw new Error('Automation action requires a handler.');
    this.handlers.set(name, handler);
  }

  addRule(rule) {
    if (!rule?.id || !rule?.trigger || !rule?.action) throw new Error('Automation rule requires id, trigger, and action.');
    const normalized = { enabled: true, permissions: [], ...rule };
    this.rules.set(normalized.id, normalized);
    this.persist();
    return normalized;
  }

  listRules() {
    return [...this.rules.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  setEnabled(id, enabled) {
    const rule = this.rules.get(id);
    if (!rule) throw new Error(`Unknown automation rule: ${id}`);
    rule.enabled = Boolean(enabled);
    this.persist();
    return rule;
  }

  async handleTrigger(trigger, payload = {}) {
    const results = [];
    for (const rule of this.listRules()) {
      if (!rule.enabled || rule.trigger !== trigger) continue;
      const handler = this.handlers.get(rule.action);
      if (!handler) {
        results.push({ rule: rule.id, ok: false, reason: 'Missing action handler.' });
        continue;
      }
      results.push({ rule: rule.id, ok: true, result: await handler(payload, rule) });
    }
    return results;
  }

  persist() {
    this.storage?.setWorkspace?.('jarvis.automation.rules', this.listRules());
  }
}

module.exports = { AutomationManager };
