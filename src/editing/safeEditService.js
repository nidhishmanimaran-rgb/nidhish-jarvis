const path = require('path');

function normalizeSlash(value) {
  return String(value || '').replace(/\\/g, '/');
}

function assertInsideWorkspace(rootPath, filePath) {
  const root = path.resolve(rootPath);
  const target = path.resolve(rootPath, filePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Refusing to edit outside workspace: ${filePath}`);
  }
  return target;
}

function createRangeSnapshot(range) {
  if (!range) {
    return null;
  }
  return {
    start: {
      line: range.start?.line ?? range.startLine ?? 0,
      character: range.start?.character ?? range.startCharacter ?? 0,
    },
    end: {
      line: range.end?.line ?? range.endLine ?? 0,
      character: range.end?.character ?? range.endCharacter ?? 0,
    },
  };
}

function createLineDiff(original, proposed) {
  const before = String(original || '').split(/\r?\n/);
  const after = String(proposed || '').split(/\r?\n/);
  const max = Math.max(before.length, after.length);
  const hunks = [];
  for (let i = 0; i < max; i += 1) {
    if (before[i] === after[i]) {
      continue;
    }
    if (before[i] !== undefined) {
      hunks.push({ type: 'remove', line: i + 1, text: before[i] });
    }
    if (after[i] !== undefined) {
      hunks.push({ type: 'add', line: i + 1, text: after[i] });
    }
  }
  return hunks;
}

class SafeEditService {
  constructor(options = {}) {
    this.rootPath = options.rootPath || '';
    this.fs = options.fs || null;
  }

  createProposal(changes, options = {}) {
    const rootPath = options.rootPath || this.rootPath;
    if (!rootPath) {
      throw new Error('Workspace root is required before creating edit proposals.');
    }
    const normalizedChanges = changes.map((change) => {
      const file = normalizeSlash(change.file);
      const absolutePath = assertInsideWorkspace(rootPath, file);
      const original = String(change.original ?? '');
      const proposed = String(change.proposed ?? '');
      const targetFile = change.targetFile ? normalizeSlash(change.targetFile) : null;
      return {
        file,
        absolutePath,
        targetFile,
        targetAbsolutePath: targetFile ? assertInsideWorkspace(rootPath, targetFile) : null,
        operation: change.operation || (original ? 'modify' : 'create'),
        range: createRangeSnapshot(change.range),
        original,
        proposed,
        diff: createLineDiff(original, proposed),
      };
    });

    return {
      id: `proposal-${Date.now()}`,
      createdAt: new Date().toISOString(),
      rootPath,
      changes: normalizedChanges,
      summary: normalizedChanges.map((change) => ({
        file: change.file,
        operation: change.operation,
        additions: change.diff.filter((line) => line.type === 'add').length,
        removals: change.diff.filter((line) => line.type === 'remove').length,
      })),
      requiresApproval: options.requiresApproval !== false,
    };
  }

  async applyProposal(proposal, options = {}) {
    if (proposal.requiresApproval && !options.approved) {
      throw new Error('Edit proposal requires explicit approval before apply.');
    }
    if (!this.fs) {
      throw new Error('No filesystem adapter is configured for applying edits.');
    }

    if (this.fs.applyWorkspaceEdit) {
      await this.fs.applyWorkspaceEdit(proposal);
      return proposal.changes.length;
    }

    for (const change of proposal.changes) {
      if (change.operation === 'delete') {
        await this.fs.delete(change.absolutePath);
      } else if (change.operation === 'rename' || change.operation === 'move') {
        await this.fs.rename(change.absolutePath, change.targetAbsolutePath);
      } else {
        await this.fs.writeFile(change.absolutePath, change.proposed);
      }
    }
    return proposal.changes.length;
  }
}

module.exports = { SafeEditService, createLineDiff, assertInsideWorkspace };
