class WorkspaceManager {
  constructor(workspace, intelligenceService = null) {
    this.workspace = workspace;
    this.intelligenceService = intelligenceService;
    this.currentIndex = null;
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

  getWorkspacePath() {
    return this.getWorkspaceFolder()?.uri?.fsPath || null;
  }

  async indexWorkspace() {
    if (!this.intelligenceService) {
      throw new Error('Workspace intelligence service is not available.');
    }

    const rootPath = this.getWorkspacePath();
    this.currentIndex = await this.intelligenceService.indexWorkspace(rootPath);
    return this.currentIndex;
  }

  getProjectSummary() {
    if (!this.intelligenceService) {
      return 'Workspace intelligence service is not available.';
    }
    return this.intelligenceService.explainProject(this.currentIndex);
  }

  search(query, options = {}) {
    if (!this.intelligenceService) {
      return [];
    }
    return this.intelligenceService.search(query, { ...options, index: this.currentIndex });
  }
}

module.exports = { WorkspaceManager };
