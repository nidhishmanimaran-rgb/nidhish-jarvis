class SecretService {
  constructor(secretStorage) {
    this.secretStorage = secretStorage;
  }

  keyForProvider(provider) {
    return `jarvis.provider.${provider}.apiKey`;
  }

  async storeApiKey(provider, value) {
    if (!provider || !value) {
      throw new Error('Provider and API key are required.');
    }
    await this.secretStorage.store(this.keyForProvider(provider), value);
  }

  async getApiKey(provider) {
    if (!provider) {
      return undefined;
    }
    return this.secretStorage.get(this.keyForProvider(provider));
  }

  async deleteApiKey(provider) {
    if (!provider) {
      return;
    }
    await this.secretStorage.delete(this.keyForProvider(provider));
  }
}

module.exports = { SecretService };
