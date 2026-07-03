class Logger {
  info(message, detail) {
    console.log(`[Jarvis] ${message}`, detail || '');
  }

  error(message, error) {
    console.error(`[Jarvis] ${message}`, error || '');
  }
}

module.exports = { Logger };
