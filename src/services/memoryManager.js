class MemoryManager {
  constructor(options = {}) {
    this.storage = options.storage || null;
    this.storageKey = options.storageKey || 'jarvis.memory.entries';
    this.enabled = options.enabled !== false;
    this.entries = new Map();
    this.load();
  }

  load() {
    const stored = this.storage?.get?.(this.storageKey) || this.storage?.getWorkspace?.(this.storageKey) || [];
    if (Array.isArray(stored)) {
      stored.forEach((entry) => this.entries.set(entry.id, entry));
    }
  }

  persist() {
    const values = this.list();
    this.storage?.set?.(this.storageKey, values);
    this.storage?.setWorkspace?.(this.storageKey, values);
  }

  set(key, value, options = {}) {
    return this.remember({
      id: key,
      type: options.type || 'session',
      title: options.title || key,
      content: typeof value === 'string' ? value : JSON.stringify(value),
      metadata: options.metadata || {},
    });
  }

  remember(entry) {
    if (!this.enabled) {
      return null;
    }
    const id = entry.id || `memory-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const normalized = {
      id,
      type: entry.type || 'project',
      title: entry.title || entry.key || id,
      content: String(entry.content ?? entry.value ?? ''),
      metadata: entry.metadata || {},
      createdAt: entry.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.entries.set(id, normalized);
    this.persist();
    return normalized;
  }

  get(key) {
    const entry = this.entries.get(key);
    return entry?.content ?? entry;
  }

  getEntry(id) {
    return this.entries.get(id) || null;
  }

  list(type = null) {
    return [...this.entries.values()]
      .filter((entry) => !type || entry.type === type)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  search(query, options = {}) {
    const terms = String(query || '').toLowerCase().split(/[^a-z0-9_#.-]+/i).filter(Boolean);
    if (!terms.length) {
      return this.list(options.type).slice(0, options.limit || 20);
    }
    return this.list(options.type)
      .map((entry) => {
        const haystack = `${entry.title}\n${entry.content}`.toLowerCase();
        const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0);
        return { ...entry, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, options.limit || 20);
  }

  delete(id) {
    const removed = this.entries.delete(id);
    this.persist();
    return removed;
  }

  clear(type = null) {
    if (!type) {
      this.entries.clear();
    } else {
      this.list(type).forEach((entry) => this.entries.delete(entry.id));
    }
    this.persist();
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    return this.enabled;
  }
}

module.exports = { MemoryManager };
