const baseUrl = 'http://127.0.0.1:11434';

async function main() {
  try {
    const payload = {
      model: 'qwen2.5-coder:3b',
      messages: [{ role: 'user', content: 'Hello Jarvis' }],
      temperature: 0.7,
      max_tokens: 1024,
      stream: true,
    };
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    console.log('CHAT status', response.status);
    if (!response.body) {
      const text = await response.text();
      console.log('BODY text', text);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      buf += chunk;
      process.stdout.write(chunk);
    }
    console.log('\n--- full buffer ---');
    console.log(buf);
  } catch (err) {
    console.error('CHAT ERROR', err);
  }
}

main();
