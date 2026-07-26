const fs = require('fs');
const path = require('path');

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
    .split(/[^a-z0-9_#.-]+/)
    .filter((token) => token.length > 1);
}

class WorkspaceIntelligenceService {
  constructor(options = {}) {
    this.fs = options.fs || fs.promises;
    this.path = options.path || path;
    this.ignoreDirs = new Set([...(options.ignoreDirs || DEFAULT_IGNORE_DIRS)]);
    this.maxFiles = options.maxFiles || 1000;
    this.maxFileBytes = options.maxFileBytes || 256 * 1024;
    this.index = null;
  }

  async indexWorkspace(rootPath) {
    if (!rootPath) {
      throw new Error('A workspace path is required before Jarvis can index the project.');
    }

    const startedAt = Date.now();
    const files = await this.collectFiles(rootPath);
    const packageInfo = await this.readPackageInfo(rootPath);
    const manifests = this.detectManifests(files);
    const analyzedFiles = [];

    for (const file of files) {
      const ext = this.path.extname(file.relativePath).toLowerCase();
      const language = LANGUAGE_BY_EXTENSION[ext];
      if (!language) {
        continue;
      }

      const source = SOURCE_EXTENSIONS.has(ext) ? await this.readSmallText(file.absolutePath) : '';
      analyzedFiles.push({
        ...file,
        language,
        symbols: source ? this.parseSymbols(source, ext) : this.emptySymbols(),
        imports: source ? this.parseImports(source, ext) : [],
        summary: source ? this.summarizeFile(file.relativePath, source, ext) : `${language} data/configuration file.`,
      });
    }

    const index = {
      rootPath,
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
      },
      architecture: this.detectArchitecture(analyzedFiles, manifests),
      graph: this.buildGraph(analyzedFiles),
      files: analyzedFiles,
    };

    index.summary = this.createProjectSummary(index);
    this.index = index;
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
      `Jarvis indexed ${index.totals.indexedFiles} relevant files and mapped ${index.graph.edges.length} import relationships.`,
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

  async collectFiles(rootPath) {
    const root = this.path.resolve(rootPath);
    const results = [];

    const visit = async (dir) => {
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
          if (!this.ignoreDirs.has(entry.name)) {
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

  emptySymbols() {
    return {
      classes: [],
      interfaces: [],
      methods: [],
      functions: [],
      variables: [],
    };
  }

  summarizeFile(relativePath, source, ext) {
    const symbols = this.parseSymbols(source, ext);
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
    };
  }
}

module.exports = { WorkspaceIntelligenceService };
