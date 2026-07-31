const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);

class AttachmentService {
  constructor(options = {}) {
    this.path = options.path || require('path');
  }

  classify(fileName, mimeType = '') {
    const ext = this.path.extname(fileName || '').toLowerCase();
    const isImage = IMAGE_EXTENSIONS.has(ext) || String(mimeType).startsWith('image/');
    return {
      kind: isImage ? 'image' : 'file',
      visionRequired: isImage,
      supported: true,
      reason: isImage ? 'Image attachment can be used with vision-capable models.' : 'File attachment metadata is supported.',
    };
  }

  validateForProvider(attachment, capabilities = {}) {
    const classification = this.classify(attachment.name, attachment.type);
    if (classification.visionRequired && !capabilities.vision) {
      return { ok: false, reason: 'Selected provider/model does not advertise vision support.' };
    }
    return { ok: true, classification };
  }
}

class VoiceService {
  getCapabilities(runtime = {}) {
    return {
      speechToText: Boolean(runtime.SpeechRecognition || runtime.webkitSpeechRecognition),
      textToSpeech: Boolean(runtime.speechSynthesis),
      optional: true,
    };
  }
}

module.exports = { AttachmentService, VoiceService };
