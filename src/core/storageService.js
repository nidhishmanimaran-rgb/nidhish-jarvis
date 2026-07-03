class StorageService {
  constructor(workspaceState, globalState) {
    this.workspaceState = workspaceState;
    this.globalState = globalState;
  }

  getWorkspace(key) {
    return this.workspaceState.get(key);
  }

  setWorkspace(key, value) {
    return this.workspaceState.update(key, value);
  }

  getGlobal(key) {
    return this.globalState.get(key);
  }

  setGlobal(key, value) {
    return this.globalState.update(key, value);
  }
}

module.exports = { StorageService };
