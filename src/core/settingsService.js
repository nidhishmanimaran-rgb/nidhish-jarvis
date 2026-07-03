class SettingsService {
  constructor(configurationService) {
    this.configurationService = configurationService;
  }

  get(key) {
    return this.configurationService.get(key);
  }

  set(key, value) {
    return this.configurationService.set(key, value);
  }

  getAll() {
    return this.configurationService.getAll();
  }
}

module.exports = { SettingsService };
