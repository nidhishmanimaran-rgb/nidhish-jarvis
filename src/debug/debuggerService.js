function severityName(value) {
  return ['Error', 'Warning', 'Information', 'Hint'][value] || 'Diagnostic';
}

class DebuggerService {
  collectDiagnostics(vscode, workspaceFolders = []) {
    const folderRoots = workspaceFolders.map((folder) => folder.uri.fsPath);
    return vscode.languages.getDiagnostics()
      .flatMap(([uri, diagnostics]) => diagnostics.map((diagnostic) => ({
        file: uri.fsPath,
        workspaceRelativeFile: this.toWorkspaceRelative(uri.fsPath, folderRoots),
        message: diagnostic.message,
        source: diagnostic.source || '',
        code: diagnostic.code?.value || diagnostic.code || '',
        severity: severityName(diagnostic.severity),
        line: diagnostic.range.start.line + 1,
        character: diagnostic.range.start.character + 1,
      })));
  }

  toWorkspaceRelative(filePath, roots) {
    const normalized = String(filePath || '').replace(/\\/g, '/');
    const root = roots.find((candidate) => normalized.startsWith(String(candidate).replace(/\\/g, '/')));
    return root ? normalized.slice(String(root).replace(/\\/g, '/').length).replace(/^\/+/, '') : normalized;
  }

  summarizeDiagnostics(diagnostics) {
    const bySeverity = diagnostics.reduce((acc, diagnostic) => {
      acc[diagnostic.severity] = (acc[diagnostic.severity] || 0) + 1;
      return acc;
    }, {});
    return {
      total: diagnostics.length,
      bySeverity,
      topFiles: [...diagnostics.reduce((map, diagnostic) => {
        const key = diagnostic.workspaceRelativeFile || diagnostic.file;
        map.set(key, (map.get(key) || 0) + 1);
        return map;
      }, new Map()).entries()]
        .map(([file, count]) => ({ file, count }))
        .sort((a, b) => b.count - a.count || a.file.localeCompare(b.file))
        .slice(0, 10),
    };
  }

  createPrompt(diagnostics, options = {}) {
    const summary = this.summarizeDiagnostics(diagnostics);
    return [
      options.fix ? 'Suggest a concrete fix for these VS Code diagnostics.' : 'Explain these VS Code diagnostics and identify likely causes.',
      `Total diagnostics: ${summary.total}`,
      ...diagnostics.slice(0, options.limit || 20).map((diagnostic) => [
        `${diagnostic.severity}: ${diagnostic.workspaceRelativeFile}:${diagnostic.line}:${diagnostic.character}`,
        diagnostic.source || diagnostic.code ? `Source: ${diagnostic.source} ${diagnostic.code}`.trim() : '',
        diagnostic.message,
      ].filter(Boolean).join('\n')),
    ].join('\n\n');
  }
}

module.exports = { DebuggerService };
