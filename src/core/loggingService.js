class LoggingService {
  constructor() {
    this.levels = ['debug', 'info', 'warn', 'error'];
  }

  log(level, message, details) {
    if (!this.levels.includes(level)) {
      level = 'info';
    }
    const entry = { timestamp: new Date().toISOString(), level, message, details };
    console[level](`[Jarvis] ${message}`, details || '');
    return entry;
  }

  debug(message, details) {
    return this.log('debug', message, details);
  }

  info(message, details) {
    return this.log('info', message, details);
  }

  warn(message, details) {
    return this.log('warn', message, details);
  }

  error(message, details) {
    return this.log('error', message, details);
  }
}

module.exports = { LoggingService };
