class NotificationService {
  info(message) {
    console.info(`[Jarvis] INFO: ${message}`);
  }

  warn(message) {
    console.warn(`[Jarvis] WARN: ${message}`);
  }

  error(message) {
    console.error(`[Jarvis] ERROR: ${message}`);
  }
}

module.exports = { NotificationService };
