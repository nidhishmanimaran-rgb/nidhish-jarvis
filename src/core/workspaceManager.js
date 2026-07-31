class WorkspaceManager {
  constructor(workspace, intelligenceService = null, options = {}) {
    this.workspace = workspace;
    this.intelligenceService = intelligenceService;
    this.configurationService = options.configurationService || null;
    this.storageService = options.storageService || null;
    this.currentIndex = null;
    this.watchers = [];
    this.reindexTimer = null;
    this.lastIndexOptions = {};
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

    const folders = this.getFolders();
    const excludePatterns = this.configurationService?.get?.('indexExcludes') || [];
    this.lastIndexOptions = { excludePatterns };
    if (folders.length > 1 && this.intelligenceService.indexWorkspaces) {
      this.currentIndex = await this.intelligenceService.indexWorkspaces(folders.map((folder) => ({
        name: folder.name,
        rootPath: folder.uri?.fsPath,
      })), { excludePatterns });
    } else {
      const rootPath = this.getWorkspacePath();
      this.currentIndex = await this.intelligenceService.indexWorkspace(rootPath, {
        workspaceName: this.getWorkspaceName(),
        excludePatterns,
      });
    }
    await this.persistCurrentIndex();
    return this.currentIndex;
  }

  async reindexWorkspace() {
    this.currentIndex = null;
    return this.indexWorkspace();
  }

  async restoreIndex() {
    const stored = await this.storageService?.getWorkspace?.('jarvis.workspaceIndex');
    if (stored?.generatedAt && Array.isArray(stored.files)) {
      this.currentIndex = stored;
      if (this.intelligenceService) {
        this.intelligenceService.index = stored;
      }
    }
    return this.currentIndex;
  }

  async persistCurrentIndex() {
    if (!this.storageService || !this.currentIndex) {
      return;
    }
    await this.storageService.setWorkspace?.('jarvis.workspaceIndex', this.currentIndex);
  }

  startWatching() {
    if (!this.workspace.createFileSystemWatcher || this.watchers.length) {
      return;
    }

    const watcher = this.workspace.createFileSystemWatcher('**/*');
    const invalidate = () => this.scheduleReindex();
    watcher.onDidCreate?.(invalidate);
    watcher.onDidChange?.(invalidate);
    watcher.onDidDelete?.(invalidate);
    this.watchers.push(watcher);
    return watcher;
  }

  scheduleReindex(delayMs = 750) {
    if (this.reindexTimer) {
      clearTimeout(this.reindexTimer);
    }
    this.reindexTimer = setTimeout(async () => {
      this.reindexTimer = null;
      if (this.currentIndex) {
        await this.indexWorkspace();
      }
    }, delayMs);
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

  semanticSearch(query, options = {}) {
    if (!this.intelligenceService) {
      return [];
    }
    return this.intelligenceService.semanticSearch(query, { ...options, index: this.currentIndex });
  }

  findSymbol(name, options = {}) {
    if (!this.intelligenceService) {
      return [];
    }
    return this.intelligenceService.findSymbol(name, { ...options, index: this.currentIndex });
  }

  getFileRelationships(relativePath, options = {}) {
    if (!this.intelligenceService) {
      return { imports: [], importedBy: [], externalImports: [] };
    }
    return this.intelligenceService.getFileRelationships(relativePath, { ...options, index: this.currentIndex });
  }

  getFile(relativePath, options = {}) {
    return this.intelligenceService?.getFile?.(relativePath, { ...options, index: this.currentIndex }) || null;
  }

  getFiles(options = {}) {
    return this.intelligenceService?.getFiles?.({ ...options, index: this.currentIndex }) || [];
  }

  getSymbols(options = {}) {
    return this.intelligenceService?.getSymbols?.({ ...options, index: this.currentIndex }) || [];
  }

  getDependencies(relativePath, options = {}) {
    return this.intelligenceService?.getDependencies?.(relativePath, { ...options, index: this.currentIndex }) || [];
  }

  getDependents(relativePath, options = {}) {
    return this.intelligenceService?.getDependents?.(relativePath, { ...options, index: this.currentIndex }) || [];
  }

  getRelatedFiles(relativePath, options = {}) {
    return this.intelligenceService?.getRelatedFiles?.(relativePath, { ...options, index: this.currentIndex }) || [];
  }

  getProjectMetadata(options = {}) {
    return this.intelligenceService?.getProjectMetadata?.({ ...options, index: this.currentIndex }) || null;
  }

  searchIndex(query, options = {}) {
    return this.intelligenceService?.searchIndex?.(query, { ...options, index: this.currentIndex }) || [];
  }

  getSymbolLocation(name, options = {}) {
    return this.intelligenceService?.getSymbolLocation?.(name, { ...options, index: this.currentIndex }) || null;
  }

  findReferences(name, options = {}) {
    return this.intelligenceService?.findReferences?.(name, { ...options, index: this.currentIndex }) || [];
  }

  getRelatedSymbols(name, options = {}) {
    return this.intelligenceService?.getRelatedSymbols?.(name, { ...options, index: this.currentIndex }) || [];
  }

  getEntryPoints(options = {}) {
    return this.intelligenceService?.getEntryPoints?.({ ...options, index: this.currentIndex }) || [];
  }

  getImportantModules(options = {}) {
    return this.intelligenceService?.getImportantModules?.({ ...options, index: this.currentIndex }) || [];
  }

  getDependencyPath(fromFile, toFile, options = {}) {
    return this.intelligenceService?.getDependencyPath?.(fromFile, toFile, { ...options, index: this.currentIndex }) || [];
  }

  dispose() {
    if (this.reindexTimer) {
      clearTimeout(this.reindexTimer);
      this.reindexTimer = null;
    }
    this.watchers.forEach((watcher) => watcher.dispose?.());
    this.watchers = [];
  }
}

module.exports = { WorkspaceManager };
