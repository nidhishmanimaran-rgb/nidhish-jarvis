const baseUrl = 'http://127.0.0.1:11434';

async function main() {
  try {
    const payload = {
      model: 'qwen2.5-coder:3b',
      messages: [{ role: 'user', content: 'Hello Jarvis' }],
      temperature: 0.7,
      max_tokens: 1024,
      stream: false,
    };
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    console.log('CHAT status', response.status);
    const body = await response.text();
    console.log('CHAT body', body);
  } catch (err) {
    console.error('CHAT ERROR', err);
  }
}

main();
