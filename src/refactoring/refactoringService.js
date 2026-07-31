const fs = require('fs');
const path = require('path');

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class RefactoringService {
  constructor(options = {}) {
    this.fs = options.fs || fs.promises;
  }

  async createRenameProposal({ index, rootPath, oldName, newName, safeEditService }) {
    if (!index || !rootPath || !oldName || !newName || !safeEditService) {
      throw new Error('Index, root path, names, and SafeEditService are required.');
    }
    if (!/^[A-Za-z_$][\w$]*$/.test(oldName) || !/^[A-Za-z_$][\w$]*$/.test(newName)) {
      throw new Error('Rename refactoring currently supports identifier-safe names only.');
    }

    const pattern = new RegExp(`\\b${escapeRegExp(oldName)}\\b`, 'g');
    const changes = [];
    for (const file of index.files || []) {
      if (!file.absolutePath || !file.relativePath) {
        continue;
      }
      const original = await this.fs.readFile(file.absolutePath, 'utf8');
      if (!pattern.test(original)) {
        pattern.lastIndex = 0;
        continue;
      }
      pattern.lastIndex = 0;
      const proposed = original.replace(pattern, newName);
      changes.push({
        file: file.relativePath,
        operation: 'modify',
        original,
        proposed,
      });
    }

    if (!changes.length) {
      throw new Error(`No references to ${oldName} were found in indexed files.`);
    }
    return safeEditService.createProposal(changes, { rootPath });
  }

  async createImportUpdateProposal({ index, rootPath, fromImport, toImport, safeEditService }) {
    if (!index || !rootPath || !fromImport || !toImport || !safeEditService) {
      throw new Error('Index, root path, imports, and SafeEditService are required.');
    }
    const changes = [];
    for (const file of index.files || []) {
      if (!file.absolutePath || !file.relativePath || !(file.imports || []).includes(fromImport)) {
        continue;
      }
      const original = await this.fs.readFile(file.absolutePath, 'utf8');
      const proposed = original
        .replaceAll(`'${fromImport}'`, `'${toImport}'`)
        .replaceAll(`"${fromImport}"`, `"${toImport}"`);
      if (proposed !== original) {
        changes.push({ file: file.relativePath, operation: 'modify', original, proposed });
      }
    }
    if (!changes.length) {
      throw new Error(`No import references to ${fromImport} were found in indexed files.`);
    }
    return safeEditService.createProposal(changes, { rootPath });
  }

  getRootPathForIndex(index) {
    return Array.isArray(index?.projects) && index.projects.length === 1
      ? index.projects[0].rootPath
      : index?.rootPath?.includes(path.delimiter)
        ? null
        : index?.rootPath;
  }
}

module.exports = { RefactoringService };
