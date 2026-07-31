const { execFile } = require('child_process');

const RISKY_PATTERNS = [
  /\brm\b|\bdel\b|\brmdir\b/i,
  /\bformat\b|\bdiskpart\b/i,
  /\bgit\s+(reset|clean|push|rebase)\b/i,
  /\bchmod\b|\bchown\b/i,
  /\bshutdown\b|\brestart\b/i,
  />\s*\S+|--force|-f\b/i,
  /[;&|`$<>]/,
];

const LOW_RISK_PATTERNS = [
  /^git\s+(status|diff|log|branch|show)\b/i,
  /^node\s+--check\s+[\w./\\-]+$/i,
  /^npm\s+(test|run\s+lint|run\s+build|run\s+package)\b/i,
  /^python\s+-m\s+(py_compile|pylint|pyflakes)\b/i,
  /^pwsh\s+-Command\s+Get-[A-Za-z]+\b/i,
  /^Get-[A-Za-z]+\b/i,
];

class TerminalAgentService {
  classifyCommand(command) {
    const text = String(command || '').trim();
    if (!text) {
      return { risk: 'empty', requiresApproval: true, reason: 'No command provided.' };
    }
    if (RISKY_PATTERNS.some((pattern) => pattern.test(text))) {
      return { risk: 'high', requiresApproval: true, reason: 'Command may modify or destroy data.' };
    }
    if (LOW_RISK_PATTERNS.some((pattern) => pattern.test(text))) {
      return { risk: 'low', requiresApproval: false, reason: 'Read-only or common project inspection command.' };
    }
    return { risk: 'medium', requiresApproval: true, reason: 'Command effect is not known safe.' };
  }

  explainFailure(command, output) {
    return [
      `Command: ${command}`,
      'Analyze the following terminal output. Identify the likely cause and suggest the safest next command or code fix.',
      output,
    ].join('\n\n');
  }

  runApproved(command, options = {}) {
    const classification = this.classifyCommand(command);
    if (classification.requiresApproval && !options.approved) {
      throw new Error(`Command requires approval: ${classification.reason}`);
    }

    const [file, ...args] = this.splitCommand(command);
    return new Promise((resolve) => {
      execFile(file, args, {
        cwd: options.cwd,
        timeout: options.timeoutMs || 30000,
        windowsHide: true,
        shell: false,
      }, (error, stdout, stderr) => {
        resolve({
          command,
          classification,
          exitCode: error?.code || 0,
          stdout,
          stderr,
          ok: !error,
        });
      });
    });
  }

  splitCommand(command) {
    const parts = String(command || '').match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    return parts.map((part) => part.replace(/^"|"$/g, ''));
  }
}

module.exports = { TerminalAgentService };
