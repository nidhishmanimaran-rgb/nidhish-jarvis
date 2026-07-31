const fs = require('fs');
const path = require('path');
const { LocalHashEmbeddingProvider, NullEmbeddingProvider, cosineSimilarity } = require('../search/embeddingProviders');

const DEFAULT_IGNORE_DIRS = new Set([
  '.git',
  '.hg',
  '.svn',
  '.vscode',
  '.idea',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.svelte-kit',
  'out',
  'bin',
  'obj',
  'target',
  '__pycache__',
  '.pytest_cache',
  '.venv',
  'venv',
]);

const DEFAULT_EXCLUDE_PATTERNS = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/*.min.js',
  '**/*.map',
  '**/*generated*',
  '**/*.generated.*',
];

const BINARY_EXTENSIONS = new Set([
  '.7z',
  '.bmp',
  '.class',
  '.dll',
  '.exe',
  '.gif',
  '.ico',
  '.jar',
  '.jpeg',
  '.jpg',
  '.lockb',
  '.mp3',
  '.mp4',
  '.pdf',
  '.png',
  '.so',
  '.wasm',
  '.webp',
  '.zip',
]);

const LANGUAGE_BY_EXTENSION = {
  '.js': 'JavaScript',
  '.jsx': 'JavaScript React',
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript React',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.json': 'JSON',
  '.py': 'Python',
  '.cs': 'C#',
  '.java': 'Java',
  '.go': 'Go',
  '.rs': 'Rust',
  '.php': 'PHP',
  '.rb': 'Ruby',
  '.html': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.md': 'Markdown',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.xml': 'XML',
  '.sql': 'SQL',
  '.sh': 'Shell',
  '.ps1': 'PowerShell',
};

const SOURCE_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mjs',
  '.cjs',
  '.py',
  '.cs',
  '.java',
  '.go',
  '.rs',
  '.php',
  '.rb',
]);

const FRAMEWORK_HINTS = [
  { name: 'React', deps: ['react', 'react-dom'], files: ['vite.config.js', 'vite.config.ts'] },
  { name: 'Next.js', deps: ['next'], files: ['next.config.js', 'next.config.mjs', 'next.config.ts'] },
  { name: 'Vue', deps: ['vue', '@vue/cli-service'], files: ['vue.config.js'] },
  { name: 'Angular', deps: ['@angular/core'], files: ['angular.json'] },
  { name: 'Svelte', deps: ['svelte', '@sveltejs/kit'], files: ['svelte.config.js'] },
  { name: 'Express', deps: ['express'], files: [] },
  { name: 'NestJS', deps: ['@nestjs/core'], files: ['nest-cli.json'] },
  { name: 'Electron', deps: ['electron'], files: [] },
  { name: 'VS Code Extension', deps: ['@types/vscode', '@vscode/test-electron'], files: ['vsc-extension-quickstart.md'] },
  { name: 'Django', deps: ['django'], files: ['manage.py'] },
  { name: 'Flask', deps: ['flask'], files: [] },
  { name: 'FastAPI', deps: ['fastapi'], files: [] },
  { name: '.NET', deps: [], files: ['global.json'] },
];

function normalizeSlash(value) {
  return value.replace(/\\/g, '/');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-z0-9_#.-]+/i)
    .filter((token) => token.length > 1);
}

