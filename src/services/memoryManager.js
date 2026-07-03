class MemoryManager {
  constructor() {
    this.entries = new Map();
  }

  set(key, value) {
    this.entries.set(key, value);
    return value;
  }

  get(key) {
    return this.entries.get(key);
  }

  clear() {
    this.entries.clear();
  }
}

module.exports = { MemoryManager };
