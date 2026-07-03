class ErrorHandler {
  handle(error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    return {
      severity: 'error',
      message: normalized.message,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = { ErrorHandler };
