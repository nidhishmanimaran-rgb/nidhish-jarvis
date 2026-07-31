function tokenizeForEmbedding(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-z0-9_#.-]+/i)
    .filter((token) => token.length > 1);
}

function hashToken(token) {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalizeVector(vector) {
  const magnitude = Math.sqrt(vector.reduce((total, value) => total + value * value, 0)) || 1;
  return vector.map((value) => Number((value / magnitude).toFixed(6)));
}

function cosineSimilarity(a, b) {
  const length = Math.min(a?.length || 0, b?.length || 0);
  if (!length) {
    return 0;
  }

  let score = 0;
  for (let i = 0; i < length; i += 1) {
    score += a[i] * b[i];
  }
  return score;
}

class LocalHashEmbeddingProvider {
  constructor(options = {}) {
    this.dimensions = options.dimensions || 64;
  }

  get id() {
    return 'local-hash';
  }

  get available() {
    return true;
  }

  embed(text) {
    const vector = new Array(this.dimensions).fill(0);
    tokenizeForEmbedding(text).forEach((token) => {
      const hash = hashToken(token);
      const index = hash % this.dimensions;
      const sign = hash & 1 ? 1 : -1;
      vector[index] += sign * (1 + Math.min(token.length, 12) / 12);
    });
    return normalizeVector(vector);
  }
}

class NullEmbeddingProvider {
  get id() {
    return 'none';
  }

  get available() {
    return false;
  }

  embed() {
    return [];
  }
}

module.exports = {
  LocalHashEmbeddingProvider,
  NullEmbeddingProvider,
  cosineSimilarity,
};
