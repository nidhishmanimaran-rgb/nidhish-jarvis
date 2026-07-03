class ErrorHandler {
  constructor(loggingService, notificationService) {
    this.loggingService = loggingService;
    this.notificationService = notificationService;
  }

  handle(error, context = {}) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    const entry = {
      timestamp: new Date().toISOString(),
      message: normalized.message,
      stack: normalized.stack,
      context,
    };
    this.loggingService?.error('Unhandled error', entry);
    this.notificationService?.error('An error occurred. Check the logs for details.');
    return entry;
  }
}

module.exports = { ErrorHandler };
