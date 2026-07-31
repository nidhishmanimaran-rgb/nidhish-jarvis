const path = require('path');

function sanitizePathSegment(value) {
  return String(value || 'file').replace(/[^a-zA-Z0-9_.-]+/g, '_');
}

function encodeText(value) {
  return Buffer.from(String(value || ''), 'utf8');
}

function createVsCodeEditAdapter(vscode) {
  return {
    async applyWorkspaceEdit(proposal) {
      const edit = new vscode.WorkspaceEdit();
      for (const change of proposal.changes) {
        const uri = vscode.Uri.file(change.absolutePath);
        if (change.operation === 'delete') {
          edit.deleteFile(uri, { ignoreIfNotExists: true });
        } else if ((change.operation === 'rename' || change.operation === 'move') && change.targetAbsolutePath) {
          edit.renameFile(uri, vscode.Uri.file(change.targetAbsolutePath), { overwrite: false });
        } else if (change.range) {
          edit.replace(uri, new vscode.Range(
            new vscode.Position(change.range.start.line, change.range.start.character),
            new vscode.Position(change.range.end.line, change.range.end.character),
          ), change.proposed);
        } else if (change.operation === 'create') {
          edit.createFile(uri, { ignoreIfExists: true });
          edit.insert(uri, new vscode.Position(0, 0), change.proposed);
        } else {
          const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(Number.MAX_SAFE_INTEGER, 0));
          edit.replace(uri, fullRange, change.proposed);
        }
      }
      return vscode.workspace.applyEdit(edit);
    },
  };
}

class DiffPreviewService {
  constructor(options = {}) {
    this.vscode = options.vscode;
    this.storageUri = options.storageUri;
  }

  async previewProposal(proposal) {
    if (!this.vscode || !this.storageUri) {
      return [];
    }

    const opened = [];
    for (const change of proposal.changes) {
      const proposedUri = await this.writePreviewFile(proposal, change, 'proposed', change.proposed);
      const originalUri = await this.writePreviewFile(proposal, change, 'original', change.original);
      await this.vscode.commands.executeCommand(
        'vscode.diff',
        originalUri,
        proposedUri,
        `Jarvis Preview: ${change.file}`,
        { preview: false },
      );
      opened.push({ file: change.file, originalUri, proposedUri });
    }
    return opened;
  }

  async writePreviewFile(proposal, change, side, content) {
    const relative = sanitizePathSegment(change.file);
    const fileName = `${side}-${relative}`;
    const folder = this.vscode.Uri.joinPath(this.storageUri, 'jarvis-diff-preview', proposal.id);
    await this.vscode.workspace.fs.createDirectory(folder);
    const uri = this.vscode.Uri.joinPath(folder, fileName);
    await this.vscode.workspace.fs.writeFile(uri, encodeText(content));
    return uri;
  }

  async reviewAndApply(proposal, safeEditService, options = {}) {
    await this.previewProposal(proposal);
    const choice = await this.vscode.window.showWarningMessage(
      `Apply ${proposal.changes.length} Jarvis proposed change(s)?`,
      { modal: true, detail: proposal.summary.map((entry) => `${entry.operation}: ${entry.file} (+${entry.additions}/-${entry.removals})`).join('\n') },
      'Accept All',
      'Reject All',
    );
    if (choice !== 'Accept All') {
      return { applied: false, reason: 'rejected' };
    }
    await safeEditService.applyProposal(proposal, { ...options, approved: true });
    return { applied: true, changes: proposal.changes.length };
  }
}

function relativeWorkspacePath(rootPath, absolutePath) {
  return path.relative(rootPath, absolutePath).replace(/\\/g, '/');
}

module.exports = { DiffPreviewService, createVsCodeEditAdapter, relativeWorkspacePath };
