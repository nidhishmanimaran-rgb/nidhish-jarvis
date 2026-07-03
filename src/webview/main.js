/* global acquireVsCodeApi, document */

const vscode = acquireVsCodeApi();

const state = {
  messages: [],
};

function renderMessages() {
  const container = document.getElementById('messages');
  container.innerHTML = '';
  state.messages.forEach((message) => {
    const item = document.createElement('div');
    item.className = `message ${message.role}`;
    item.textContent = message.content;
    container.appendChild(item);
  });
}

function sendMessage() {
  const input = document.getElementById('input');
  const text = input.value.trim();
  if (!text) {
    return;
  }

  state.messages.push({ role: 'user', content: text });
  state.messages.push({ role: 'assistant', content: `Jarvis foundation response: ${text}` });
  input.value = '';
  renderMessages();
  vscode.postMessage({ type: 'message', value: text });
}

document.getElementById('send').addEventListener('click', sendMessage);
document.getElementById('input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    sendMessage();
  }
});

renderMessages();
