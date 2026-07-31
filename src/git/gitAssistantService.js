const { execFile } = require('child_process');

function runGit(args, options = {}) {
  return new Promise((resolve) => {
    execFile('git', args, {
      cwd: options.cwd,
      timeout: options.timeoutMs || 30000,
      windowsHide: true,
      shell: false,
    }, (error, stdout, stderr) => {
      resolve({
        args,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        exitCode: error?.code || 0,
        ok: !error,
      });
    });
  });
}

class GitAssistantService {
  constructor(options = {}) {
    this.runner = options.runner || runGit;
  }

  async getStatus(cwd) {
    const result = await this.runner(['status', '--short', '--branch'], { cwd });
    const lines = result.stdout.split(/\r?\n/).filter(Boolean);
    const branchLine = lines.find((line) => line.startsWith('##')) || '';
    const files = lines
      .filter((line) => !line.startsWith('##'))
      .map((line) => ({
        status: line.slice(0, 2).trim() || line.slice(0, 2),
        file: line.slice(3).trim(),
      }));
    return { ok: result.ok, branch: branchLine.replace(/^##\s*/, ''), files, raw: result.stdout, stderr: result.stderr };
  }

  async getDiff(cwd, options = {}) {
    const args = options.staged ? ['diff', '--staged', '--', ...this.safePaths(options.paths)] : ['diff', '--', ...this.safePaths(options.paths)];
    return this.runner(args, { cwd });
  }

  async getRecentHistory(cwd, limit = 10) {
    const safeLimit = String(Math.max(1, Math.min(Number(limit) || 10, 50)));
    const result = await this.runner(['log', `-${safeLimit}`, '--oneline', '--decorate'], { cwd });
    return result.stdout.split(/\r?\n/).filter(Boolean);
  }

  async getBranch(cwd) {
    const result = await this.runner(['branch', '--show-current'], { cwd });
    return result.stdout.trim();
  }

  summarizeStatus(status) {
    const counts = status.files.reduce((acc, file) => {
      acc[file.status] = (acc[file.status] || 0) + 1;
      return acc;
    }, {});
    return {
      branch: status.branch,
      changedFiles: status.files.length,
      counts,
      files: status.files,
    };
  }

  buildDiffPrompt(diff, options = {}) {
    return [
      options.commit ? 'Generate a concise conventional commit message for this diff.' : 'Explain this Git diff. Focus on behavior, risks, and tests.',
      'Do not suggest destructive Git commands.',
      '',
      String(diff || '').slice(0, options.maxChars || 12000),
    ].join('\n');
  }

  safePaths(paths = []) {
    return (paths || [])
      .filter((entry) => typeof entry === 'string' && entry && !entry.includes('..') && !/^[a-zA-Z]:/.test(entry))
      .slice(0, 50);
  }
}

module.exports = { GitAssistantService, runGit };
