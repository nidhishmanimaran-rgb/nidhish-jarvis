class WorkspaceManager {
  constructor(workspace) {
    this.workspace = workspace;
  }

  getWorkspaceFolder() {
    return this.workspace.workspaceFolders?.[0] || null;
  }

  getFolders() {
    return this.workspace.workspaceFolders || [];
  }

  getWorkspaceName() {
    return this.getWorkspaceFolder()?.name || 'unknown';
  }
}

module.exports = { WorkspaceManager };
