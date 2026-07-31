const assert = require('assert');
const { AttachmentService, VoiceService } = require('../src/media/attachmentService');

suite('Media attachment services', () => {
  test('classifies image attachments and gates them on vision capability', () => {
    const service = new AttachmentService();
    assert.strictEqual(service.classify('screen.png').kind, 'image');
    assert.strictEqual(service.validateForProvider({ name: 'screen.png' }, { vision: false }).ok, false);
    assert.strictEqual(service.validateForProvider({ name: 'screen.png' }, { vision: true }).ok, true);
  });

  test('reports optional voice runtime capabilities', () => {
    const service = new VoiceService();
    const caps = service.getCapabilities({ SpeechRecognition: function SpeechRecognition() {}, speechSynthesis: {} });
    assert.strictEqual(caps.speechToText, true);
    assert.strictEqual(caps.textToSpeech, true);
    assert.strictEqual(caps.optional, true);
  });
});