function globToRegExp(pattern) {
  const normalized = normalizeSlash(pattern).replace(/^\//, '');
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function isCancellationRequested(token) {
  return Boolean(token?.isCancellationRequested || token?.aborted || token?.signal?.aborted);
}

class WorkspaceIntelligenceService {
  constructor(options = {}) {
    this.fs = options.fs || fs.promises;
    this.path = options.path || path;
    this.ignoreDirs = new Set([...(options.ignoreDirs || DEFAULT_IGNORE_DIRS)]);
    this.excludePatterns = [...DEFAULT_EXCLUDE_PATTERNS, ...(options.excludePatterns || [])];
    this.excludeMatchers = this.excludePatterns.map(globToRegExp);
    this.maxFiles = options.maxFiles || 1000;
    this.maxFileBytes = options.maxFileBytes || 256 * 1024;
    this.concurrency = Math.max(1, Math.min(Number(options.concurrency) || 8, 32));
    this.embeddingProvider = options.embeddingProvider === false
      ? new NullEmbeddingProvider()
      : options.embeddingProvider || new LocalHashEmbeddingProvider();
    this.index = null;
    this.workspaceIndexes = new Map();
  }

  async indexWorkspaces(workspaces, options = {}) {
    const roots = (workspaces || [])
      .map((workspace) => ({
        name: workspace.name || this.path.basename(workspace.rootPath || workspace),
        rootPath: workspace.rootPath || workspace.uri?.fsPath || workspace,
      }))
      .filter((workspace) => workspace.rootPath);

    const projects = [];
    for (const workspace of roots) {
      if (isCancellationRequested(options.cancellationToken)) {
        throw new Error('Workspace indexing was cancelled.');
      }
      projects.push(await this.indexWorkspace(workspace.rootPath, { ...options, workspaceName: workspace.name }));
    }

    const merged = this.mergeWorkspaceIndexes(projects);
    this.index = merged;
    return merged;
  }

  async indexWorkspace(rootPath, options = {}) {
    if (!rootPath) {
      throw new Error('A workspace path is required before Jarvis can index the project.');
    }

    const startedAt = Date.now();
    const files = await this.collectFiles(rootPath, options);
    const packageInfo = await this.readPackageInfo(rootPath);
    const manifests = this.detectManifests(files);
    const analyzedFiles = [];

    let cursor = 0;
    const analyzeNext = async () => {
      const file = files[cursor];
      cursor += 1;
      if (!file) return;
      if (isCancellationRequested(options.cancellationToken)) {
        throw new Error('Workspace indexing was cancelled.');
      }

      const ext = this.path.extname(file.relativePath).toLowerCase();
      const language = LANGUAGE_BY_EXTENSION[ext];
      if (!language) {
        return analyzeNext();
      }

      const source = SOURCE_EXTENSIONS.has(ext) ? await this.readSmallText(file.absolutePath) : '';
      const symbols = source ? this.parseSymbols(source, ext) : this.emptySymbols();
      const semanticText = source ? this.createSemanticText(file.relativePath, source, symbols) : `${file.relativePath} ${language}`;
      analyzedFiles.push({
        ...file,
        language,
        symbols,
        symbolLocations: source ? this.parseSymbolLocations(source, ext) : [],
        imports: source ? this.parseImports(source, ext) : [],
        exports: source ? this.parseExports(source, ext) : [],
        semanticText,
        embedding: this.embeddingProvider.available ? await this.embeddingProvider.embed(semanticText) : [],
        embeddingProvider: this.embeddingProvider.id,
        lineCount: source ? source.split(/\r?\n/).length : 0,
        summary: source ? this.summarizeFile(file.relativePath, source, ext, symbols) : `${language} data/configuration file.`,
      });
      options.onProgress?.({
        rootPath,
        indexedFiles: analyzedFiles.length,
        totalFiles: files.length,
        file: file.relativePath,
      });
      return analyzeNext();
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, files.length) }, analyzeNext));

    const graph = this.buildGraph(analyzedFiles);
    const symbolIndex = this.buildSymbolIndex(analyzedFiles);
    const dependencyGraph = this.buildDependencyGraph(packageInfo, analyzedFiles);
    const folderGraph = this.buildFolderGraph(analyzedFiles);

    const index = {
      rootPath,
      workspaceName: options.workspaceName || this.path.basename(rootPath),
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      totals: {
        files: files.length,
        indexedFiles: analyzedFiles.length,
      },
      project: {
        name: packageInfo.name || this.path.basename(rootPath),
        type: this.detectProjectType(manifests, packageInfo),
        packageManagers: this.detectPackageManagers(manifests),
        languages: this.rankLanguages(analyzedFiles),
        frameworks: this.detectFrameworks(manifests, packageInfo),
        dependencies: packageInfo.dependencies,
        configurations: this.detectConfigurations(manifests),
      },
      architecture: this.detectArchitecture(analyzedFiles, manifests),
      graph,
      projectGraph: graph,
      folderGraph,
      symbolIndex,
      dependencyGraph,
      navigation: this.buildNavigationIndex(analyzedFiles, graph, symbolIndex),
      files: analyzedFiles,
    };

    index.summary = this.createProjectSummary(index);
    this.index = index;
    this.workspaceIndexes.set(rootPath, index);
    return index;
  }

  getIndex() {
    return this.index;
  }

  explainProject(index = this.index) {
    if (!index) {
      return 'Jarvis has not indexed this workspace yet.';
    }

    const languages = index.project.languages.map((entry) => `${entry.language} (${entry.count})`).join(', ') || 'unknown';
    const frameworks = index.project.frameworks.join(', ') || 'none detected';
    const packageManagers = index.project.packageManagers.join(', ') || 'none detected';

    return [
      `${index.project.name} is a ${index.project.type} project.`,
      `Primary languages: ${languages}.`,
      `Frameworks/tools detected: ${frameworks}.`,
      `Package managers: ${packageManagers}.`,
      `Architecture signals: ${index.architecture.patterns.join(', ') || 'general source layout'}.`,
      `Jarvis indexed ${index.totals.indexedFiles} relevant files, ${index.symbolIndex.length} symbols, ${index.dependencyGraph.external.length} external dependencies, and ${index.graph.edges.length} local import relationships.`,
    ].join('\n');
  }

  search(query, options = {}) {
    const index = options.index || this.index;
    if (!index) {
      return [];
    }

    const terms = tokenize(query);
    if (!terms.length) {
      return [];
    }

    return index.files
      .map((file) => {
        const haystack = tokenize([
          file.relativePath,
          file.language,
          file.summary,
          file.imports.join(' '),
          file.symbols.classes.join(' '),
          file.symbols.interfaces.join(' '),
          file.symbols.functions.join(' '),
          file.symbols.methods.join(' '),
          file.symbols.variables.join(' '),
        ].join(' '));

        const score = terms.reduce((total, term) => total + haystack.filter((token) => token.includes(term)).length, 0);
        return { file: file.relativePath, language: file.language, summary: file.summary, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
      .slice(0, options.limit || 10);
  }

  searchIndex(query, options = {}) {
    const mode = options.mode || 'hybrid';
    if (mode === 'exact') {
      return this.exactTextSearch(query, options);
    }
    if (mode === 'filename') {
      return this.filenameSearch(query, options);
    }
    if (mode === 'symbol') {
      return this.findSymbol(query, options);
    }
    if (mode === 'semantic') {
      return this.semanticSearch(query, options);
    }
    return this.hybridSearch(query, options);
  }

  hybridSearch(query, options = {}) {
    const exact = this.exactTextSearch(query, { ...options, limit: options.limit || 20 });
    const semantic = this.semanticSearch(query, { ...options, limit: options.limit || 20 });
    const filename = this.filenameSearch(query, { ...options, limit: options.limit || 20 });
    const merged = new Map();

    [...exact, ...semantic, ...filename].forEach((entry) => {
      const current = merged.get(entry.file);
      const score = Number(entry.score || 0) + (entry.mode === 'exact' ? 3 : entry.mode === 'filename' ? 2 : 1);
      if (!current || score > current.score) {
        merged.set(entry.file, { ...entry, score: Number(score.toFixed(4)), mode: 'hybrid' });
      }
    });

    return [...merged.values()]
      .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
      .slice(0, options.limit || 10);
  }

  filenameSearch(query, options = {}) {
    const index = options.index || this.index;
    const terms = tokenize(query);
    if (!index || !terms.length) {
      return [];
    }

    return index.files
      .map((file) => {
        const haystack = tokenize(file.relativePath);
        const score = terms.reduce((total, term) => total + haystack.filter((token) => token.includes(term)).length, 0);
        return { file: file.relativePath, language: file.language, summary: file.summary, score, mode: 'filename' };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
      .slice(0, options.limit || 10);
  }

  exactTextSearch(query, options = {}) {
    const index = options.index || this.index;
    const needle = String(query || '').toLowerCase().trim();
    if (!index || !needle) {
      return [];
    }

    return index.files
      .map((file) => {
        const haystack = String(file.semanticText || '').toLowerCase();
        const first = haystack.indexOf(needle);
        return {
          file: file.relativePath,
          language: file.language,
          summary: file.summary,
          score: first >= 0 ? 10 : 0,
          mode: 'exact',
        };
      })
      .filter((entry) => entry.score > 0)
      .slice(0, options.limit || 10);
  }

  semanticSearch(query, options = {}) {
    const index = options.index || this.index;
    if (!index) {
      return [];
    }

    const queryTerms = tokenize(query);
    if (!queryTerms.length) {
      return [];
    }

    if (this.embeddingProvider.available && index.files.some((file) => Array.isArray(file.embedding) && file.embedding.length)) {
      return this.embeddingSemanticSearch(query, index, options);
    }

    const documents = index.files.map((file) => ({
      file,
      terms: tokenize(file.semanticText),
    }));
    const documentCount = Math.max(documents.length, 1);
    const documentFrequency = new Map();

    documents.forEach((document) => {
      unique(document.terms).forEach((term) => {
        documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
      });
    });

    return documents
      .map((document) => {
        const termCounts = new Map();
        document.terms.forEach((term) => termCounts.set(term, (termCounts.get(term) || 0) + 1));

        const score = queryTerms.reduce((total, term) => {
          const exact = termCounts.get(term) || 0;
          const fuzzy = [...termCounts.entries()]
            .filter(([candidate]) => candidate.includes(term) || term.includes(candidate))
            .reduce((sum, [, count]) => sum + count * 0.35, 0);
          const frequency = exact + fuzzy;
          if (!frequency) {
            return total;
          }
          const idf = Math.log((1 + documentCount) / (1 + (documentFrequency.get(term) || 0))) + 1;
          return total + frequency * idf;
        }, 0);

        return {
          file: document.file.relativePath,
          language: document.file.language,
          summary: document.file.summary,
          symbols: document.file.symbolLocations.slice(0, 8),
          score: Number(score.toFixed(4)),
          mode: 'keyword-fallback',
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
      .slice(0, options.limit || 10);
  }

  async embedQuery(query) {
    return this.embeddingProvider.available ? this.embeddingProvider.embed(query) : [];
  }

  embeddingSemanticSearch(query, index, options = {}) {
    const queryEmbeddingPromise = this.embeddingProvider.embed(query);
    if (queryEmbeddingPromise && typeof queryEmbeddingPromise.then === 'function') {
      throw new Error('Asynchronous embedding providers must use semanticSearchAsync.');
    }
    return this.rankByEmbedding(queryEmbeddingPromise, index, { ...options, query });
  }

  async semanticSearchAsync(query, options = {}) {
    const index = options.index || this.index;
    if (!index) {
      return [];
    }
    if (!this.embeddingProvider.available) {
      return this.semanticSearch(query, options);
    }
    const queryEmbedding = await this.embeddingProvider.embed(query);
    return this.rankByEmbedding(queryEmbedding, index, { ...options, query });
  }

  rankByEmbedding(queryEmbedding, index, options = {}) {
    const queryTokens = new Set(tokenize(options.originalQuery || options.query || ''));
    return index.files
      .map((file) => {
        const vectorScore = cosineSimilarity(queryEmbedding, file.embedding || []);
        const filenameBoost = tokenize(file.relativePath).some((token) => queryTokens.has(token)) ? 0.1 : 0;
        return {
          file: file.relativePath,
          language: file.language,
          summary: file.summary,
          symbols: file.symbolLocations.slice(0, 8),
          score: Number((vectorScore + filenameBoost).toFixed(4)),
          mode: 'semantic-embedding',
          embeddingProvider: file.embeddingProvider || this.embeddingProvider.id,
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
      .slice(0, options.limit || 10);
  }

  findSymbol(name, options = {}) {
    const index = options.index || this.index;
    if (!index || !name) {
      return [];
    }

    const query = String(name).toLowerCase();
    return index.symbolIndex
      .filter((symbol) => symbol.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file))
      .slice(0, options.limit || 20);
  }

  getFileRelationships(relativePath, options = {}) {
    const index = options.index || this.index;
    if (!index || !relativePath) {
      return { imports: [], importedBy: [], externalImports: [] };
    }

    const normalized = normalizeSlash(relativePath);
    const file = index.files.find((entry) => entry.relativePath === normalized);
    return {
      imports: index.graph.edges.filter((edge) => edge.from === normalized).map((edge) => edge.to),
      importedBy: index.graph.edges.filter((edge) => edge.to === normalized).map((edge) => edge.from),
      externalImports: file ? file.imports.filter((item) => !item.startsWith('.')) : [],
    };
  }

  getFile(relativePath, options = {}) {
    const index = options.index || this.index;
    const normalized = normalizeSlash(relativePath || '');
    return index?.files.find((file) => file.relativePath === normalized) || null;
  }

  getFiles(options = {}) {
    const index = options.index || this.index;
    return index ? index.files.slice() : [];
  }

  getSymbols(options = {}) {
    const index = options.index || this.index;
    return index ? index.symbolIndex.slice() : [];
  }

  getDependencies(relativePath, options = {}) {
    return this.getFileRelationships(relativePath, options).imports;
  }

  getDependents(relativePath, options = {}) {
    return this.getFileRelationships(relativePath, options).importedBy;
  }

  getRelatedFiles(relativePath, options = {}) {
    const relationships = this.getFileRelationships(relativePath, options);
    return unique([...relationships.imports, ...relationships.importedBy]).sort();
  }

  getProjectMetadata(options = {}) {
    const index = options.index || this.index;
    if (!index) {
      return null;
    }
    return {
      rootPath: index.rootPath,
      workspaceName: index.workspaceName,
      project: index.project,
      architecture: index.architecture,
      totals: index.totals,
      generatedAt: index.generatedAt,
    };
  }

  getSymbolLocation(name, options = {}) {
    return this.findSymbol(name, { ...options, limit: 1 })[0] || null;
  }

  findReferences(name, options = {}) {
    const index = options.index || this.index;
    const query = String(name || '').trim();
    if (!index || !query) {
      return [];
    }

    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const referencePattern = new RegExp(`\\b${escaped}\\b`, 'g');
    return index.files.flatMap((file) => {
      const references = [];
      const lines = String(file.semanticText || '').split(/\r?\n/);
      lines.forEach((line, lineIndex) => {
        referencePattern.lastIndex = 0;
        let match;
        while ((match = referencePattern.exec(line))) {
          references.push({
            name: query,
            file: file.relativePath,
            line: lineIndex + 1,
            column: match.index + 1,
            preview: line.trim().slice(0, 160),
          });
        }
      });
      return references;
    }).slice(0, options.limit || 50);
  }

  getRelatedSymbols(name, options = {}) {
    const index = options.index || this.index;
    const symbol = this.getSymbolLocation(name, options);
    if (!index || !symbol) {
      return [];
    }

    const relatedFiles = new Set([symbol.file, ...this.getRelatedFiles(symbol.file, options)]);
    return index.symbolIndex
      .filter((candidate) => candidate.name !== symbol.name && relatedFiles.has(candidate.file))
      .slice(0, options.limit || 20);
  }

  getEntryPoints(options = {}) {
    const index = options.index || this.index;
    if (!index) {
      return [];
    }

    const entryHints = [
      /(^|\/)(index|main|app|server|extension|bootstrap)\.(js|jsx|ts|tsx|mjs|cjs|py|cs|java|go|rs)$/i,
      /(^|\/)package\.json$/i,
    ];
    return index.files
      .filter((file) => entryHints.some((pattern) => pattern.test(file.relativePath)))
      .map((file) => ({ file: file.relativePath, language: file.language, summary: file.summary }))
      .slice(0, options.limit || 20);
  }

  getImportantModules(options = {}) {
    const index = options.index || this.index;
    if (!index) {
      return [];
    }

    const incoming = new Map();
    const outgoing = new Map();
    index.graph.edges.forEach((edge) => {
      incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
      outgoing.set(edge.from, (outgoing.get(edge.from) || 0) + 1);
    });

    return index.files
      .map((file) => ({
        file: file.relativePath,
        language: file.language,
        summary: file.summary,
        score: (incoming.get(file.relativePath) || 0) * 2
          + (outgoing.get(file.relativePath) || 0)
          + file.symbolLocations.length * 0.25,
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file))
      .slice(0, options.limit || 20);
  }

  getDependencyPath(fromFile, toFile, options = {}) {
    const index = options.index || this.index;
    const from = normalizeSlash(fromFile || '');
    const to = normalizeSlash(toFile || '');
    if (!index || !from || !to) {
      return [];
    }

    const queue = [[from]];
    const seen = new Set([from]);
    while (queue.length) {
      const pathCandidate = queue.shift();
      const current = pathCandidate[pathCandidate.length - 1];
      if (current === to) {
        return pathCandidate;
      }
      index.graph.edges
        .filter((edge) => edge.from === current)
        .forEach((edge) => {
          if (!seen.has(edge.to)) {
            seen.add(edge.to);
            queue.push([...pathCandidate, edge.to]);
          }
        });
    }
    return [];
  }

  async collectFiles(rootPath, options = {}) {
    const root = this.path.resolve(rootPath);
    const results = [];
    const gitignoreMatchers = await this.loadGitignoreMatchers(root);
    const configuredExcludes = [...(options.excludePatterns || [])].map(globToRegExp);
    const shouldExclude = (relativePath, entryName) => {
      const normalized = normalizeSlash(relativePath);
      return this.ignoreDirs.has(entryName)
        || this.excludeMatchers.some((matcher) => matcher.test(normalized))
        || configuredExcludes.some((matcher) => matcher.test(normalized))
        || gitignoreMatchers.some((matcher) => matcher.test(normalized))
        || this.isGeneratedFile(normalized)
        || this.isBinaryFile(normalized);
    };

    const visit = async (dir) => {
      if (isCancellationRequested(options.cancellationToken)) {
        throw new Error('Workspace indexing was cancelled.');
      }
      if (results.length >= this.maxFiles) {
        return;
      }

      let entries = [];
      try {
        entries = await this.fs.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (results.length >= this.maxFiles) {
          return;
        }

        const absolutePath = this.path.join(dir, entry.name);
        const relativePath = normalizeSlash(this.path.relative(root, absolutePath));

        if (entry.isDirectory()) {
          if (!shouldExclude(relativePath, entry.name)) {
            await visit(absolutePath);
          }
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        let stat;
        try {
          stat = await this.fs.stat(absolutePath);
        } catch {
          continue;
        }

        if (shouldExclude(relativePath, entry.name)) {
          continue;
        }

        results.push({
          absolutePath,
          relativePath,
          extension: this.path.extname(entry.name).toLowerCase(),
          size: stat.size,
          modifiedAt: stat.mtime?.toISOString?.() || null,
        });
      }
    };

    await visit(root);
    return results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  async loadGitignoreMatchers(rootPath) {
    const raw = await this.readSmallText(this.path.join(rootPath, '.gitignore'));
    if (!raw) {
      return [];
    }

    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && !line.startsWith('!'))
      .flatMap((line) => {
        const directoryPattern = line.endsWith('/') ? `${line}**` : line;
        if (directoryPattern.startsWith('/')) {
          return [globToRegExp(directoryPattern.slice(1))];
        }
        return [
          globToRegExp(directoryPattern),
          globToRegExp(`**/${directoryPattern}`),
        ];
      });
  }

  isBinaryFile(relativePath) {
    return BINARY_EXTENSIONS.has(this.path.extname(relativePath).toLowerCase());
  }

  isGeneratedFile(relativePath) {
    return /(^|\/)(generated|__generated__)(\/|$)/i.test(relativePath)
      || /\.generated\./i.test(relativePath)
      || /\.min\.(js|css)$/i.test(relativePath);
  }

  async readSmallText(filePath) {
    try {
      const stat = await this.fs.stat(filePath);
      if (stat.size > this.maxFileBytes) {
        return '';
      }
      return await this.fs.readFile(filePath, 'utf8');
    } catch {
      return '';
    }
  }

  async readPackageInfo(rootPath) {
    const packagePath = this.path.join(rootPath, 'package.json');
    const raw = await this.readSmallText(packagePath);
    if (!raw) {
      return { dependencies: [] };
    }

    try {
      const pkg = JSON.parse(raw);
      const deps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
        ...(pkg.peerDependencies || {}),
      };
      return {
        name: pkg.displayName || pkg.name,
        dependencies: Object.keys(deps).sort(),
      };
    } catch {
      return { dependencies: [] };
    }
  }

  detectManifests(files) {
    return new Set(files.map((file) => file.relativePath));
  }

  detectProjectType(manifests, packageInfo) {
    if (manifests.has('package.json') && packageInfo.dependencies.includes('@types/vscode')) {
      return 'VS Code extension';
    }
    if (manifests.has('package.json')) {
      return 'Node.js project';
    }
    if ([...manifests].some((file) => file.endsWith('.csproj') || file.endsWith('.sln'))) {
      return '.NET project';
    }
    if (manifests.has('pyproject.toml') || manifests.has('requirements.txt')) {
      return 'Python project';
    }
    if (manifests.has('go.mod')) {
      return 'Go module';
    }
    if (manifests.has('Cargo.toml')) {
      return 'Rust crate';
    }
    return 'general workspace';
  }

  detectConfigurations(manifests) {
    return [...manifests]
      .filter((file) => /(^|\/)(tsconfig|jsconfig|vite\.config|webpack\.config|eslint\.config|package|pyproject|requirements|docker-compose|Dockerfile|\.env\.example)/i.test(file))
      .sort();
  }

  detectPackageManagers(manifests) {
    const managers = [];
    if (manifests.has('package-lock.json')) managers.push('npm');
    if (manifests.has('yarn.lock')) managers.push('yarn');
    if (manifests.has('pnpm-lock.yaml')) managers.push('pnpm');
    if (manifests.has('requirements.txt') || manifests.has('pyproject.toml')) managers.push('pip/python');
    if (manifests.has('Cargo.toml')) managers.push('cargo');
    if (manifests.has('go.mod')) managers.push('go');
    return managers;
  }

  detectFrameworks(manifests, packageInfo) {
    const deps = new Set(packageInfo.dependencies.map((dep) => dep.toLowerCase()));
    return FRAMEWORK_HINTS
      .filter((hint) => hint.deps.some((dep) => deps.has(dep.toLowerCase())) || hint.files.some((file) => manifests.has(file)))
      .map((hint) => hint.name);
  }

  rankLanguages(files) {
    const counts = new Map();
    files.forEach((file) => counts.set(file.language, (counts.get(file.language) || 0) + 1));
    return [...counts.entries()]
      .map(([language, count]) => ({ language, count }))
      .sort((a, b) => b.count - a.count || a.language.localeCompare(b.language));
  }

  detectArchitecture(files, manifests) {
    const directories = unique(files.map((file) => file.relativePath.split('/').slice(0, -1).join('/')).filter(Boolean));
    const patterns = [];
    const hasDir = (name) => directories.some((dir) => dir === name || dir.endsWith(`/${name}`));

    if (hasDir('src')) patterns.push('source-first layout');
    if (hasDir('test') || hasDir('tests')) patterns.push('test suite');
    if (hasDir('services')) patterns.push('service layer');
    if (hasDir('core')) patterns.push('core platform layer');
    if (hasDir('providers')) patterns.push('provider abstraction');
    if (hasDir('webview')) patterns.push('webview UI');
    if (manifests.has('package.json')) patterns.push('manifest-driven extension');
    if (files.some((file) => file.imports.some((item) => item.startsWith('.')))) patterns.push('modular local imports');
    if (files.some((file) => file.symbols.classes.length) && files.some((file) => file.symbols.functions.length)) patterns.push('mixed object/function modules');

    return { directories, patterns: unique(patterns) };
  }

  buildGraph(files) {
    const nodes = files.map((file) => ({
      id: file.relativePath,
      language: file.language,
      symbols: file.symbols,
    }));
    const byStem = new Map(files.map((file) => [file.relativePath.replace(/\.[^.]+$/, ''), file.relativePath]));
    const edges = [];

    for (const file of files) {
      for (const imported of file.imports) {
        if (!imported.startsWith('.')) {
          continue;
        }

        const base = normalizeSlash(this.path.normalize(this.path.join(this.path.dirname(file.relativePath), imported)));
        const target = byStem.get(base) || byStem.get(`${base}/index`);
        if (target) {
          edges.push({ from: file.relativePath, to: target, type: 'imports' });
        }
      }
    }

    return { nodes, edges };
  }

  buildFolderGraph(files) {
    const folders = new Map();
    const edges = [];

    const ensure = (id) => {
      if (!folders.has(id)) {
        folders.set(id, { id, files: 0, languages: new Set() });
      }
      return folders.get(id);
    };

    ensure('.');
    files.forEach((file) => {
      const parts = file.relativePath.split('/').slice(0, -1);
      let parent = '.';
      if (!parts.length) {
        const folder = ensure('.');
        folder.files += 1;
        folder.languages.add(file.language);
        return;
      }

      parts.forEach((part, index) => {
        const id = parts.slice(0, index + 1).join('/');
        const folder = ensure(id);
        folder.languages.add(file.language);
        if (!edges.some((edge) => edge.from === parent && edge.to === id)) {
          edges.push({ from: parent, to: id, type: 'contains' });
        }
        parent = id;
      });

      ensure(parts.join('/')).files += 1;
    });

    return {
      nodes: [...folders.values()].map((folder) => ({
        id: folder.id,
        files: folder.files,
        languages: [...folder.languages].sort(),
      })),
      edges,
    };
  }

  buildSymbolIndex(files) {
    return files.flatMap((file) => file.symbolLocations.map((symbol) => ({
      ...symbol,
      file: file.relativePath,
      language: file.language,
    }))).sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));
  }

  buildDependencyGraph(packageInfo, files) {
    const declared = new Set(packageInfo.dependencies);
    const imported = new Set();
    const edges = [];

    files.forEach((file) => {
      file.imports
        .filter((item) => !item.startsWith('.'))
        .forEach((item) => {
          const dependency = this.normalizeDependencyName(item);
          imported.add(dependency);
          edges.push({ from: file.relativePath, to: dependency, type: 'uses' });
        });
    });

    return {
      declared: [...declared].sort(),
      external: unique([...declared, ...imported]).sort(),
      imported: [...imported].sort(),
      unusedDeclared: [...declared].filter((dep) => !imported.has(dep)).sort(),
      undeclaredImports: [...imported].filter((dep) => !declared.has(dep) && !this.isBuiltinDependency(dep)).sort(),
      edges,
    };
  }

  buildNavigationIndex(files, graph, symbolIndex) {
    return {
      files: files.map((file) => ({
        file: file.relativePath,
        language: file.language,
        symbols: file.symbolLocations.map((symbol) => ({
          name: symbol.name,
          kind: symbol.kind,
          line: symbol.line,
        })),
      })),
      symbolsByName: symbolIndex.reduce((acc, symbol) => {
        if (!acc[symbol.name]) {
          acc[symbol.name] = [];
        }
        acc[symbol.name].push({ file: symbol.file, line: symbol.line, kind: symbol.kind });
        return acc;
      }, {}),
      relationshipsByFile: files.reduce((acc, file) => {
        acc[file.relativePath] = {
          imports: graph.edges.filter((edge) => edge.from === file.relativePath).map((edge) => edge.to),
          importedBy: graph.edges.filter((edge) => edge.to === file.relativePath).map((edge) => edge.from),
        };
        return acc;
      }, {}),
    };
  }

  normalizeDependencyName(importPath) {
    if (importPath.startsWith('@')) {
      return importPath.split('/').slice(0, 2).join('/');
    }
    return importPath.split('/')[0];
  }

  isBuiltinDependency(name) {
    return new Set([
      'assert',
      'buffer',
      'child_process',
      'crypto',
      'events',
      'fs',
      'http',
      'https',
      'os',
      'path',
      'stream',
      'url',
      'util',
      'vscode',
    ]).has(name);
  }

  parseImports(source, ext) {
    const imports = [];
    const patterns = [
      /import\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g,
      /require\(\s*['"]([^'"]+)['"]\s*\)/g,
      /export\s+[^'"]+\s+from\s+['"]([^'"]+)['"]/g,
    ];

    if (['.py'].includes(ext)) {
      patterns.push(/^\s*from\s+([a-zA-Z0-9_.]+)\s+import\s+/gm, /^\s*import\s+([a-zA-Z0-9_.]+)/gm);
    }

    if (['.cs'].includes(ext)) {
      patterns.push(/^\s*using\s+([a-zA-Z0-9_.]+)\s*;/gm);
    }

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(source))) {
        imports.push(match[1]);
      }
    }

    return unique(imports).sort();
  }

  parseExports(source, ext) {
    if (!['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
      return [];
    }

    const exports = [];
    const patterns = [
      /module\.exports\s*=\s*\{([^}]+)\}/g,
      /exports\.([A-Za-z_$][\w$]*)\s*=/g,
      /export\s+(?:class|function|const|let|var|interface)\s+([A-Za-z_$][\w$]*)/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(source))) {
        if (match[1].includes(',')) {
          match[1].split(',').map((part) => part.trim().split(/\s+/)[0]).forEach((name) => exports.push(name));
        } else {
          exports.push(match[1]);
        }
      }
    }

    return unique(exports).sort();
  }

  parseSymbols(source, ext) {
    const symbols = this.emptySymbols();
    const collect = (pattern, target) => {
      let match;
      while ((match = pattern.exec(source))) {
        symbols[target].push(match[1]);
      }
    };

    collect(/\bclass\s+([A-Za-z_$][\w$]*)/g, 'classes');
    collect(/\binterface\s+([A-Za-z_$][\w$]*)/g, 'interfaces');
    collect(/\b(?:function|def)\s+([A-Za-z_$][\w$]*)\s*\(/g, 'functions');
    collect(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g, 'variables');

    if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
      collect(/\b([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?\([^)]*\)\s*=>/g, 'functions');
      collect(/\basync\s+([A-Za-z_$][\w$]*)\s*\(/g, 'methods');
      collect(/^\s{2,}([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm, 'methods');
    }

    if (ext === '.cs' || ext === '.java') {
      collect(/\b(?:public|private|protected|internal|static|async|\s)+[A-Za-z0-9_<>,\[\]?]+\s+([A-Za-z_][\w]*)\s*\(/g, 'methods');
    }

    Object.keys(symbols).forEach((key) => {
      symbols[key] = unique(symbols[key]).sort();
    });

    return symbols;
  }

  parseSymbolLocations(source, ext) {
    const lines = source.split(/\r?\n/);
    const symbols = [];
    const patterns = [
      { kind: 'class', pattern: /\bclass\s+([A-Za-z_$][\w$]*)/g },
      { kind: 'interface', pattern: /\binterface\s+([A-Za-z_$][\w$]*)/g },
      { kind: 'function', pattern: /\b(?:function|def)\s+([A-Za-z_$][\w$]*)\s*\(/g },
      { kind: 'variable', pattern: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g },
    ];

    if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) {
      patterns.push(
        { kind: 'function', pattern: /\b([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?\([^)]*\)\s*=>/g },
        { kind: 'method', pattern: /\basync\s+([A-Za-z_$][\w$]*)\s*\(/g },
        { kind: 'method', pattern: /^\s{2,}([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g },
      );
    }

    if (ext === '.cs' || ext === '.java') {
      patterns.push({ kind: 'method', pattern: /\b(?:public|private|protected|internal|static|async|\s)+[A-Za-z0-9_<>,\[\]?]+\s+([A-Za-z_][\w]*)\s*\(/g });
    }

    lines.forEach((line, index) => {
      patterns.forEach(({ kind, pattern }) => {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(line))) {
          symbols.push({
            name: match[1],
            kind,
            line: index + 1,
            column: match.index + 1,
          });
        }
      });
    });

    const seen = new Set();
    return symbols.filter((symbol) => {
      const key = `${symbol.kind}:${symbol.name}:${symbol.line}:${symbol.column}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  emptySymbols() {
    return {
      classes: [],
      interfaces: [],
      methods: [],
      functions: [],
      variables: [],
    };
  }

  createSemanticText(relativePath, source, symbols) {
    const comments = source
      .split(/\r?\n/)
      .filter((line) => /^\s*(\/\/|#|\/\*|\*|--)/.test(line))
      .slice(0, 20)
      .join(' ');
    return [
      relativePath,
      symbols.classes.join(' '),
      symbols.interfaces.join(' '),
      symbols.functions.join(' '),
      symbols.methods.join(' '),
      symbols.variables.join(' '),
      comments,
      source.slice(0, 4000),
    ].join(' ');
  }

  summarizeFile(relativePath, source, ext, parsedSymbols = null) {
    const symbols = parsedSymbols || this.parseSymbols(source, ext);
    const parts = [];
    if (symbols.classes.length) parts.push(`classes ${symbols.classes.slice(0, 3).join(', ')}`);
    if (symbols.interfaces.length) parts.push(`interfaces ${symbols.interfaces.slice(0, 3).join(', ')}`);
    if (symbols.functions.length) parts.push(`functions ${symbols.functions.slice(0, 4).join(', ')}`);
    if (symbols.methods.length) parts.push(`methods ${symbols.methods.slice(0, 4).join(', ')}`);
    return parts.length ? `${relativePath} defines ${parts.join('; ')}.` : `${relativePath} contains ${LANGUAGE_BY_EXTENSION[ext] || 'source'} code.`;
  }

  createProjectSummary(index) {
    return {
      text: this.explainProject(index),
      topFiles: index.files
        .filter((file) => file.symbols.classes.length || file.symbols.functions.length || file.symbols.methods.length)
        .slice(0, 12)
        .map((file) => ({ file: file.relativePath, summary: file.summary })),
      topDependencies: index.dependencyGraph.external.slice(0, 12),
      architecturePatterns: index.architecture.patterns,
    };
  }

  mergeWorkspaceIndexes(projects) {
    if (projects.length === 1) {
      return projects[0];
    }

    const files = projects.flatMap((project) => project.files.map((file) => ({
      ...file,
      workspaceName: project.workspaceName,
      workspaceRoot: project.rootPath,
      relativePath: `${project.workspaceName}/${file.relativePath}`,
    })));
    const graph = this.buildGraph(files);
    const symbolIndex = this.buildSymbolIndex(files);
    const dependencyGraph = this.buildDependencyGraph({
      dependencies: unique(projects.flatMap((project) => project.project.dependencies)),
    }, files);
    const folderGraph = this.buildFolderGraph(files);

    const index = {
      rootPath: projects.map((project) => project.rootPath).join(this.path.delimiter),
      workspaceName: 'multi-root workspace',
      generatedAt: new Date().toISOString(),
      durationMs: projects.reduce((total, project) => total + project.durationMs, 0),
      totals: {
        files: projects.reduce((total, project) => total + project.totals.files, 0),
        indexedFiles: files.length,
        workspaces: projects.length,
      },
      project: {
        name: projects.map((project) => project.project.name).join(', '),
        type: 'multi-root workspace',
        packageManagers: unique(projects.flatMap((project) => project.project.packageManagers)).sort(),
        languages: this.rankLanguages(files),
        frameworks: unique(projects.flatMap((project) => project.project.frameworks)).sort(),
        dependencies: unique(projects.flatMap((project) => project.project.dependencies)).sort(),
        configurations: unique(projects.flatMap((project) => project.project.configurations || [])).sort(),
      },
      architecture: {
        directories: unique(projects.flatMap((project) => project.architecture.directories)).sort(),
        patterns: unique(projects.flatMap((project) => project.architecture.patterns)).sort(),
      },
      graph,
      projectGraph: graph,
      folderGraph,
      symbolIndex,
      dependencyGraph,
      navigation: this.buildNavigationIndex(files, graph, symbolIndex),
      projects,
      files,
    };

    index.summary = this.createProjectSummary(index);
    return index;
  }
}

module.exports = { WorkspaceIntelligenceService };
