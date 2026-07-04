/* global acquireVsCodeApi, Blob, clearInterval, crypto, document, localStorage, navigator, requestAnimationFrame, setInterval, setTimeout, URL, window */

const vscode = typeof acquireVsCodeApi === 'function'
  ? acquireVsCodeApi()
  : { postMessage() {}, getState() { return {}; }, setState() {} };

const MODELS = [
  'qwen2.5-coder:3b',
  'qwen2.5-coder:latest',
  'llama3.2:3b',
  'mistral:7b',
  'deepseek-r1:8b',
];

const DEFAULT_MODEL = MODELS[0];
const HEAVY_MODELS = new Set(['qwen2.5-coder:latest', 'deepseek-r1:8b']);
const LOW_MEMORY_THRESHOLD_GB = 8;
const STORAGE_KEY = 'jarvis.assistant.webview';
const DEFAULT_SETTINGS = {
  theme: 'system',
  temperature: 0.7,
  maxTokens: 512,
  streaming: true,
  autoScroll: true,
  fontSize: 13,
};

const elements = {};
const messageNodes = new Map();

const restoredState = readStoredState();
const state = {
  messages: normalizeMessages(restoredState.messages),
  sessions: normalizeSessions(restoredState.sessions),
  savedChats: normalizeSessions(restoredState.savedChats),
  installedModels: Array.isArray(restoredState.installedModels) ? restoredState.installedModels : [],
  modelStatus: restoredState.modelStatus || 'loading',
  activeSection: restoredState.activeSection || 'history',
  sidebarCollapsed: Boolean(restoredState.sidebarCollapsed),
  model: MODELS.includes(restoredState.model) ? restoredState.model : DEFAULT_MODEL,
  settings: { ...DEFAULT_SETTINGS, ...(restoredState.settings || {}) },
  attachments: [],
  currentAssistantId: null,
  streamRenderScheduled: false,
  scrollScheduled: false,
  modelRefreshTimer: null,
  systemMemoryGb: detectSystemMemory(),
  lastModelWarning: '',
  lastOllamaNotice: '',
  working: false,
  voiceRecognition: null,
};

function readStoredState() {
  let local = {};
  try {
    local = typeof localStorage === 'undefined' ? {} : JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    local = {};
  }

  return { ...local, ...(vscode.getState?.() || {}) };
}

function persistState() {
  const snapshot = {
    messages: state.messages,
    sessions: state.sessions.slice(0, 30),
    savedChats: state.savedChats.slice(0, 30),
    installedModels: state.installedModels,
    modelStatus: state.modelStatus,
    activeSection: state.activeSection,
    sidebarCollapsed: state.sidebarCollapsed,
    model: state.model,
    settings: state.settings,
  };

  vscode.setState?.(snapshot);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    }
  } catch {
    // VS Code webview state is still updated when local storage is unavailable.
  }
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message) => message && typeof message.content === 'string')
    .map((message) => ({
      id: message.id || createId('msg'),
      role: message.role === 'user' ? 'user' : message.role === 'system' ? 'system' : 'assistant',
      content: message.content,
      createdAt: Number(message.createdAt) || Date.now(),
      pending: false,
      pinned: Boolean(message.pinned),
      feedback: message.feedback || null,
      error: Boolean(message.error),
    }));
}

function normalizeSessions(sessions) {
  if (!Array.isArray(sessions)) {
    return [];
  }

  return sessions
    .filter((session) => session && Array.isArray(session.messages))
    .map((session) => ({
      id: session.id || createId('session'),
      title: session.title || titleFromMessages(session.messages),
      preview: session.preview || previewFromMessages(session.messages),
      createdAt: Number(session.createdAt) || Date.now(),
      model: MODELS.includes(session.model) ? session.model : DEFAULT_MODEL,
      messages: normalizeMessages(session.messages),
      saved: Boolean(session.saved),
    }));
}

function createId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function detectSystemMemory() {
  const memory = Number(navigator?.deviceMemory);
  return Number.isFinite(memory) && memory > 0 ? memory : null;
}

function cacheElements() {
  [
    'app-shell',
    'attachment-tray',
    'attach-file',
    'conversation-search',
    'export-chat',
    'file-input',
    'font-size-value',
    'input',
    'messages',
    'model-alert',
    'model-alert-action',
    'model-alert-text',
    'model-select',
    'new-chat',
    'quick-add',
    'send',
    'session-list',
    'setting-auto-scroll',
    'setting-font-size',
    'setting-max-tokens',
    'setting-model',
    'setting-streaming',
    'setting-temperature',
    'setting-theme',
    'settings-close',
    'settings-panel',
    'settings-toggle',
    'sidebar',
    'sidebar-new-chat',
    'sidebar-toggle',
    'status',
    'temperature-value',
    'voice-input',
    'welcome-state',
  ].forEach((id) => {
    elements[toCamelCase(id)] = document.getElementById(id);
  });
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function bindEvents() {
  elements.newChat.addEventListener('click', startNewChat);
  elements.sidebarNewChat.addEventListener('click', startNewChat);
  elements.quickAdd.addEventListener('click', startNewChat);
  elements.exportChat.addEventListener('click', exportChat);
  elements.sidebarToggle.addEventListener('click', toggleSidebar);
  elements.settingsToggle.addEventListener('click', openSettings);
  elements.settingsClose.addEventListener('click', closeSettings);
  elements.send.addEventListener('click', () => sendCurrentMessage());
  elements.attachFile.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', handleFilesSelected);
  elements.voiceInput.addEventListener('click', startVoiceInput);
  elements.modelSelect.addEventListener('change', (event) => setModel(event.target.value));
  elements.modelAlertAction.addEventListener('click', startOllama);
  elements.settingModel.addEventListener('change', (event) => setModel(event.target.value));
  elements.conversationSearch.addEventListener('input', renderSidebar);

  elements.input.addEventListener('input', () => {
    autoResizeComposer();
    persistState();
  });

  elements.input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendCurrentMessage();
    }

    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      sendCurrentMessage();
    }
  });

  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('keydown', handleDocumentKeydown);

  [
    elements.settingTheme,
    elements.settingTemperature,
    elements.settingMaxTokens,
    elements.settingStreaming,
    elements.settingAutoScroll,
    elements.settingFontSize,
  ].forEach((control) => {
    control.addEventListener('input', handleSettingsChanged);
    control.addEventListener('change', handleSettingsChanged);
  });
}

function handleDocumentClick(event) {
  const target = event.target;
  const actionButton = target.closest?.('[data-action]');
  if (actionButton) {
    handleAction(actionButton);
    return;
  }

  const codeButton = target.closest?.('[data-code-action]');
  if (codeButton) {
    handleCodeAction(codeButton);
    return;
  }

  const example = target.closest?.('.example-prompt');
  if (example) {
    elements.input.value = example.textContent.trim();
    autoResizeComposer();
    elements.input.focus();
    return;
  }

  const tab = target.closest?.('.sidebar-tab');
  if (tab) {
    setActiveSection(tab.dataset.section);
    return;
  }

  const sessionItem = target.closest?.('.session-item');
  if (sessionItem) {
    loadSession(sessionItem.dataset.sessionId);
  }
}

function handleDocumentKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    elements.conversationSearch.focus();
  }

  if (event.key === 'Escape' && !elements.settingsPanel.hidden) {
    closeSettings();
  }
}

function setActiveSection(section) {
  state.activeSection = section || 'history';
  renderSidebar();
  persistState();
}

function setModel(model) {
  if (!MODELS.includes(model)) {
    showSystemMessage(`The model "${model}" is not in the supported Jarvis model list.`);
    return;
  }

  state.model = model;
  state.settings.preferredModel = model;
  elements.modelSelect.value = model;
  elements.settingModel.value = model;
  updateModelLabels();
  warnForLowMemoryModel(model);
  setStatus(`Using ${model}`);
  persistState();
}

function warnForLowMemoryModel(model) {
  if (!state.systemMemoryGb || state.systemMemoryGb >= LOW_MEMORY_THRESHOLD_GB || !HEAVY_MODELS.has(model)) {
    return;
  }

  const warning = `${model}:${state.systemMemoryGb}`;
  if (state.lastModelWarning === warning) {
    return;
  }

  state.lastModelWarning = warning;
  showSystemMessage(`This model may be slow on your hardware. For ${state.systemMemoryGb}GB RAM, qwen2.5-coder:3b is recommended.`);
}

function handleSettingsChanged() {
  const selectedModel = elements.settingModel.value;
  state.settings.theme = elements.settingTheme.value;
  state.settings.temperature = Number(elements.settingTemperature.value);
  state.settings.maxTokens = clamp(Number(elements.settingMaxTokens.value), 1, 8192);
  state.settings.streaming = elements.settingStreaming.checked;
  state.settings.autoScroll = elements.settingAutoScroll.checked;
  state.settings.fontSize = clamp(Number(elements.settingFontSize.value), 12, 18);
  if (selectedModel !== state.model) {
    setModel(selectedModel);
  }
  applySettingsToUi();
  persistState();
}

function applySettingsToUi() {
  elements.modelSelect.value = state.model;
  elements.settingModel.value = state.model;
  elements.settingTheme.value = state.settings.theme || DEFAULT_SETTINGS.theme;
  elements.settingTemperature.value = String(state.settings.temperature ?? DEFAULT_SETTINGS.temperature);
  elements.temperatureValue.textContent = String(state.settings.temperature ?? DEFAULT_SETTINGS.temperature);
  elements.settingMaxTokens.value = String(state.settings.maxTokens ?? DEFAULT_SETTINGS.maxTokens);
  elements.settingStreaming.checked = Boolean(state.settings.streaming);
  elements.settingAutoScroll.checked = Boolean(state.settings.autoScroll);
  elements.settingFontSize.value = String(state.settings.fontSize ?? DEFAULT_SETTINGS.fontSize);
  elements.fontSizeValue.textContent = `${state.settings.fontSize ?? DEFAULT_SETTINGS.fontSize}px`;
  document.documentElement.style.setProperty('--jarvis-font-size', `${state.settings.fontSize ?? DEFAULT_SETTINGS.fontSize}px`);
  document.documentElement.dataset.theme = state.settings.theme || DEFAULT_SETTINGS.theme;
  elements.appShell.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
  updateModelLabels();
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

function openSettings() {
  elements.settingsPanel.hidden = false;
  elements.settingsToggle.setAttribute('aria-expanded', 'true');
  elements.settingTemperature.focus();
}

function closeSettings() {
  elements.settingsPanel.hidden = true;
  elements.settingsToggle.setAttribute('aria-expanded', 'false');
  elements.settingsToggle.focus();
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  elements.appShell.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
  persistState();
}

function startNewChat() {
  archiveCurrentChat(false);
  state.messages = [];
  state.currentAssistantId = null;
  state.working = false;
  state.attachments = [];
  elements.input.value = '';
  setStatus('Ready');
  renderAll(true);
  persistState();
}

function archiveCurrentChat(saved) {
  if (!state.messages.length) {
    return;
  }

  const session = createSessionSnapshot(saved);
  const target = saved ? state.savedChats : state.sessions;
  target.unshift(session);
  target.splice(30);
}

function createSessionSnapshot(saved) {
  const messages = state.messages.map((message) => ({ ...message, pending: false }));
  return {
    id: createId('session'),
    title: titleFromMessages(messages),
    preview: previewFromMessages(messages),
    createdAt: Date.now(),
    model: state.model,
    messages,
    saved,
  };
}

function titleFromMessages(messages) {
  const firstUser = messages.find((message) => message.role === 'user' && message.content.trim());
  return truncate(firstUser?.content || 'Untitled chat', 48);
}

function previewFromMessages(messages) {
  const firstAssistant = messages.find((message) => message.role === 'assistant' && message.content.trim());
  return truncate(firstAssistant?.content || messages[0]?.content || 'No messages yet', 80);
}

function loadSession(sessionId) {
  const session = [...state.sessions, ...state.savedChats].find((item) => item.id === sessionId);
  if (!session) {
    return;
  }

  archiveCurrentChat(false);
  state.messages = normalizeMessages(session.messages);
  state.model = MODELS.includes(session.model) ? session.model : state.model;
  state.working = false;
  state.currentAssistantId = null;
  state.attachments = [];
  renderAll(true);
  persistState();
}

function sendCurrentMessage() {
  if (state.working) {
    stopGeneration();
    return;
  }

  const text = elements.input.value.trim();
  if (!text) {
    return;
  }

  elements.input.value = '';
  autoResizeComposer();
  sendPrompt(text, { includeUserMessage: true });
}

function sendPrompt(text, options = {}) {
  if (!text || state.working) {
    return;
  }

  const includeUserMessage = options.includeUserMessage !== false;
  const prompt = createPromptWithAttachments(text);
  state.working = true;
  setStatus('Thinking', true);

  if (includeUserMessage) {
    state.messages.push(createMessage('user', prompt));
  }

  const assistantMessage = createMessage('assistant', '', { pending: true });
  state.currentAssistantId = assistantMessage.id;
  state.messages.push(assistantMessage);
  state.attachments = [];

  renderAttachmentTray();
  renderAll(true);
  updateControls();
  postAssistantRequest(prompt);
  persistState();
}

function postAssistantRequest(text) {
  vscode.postMessage({
    type: 'assistant:ask',
    value: text,
    model: state.model,
    config: {
      model: state.model,
      temperature: state.settings.temperature,
      maxTokens: state.settings.maxTokens,
      streaming: state.settings.streaming,
    },
  });
}

function requestModelStatus() {
  state.modelStatus = state.modelStatus || 'loading';
  updateModelLabels();
  vscode.postMessage({ type: 'assistant:models' });
}

function startOllama() {
  setStatus('Starting Ollama', true);
  vscode.postMessage({ type: 'assistant:startOllama' });
}

function stopGeneration() {
  vscode.postMessage({ type: 'assistant:stop' });
  setStatus('Stopping', true);
}

function createPromptWithAttachments(text) {
  if (!state.attachments.length) {
    return text;
  }

  const names = state.attachments.map((file) => `- ${file.name} (${formatBytes(file.size)})`).join('\n');
  return `${text}\n\nAttached files:\n${names}`;
}

function createMessage(role, content, overrides = {}) {
  return {
    id: createId('msg'),
    role,
    content,
    createdAt: Date.now(),
    pending: false,
    pinned: false,
    feedback: null,
    error: false,
    ...overrides,
  };
}

function setStatus(text, thinking = false) {
  elements.status.textContent = text;
  elements.status.classList.toggle('is-thinking', thinking);
}

function updateControls() {
  elements.send.disabled = false;
  elements.send.textContent = state.working ? 'Stop' : 'Send';
}

function renderAll(forceMessages = false) {
  applySettingsToUi();
  renderWelcome();
  renderMessages(forceMessages);
  renderSidebar();
  renderAttachmentTray();
  updateControls();
  scrollToBottom(forceMessages);
}

function renderWelcome() {
  elements.welcomeState.classList.toggle('is-hidden', state.messages.length > 0);
}

function renderMessages(force = false) {
  if (force) {
    elements.messages.innerHTML = '';
    messageNodes.clear();
  }

  const activeIds = new Set(state.messages.map((message) => message.id));
  messageNodes.forEach((node, id) => {
    if (!activeIds.has(id)) {
      node.remove();
      messageNodes.delete(id);
    }
  });

  state.messages.forEach((message) => {
    let node = messageNodes.get(message.id);
    if (!node) {
      node = createMessageNode(message);
      messageNodes.set(message.id, node);
    }

    updateMessageNode(node, message);
    elements.messages.appendChild(node);
  });
}

function createMessageNode(message) {
  const node = document.createElement('article');
  node.className = `message-row ${message.role}`;
  node.dataset.messageId = message.id;
  node.innerHTML = [
    '<div class="message-meta">',
    '  <span class="message-author"></span>',
    '  <time class="message-time"></time>',
    '  <div class="message-toolbar" aria-label="Message actions">',
    '    <button class="message-action" type="button" data-action="copy">Copy</button>',
    '    <button class="message-action" type="button" data-action="edit">Edit</button>',
    '    <button class="message-action" type="button" data-action="retry">Retry</button>',
    '    <button class="message-action" type="button" data-action="delete">Delete</button>',
    '    <button class="message-action" type="button" data-action="pin">Pin</button>',
    '  </div>',
    '</div>',
    '<div class="message-bubble">',
    '  <div class="markdown-body"></div>',
    '  <div class="message-footer"></div>',
    '</div>',
  ].join('');
  return node;
}

function updateMessageNode(node, message) {
  node.className = `message-row ${message.role}${message.pending ? ' is-streaming' : ''}${message.pinned ? ' is-pinned' : ''}${message.error ? ' is-error' : ''}`;
  node.querySelector('.message-author').textContent = authorForRole(message.role);
  node.querySelector('.message-time').textContent = formatTime(message.createdAt);
  node.querySelector('[data-action="pin"]').classList.toggle('is-active', message.pinned);
  node.querySelector('[data-action="pin"]').textContent = message.pinned ? 'Pinned' : 'Pin';

  const body = node.querySelector('.markdown-body');
  if (message.pending && !message.content) {
    body.innerHTML = '<span class="thinking">Thinking<span></span><span></span><span></span></span>';
  } else if (message.pending) {
    body.textContent = message.content;
  } else {
    body.innerHTML = renderMarkdown(message.content);
    highlightCodeBlocks(body);
  }

  const footer = node.querySelector('.message-footer');
  footer.innerHTML = '';
  if (message.role === 'assistant' && !message.pending) {
    footer.innerHTML = [
      '<button class="message-action" type="button" data-action="regenerate">Regenerate</button>',
      `<button class="message-action${message.feedback === 'like' ? ' is-active' : ''}" type="button" data-action="like">Like</button>`,
      `<button class="message-action${message.feedback === 'dislike' ? ' is-active' : ''}" type="button" data-action="dislike">Dislike</button>`,
    ].join('');
  }
}

function authorForRole(role) {
  if (role === 'user') {
    return 'You';
  }

  if (role === 'system') {
    return 'Jarvis Notice';
  }

  return 'Jarvis';
}

function renderSidebar() {
  document.querySelectorAll('.sidebar-tab').forEach((tab) => {
    tab.classList.toggle('is-active', tab.dataset.section === state.activeSection);
  });

  const query = elements.conversationSearch.value.trim().toLowerCase();
  const sessions = sessionsForActiveSection().filter((session) => {
    if (!query) {
      return true;
    }

    return `${session.title} ${session.preview} ${session.model}`.toLowerCase().includes(query);
  });

  if (!sessions.length) {
    elements.sessionList.innerHTML = `<div class="session-empty">${emptyTextForSection()}</div>`;
    return;
  }

  elements.sessionList.innerHTML = sessions.map((session) => `
    <button class="session-item" type="button" data-session-id="${escapeAttribute(session.id)}">
      <div class="session-title">${escapeHtml(session.title)}</div>
      <div class="session-meta">${escapeHtml(session.model)} - ${formatTime(session.createdAt)}</div>
      <div class="session-meta">${escapeHtml(session.preview)}</div>
    </button>
  `).join('');
}

function sessionsForActiveSection() {
  if (state.activeSection === 'saved') {
    return state.savedChats;
  }

  if (state.activeSection === 'recent') {
    return state.sessions.slice(0, 10);
  }

  return state.sessions;
}

function emptyTextForSection() {
  if (state.activeSection === 'saved') {
    return 'Pin a useful message to save this chat here.';
  }

  if (state.activeSection === 'recent') {
    return 'Recent sessions will appear after you start a new chat.';
  }

  return 'Conversation history will appear after you start a new chat.';
}

function renderAttachmentTray() {
  if (!state.attachments.length) {
    elements.attachmentTray.hidden = true;
    elements.attachmentTray.innerHTML = '';
    return;
  }

  elements.attachmentTray.hidden = false;
  elements.attachmentTray.innerHTML = state.attachments.map((file) => `
    <span class="attachment-chip" data-attachment-id="${escapeAttribute(file.id)}">
      <span title="${escapeAttribute(file.name)}">${escapeHtml(file.name)}</span>
      <button type="button" data-action="remove-attachment" aria-label="Remove ${escapeAttribute(file.name)}">x</button>
    </span>
  `).join('');
}

function handleAction(button) {
  const row = button.closest('.message-row');
  const messageId = row?.dataset.messageId;
  const action = button.dataset.action;

  if (action === 'remove-attachment') {
    const chip = button.closest('.attachment-chip');
    removeAttachment(chip?.dataset.attachmentId);
    return;
  }

  if (!messageId) {
    return;
  }

  const message = state.messages.find((item) => item.id === messageId);
  if (!message) {
    return;
  }

  if (action === 'copy') {
    copyText(message.content);
    setStatus('Message copied');
  } else if (action === 'edit') {
    elements.input.value = message.content;
    autoResizeComposer();
    elements.input.focus();
    setStatus('Message loaded for editing');
  } else if (action === 'retry' || action === 'regenerate') {
    retryMessage(messageId);
  } else if (action === 'delete') {
    deleteMessage(messageId);
  } else if (action === 'pin') {
    togglePin(messageId);
  } else if (action === 'like' || action === 'dislike') {
    message.feedback = message.feedback === action ? null : action;
    updateMessage(messageId);
    persistState();
  }
}

function retryMessage(messageId) {
  if (state.working) {
    setStatus('Jarvis is still responding', true);
    return;
  }

  const index = state.messages.findIndex((message) => message.id === messageId);
  const prompt = findPromptForIndex(index);
  if (!prompt) {
    setStatus('No prompt found to retry');
    return;
  }

  if (state.messages[index]?.role === 'assistant') {
    state.messages.splice(index, 1);
  }

  sendPrompt(prompt, { includeUserMessage: false });
}

function findPromptForIndex(index) {
  if (index < 0) {
    return '';
  }

  if (state.messages[index]?.role === 'user') {
    return state.messages[index].content;
  }

  for (let i = index - 1; i >= 0; i--) {
    if (state.messages[i].role === 'user') {
      return state.messages[i].content;
    }
  }

  return '';
}

function deleteMessage(messageId) {
  const index = state.messages.findIndex((message) => message.id === messageId);
  if (index >= 0) {
    state.messages.splice(index, 1);
    renderAll(true);
    persistState();
  }
}

function togglePin(messageId) {
  const message = state.messages.find((item) => item.id === messageId);
  if (!message) {
    return;
  }

  message.pinned = !message.pinned;
  if (message.pinned) {
    const snapshot = createSessionSnapshot(true);
    state.savedChats = [snapshot, ...state.savedChats.filter((session) => session.title !== snapshot.title)].slice(0, 30);
  }

  updateMessage(messageId);
  renderSidebar();
  persistState();
}

function updateMessage(messageId) {
  const message = state.messages.find((item) => item.id === messageId);
  const node = messageNodes.get(messageId);
  if (message && node) {
    updateMessageNode(node, message);
  }
}

function handleCodeAction(button) {
  const block = button.closest('.code-block');
  if (!block) {
    return;
  }

  const code = block.querySelector('code')?.textContent || '';
  const language = block.dataset.language || 'text';
  const action = button.dataset.codeAction;

  if (action === 'copy-code') {
    copyText(code);
    setStatus('Code copied');
  } else if (action === 'download-code') {
    downloadText(`jarvis-snippet.${extensionForLanguage(language)}`, code, 'text/plain');
  } else if (action === 'toggle-code') {
    block.classList.toggle('is-collapsed');
    button.textContent = block.classList.contains('is-collapsed') ? 'Expand' : 'Collapse';
  }
}

function handleFilesSelected() {
  const files = Array.from(elements.fileInput.files || []);
  state.attachments = files.map((file) => ({
    id: createId('file'),
    name: file.name,
    size: file.size,
  }));
  elements.fileInput.value = '';
  renderAttachmentTray();
  persistState();
}

function removeAttachment(id) {
  state.attachments = state.attachments.filter((file) => file.id !== id);
  renderAttachmentTray();
}

function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setStatus('Voice input is not available in this webview.');
    return;
  }

  if (state.voiceRecognition) {
    state.voiceRecognition.stop();
    state.voiceRecognition = null;
    setStatus('Voice stopped');
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.onstart = () => setStatus('Listening', true);
  recognition.onerror = () => setStatus('Voice input failed');
  recognition.onend = () => {
    state.voiceRecognition = null;
    setStatus(state.working ? 'Thinking' : 'Ready', state.working);
  };
  recognition.onresult = (event) => {
    const transcript = Array.from(event.results)
      .map((result) => result[0]?.transcript || '')
      .join(' ')
      .trim();
    if (transcript) {
      elements.input.value = transcript;
      autoResizeComposer();
    }
  };

  state.voiceRecognition = recognition;
  recognition.start();
}

function exportChat() {
  const payload = {
    exportedAt: new Date().toISOString(),
    model: state.model,
    settings: state.settings,
    messages: state.messages,
  };
  downloadText('jarvis-chat.json', JSON.stringify(payload, null, 2), 'application/json');
  setStatus('Chat exported');
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

function showSystemMessage(content) {
  state.messages.push(createMessage('system', content));
  renderAll(true);
  persistState();
}

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || !msg.type) {
    return;
  }

  if (msg.type === 'assistant:chunk') {
    appendAssistantChunk(msg.value || '');
    return;
  }

  if (msg.type === 'assistant:done') {
    finishAssistantResponse();
    return;
  }

  if (msg.type === 'assistant:error') {
    failAssistantResponse(msg.value || 'Unknown error');
    return;
  }

  if (msg.type === 'assistant:models') {
    updateModelStatus(msg);
    return;
  }

  if (msg.type === 'assistant:ollamaStarted') {
    setStatus(msg.ok ? 'Ollama starting' : 'Could not start Ollama', !msg.ok);
    setTimeout(requestModelStatus, msg.ok ? 2000 : 0);
  }
});

function updateModelStatus(message) {
  state.installedModels = Array.isArray(message.models) ? message.models : [];
  state.modelStatus = message.status || 'offline';
  updateModelLabels();

  if (state.modelStatus === 'offline') {
    showModelAlert('Ollama is not running.', true);
    showOllamaNotice('Ollama is not running. Start Ollama, then refresh the model list.');
  } else if (state.modelStatus === 'empty') {
    showModelAlert('No Ollama models installed.\n\nInstall one with:\nollama pull qwen2.5-coder:3b', false);
    showOllamaNotice('No Ollama models installed.\n\nInstall one with:\nollama pull qwen2.5-coder:3b');
  } else if (!state.installedModels.includes(state.model)) {
    showModelAlert(`${state.model} is not installed.\n\nInstall it with:\nollama pull ${state.model}`, false);
    showOllamaNotice(`${state.model} is not installed.\n\nInstall it with:\nollama pull ${state.model}`);
  } else if (!state.working) {
    hideModelAlert();
    setStatus(`Ready - ${state.model}`);
  }

  persistState();
}

function showModelAlert(message, showStartButton) {
  elements.modelAlert.hidden = false;
  elements.modelAlertText.textContent = message;
  elements.modelAlertAction.hidden = !showStartButton;
}

function hideModelAlert() {
  elements.modelAlert.hidden = true;
  elements.modelAlertText.textContent = '';
}

function showOllamaNotice(message) {
  if (state.lastOllamaNotice === message) {
    return;
  }

  state.lastOllamaNotice = message;
  showSystemMessage(message);
}

function updateModelLabels() {
  const selects = [elements.modelSelect, elements.settingModel].filter(Boolean);
  selects.forEach((select) => {
    Array.from(select.options).forEach((option) => {
      const status = modelStatusLabel(option.value);
      option.textContent = `${option.value} - ${status}`;
    });
  });
}

function modelStatusLabel(model) {
  if (state.modelStatus === 'loading') {
    return 'Loading';
  }

  if (state.modelStatus === 'offline') {
    return 'Ollama off';
  }

  if (state.modelStatus === 'empty') {
    return 'Not Installed';
  }

  return state.installedModels.includes(model) ? 'Ready' : 'Not Installed';
}

function appendAssistantChunk(chunk) {
  const message = state.messages.find((item) => item.id === state.currentAssistantId);
  if (!message) {
    return;
  }

  message.content += chunk;
  message.pending = true;
  scheduleStreamRender(message.id);
}

function scheduleStreamRender(messageId) {
  if (state.streamRenderScheduled) {
    return;
  }

  state.streamRenderScheduled = true;
  requestAnimationFrame(() => {
    state.streamRenderScheduled = false;
    updateMessage(messageId);
    scrollToBottom();
  });
}

function finishAssistantResponse() {
  const message = state.messages.find((item) => item.id === state.currentAssistantId);
  if (message) {
    message.pending = false;
    if (!message.content.trim()) {
      message.content = 'Jarvis finished without returning visible text.';
    }
    updateMessage(message.id);
  }

  state.working = false;
  state.currentAssistantId = null;
  setStatus('Ready');
  updateControls();
  renderSidebar();
  persistState();
  scrollToBottom();
}

function failAssistantResponse(error) {
  const message = state.messages.find((item) => item.id === state.currentAssistantId);
  const friendly = friendlyError(error);

  if (message) {
    message.pending = false;
    message.error = true;
    message.content = friendly;
    updateMessage(message.id);
  } else {
    state.messages.push(createMessage('assistant', friendly, { error: true }));
    renderMessages(true);
  }

  state.working = false;
  state.currentAssistantId = null;
  setStatus('Error');
  updateControls();
  persistState();
}

function friendlyError(error) {
  const detail = String(error);
  if (/model|not found|pull|unavailable/i.test(detail)) {
    return `I could not use ${state.model}. Make sure the model is installed in Ollama, then try again.\n\n${detail}`;
  }

  return `Something went wrong while Jarvis was responding.\n\n${detail}`;
}

function autoResizeComposer() {
  elements.input.style.height = 'auto';
  elements.input.style.height = `${Math.min(elements.input.scrollHeight, 160)}px`;
}

function scrollToBottom(force = false) {
  if (!state.settings.autoScroll || (!force && !isNearBottom())) {
    return;
  }

  if (state.scrollScheduled) {
    return;
  }

  state.scrollScheduled = true;
  requestAnimationFrame(() => {
    state.scrollScheduled = false;
    elements.messages.scrollTop = elements.messages.scrollHeight;
  });
}

function isNearBottom() {
  const distance = elements.messages.scrollHeight - elements.messages.scrollTop - elements.messages.clientHeight;
  return distance < 120;
}

function renderMarkdown(markdown) {
  if (!markdown) {
    return '';
  }

  const source = markdown.replace(/\r\n/g, '\n');
  const fence = /```([a-zA-Z0-9_#+.-]*)[ \t]*\n([\s\S]*?)```/g;
  let html = '';
  let lastIndex = 0;
  let match = fence.exec(source);

  while (match) {
    html += renderMarkdownSegment(source.slice(lastIndex, match.index));
    html += renderCodeBlock(match[2], match[1] || 'text');
    lastIndex = match.index + match[0].length;
    match = fence.exec(source);
  }

  html += renderMarkdownSegment(source.slice(lastIndex));
  return html;
}

function renderMarkdownSegment(segment) {
  const lines = segment.split('\n');
  let html = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (isTableStart(lines, i)) {
      const table = collectTable(lines, i);
      html += renderTable(table.rows);
      i = table.nextIndex;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      const level = heading[1].length;
      html += `<h${level}>${renderInline(heading[2])}</h${level}>`;
      i += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      html += `<blockquote>${renderInline(quoteLines.join('\n')).replace(/\n/g, '<br>')}</blockquote>`;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i += 1;
      }
      html += `<ul>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ul>`;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      html += `<ol>${items.map((item) => `<li>${renderInline(item)}</li>`).join('')}</ol>`;
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines, i)) {
      paragraph.push(lines[i]);
      i += 1;
    }
    html += `<p>${renderInline(paragraph.join('\n')).replace(/\n/g, '<br>')}</p>`;
  }

  return html;
}

function isBlockStart(lines, index) {
  const trimmed = lines[index].trim();
  return /^(#{1,3})\s+/.test(trimmed)
    || trimmed.startsWith('>')
    || /^[-*]\s+/.test(trimmed)
    || /^\d+\.\s+/.test(trimmed)
    || isTableStart(lines, index);
}

function isTableStart(lines, index) {
  return index + 1 < lines.length
    && lines[index].includes('|')
    && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1]);
}

function collectTable(lines, start) {
  const rows = [lines[start]];
  let index = start + 2;
  while (index < lines.length && lines[index].includes('|') && lines[index].trim()) {
    rows.push(lines[index]);
    index += 1;
  }

  return { rows, nextIndex: index };
}

function renderTable(rows) {
  const parsed = rows.map(splitTableRow);
  const header = parsed[0] || [];
  const body = parsed.slice(1);
  return [
    '<table>',
    `<thead><tr>${header.map((cell) => `<th>${renderInline(cell)}</th>`).join('')}</tr></thead>`,
    `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`,
    '</table>',
  ].join('');
}

function splitTableRow(row) {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function renderInline(text) {
  let output = escapeHtml(text);

  output = output.replace(/!\[([^\]]*)]\(([^)\s]+)\)/g, (_, alt, url) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) {
      return escapeHtml(alt);
    }
    return `<img src="${escapeAttribute(safeUrl)}" alt="${escapeAttribute(alt)}" loading="lazy" />`;
  });

  output = output.replace(/\[([^\]]+)]\(([^)\s]+)\)/g, (_, label, url) => {
    const safeUrl = sanitizeUrl(url);
    if (!safeUrl) {
      return escapeHtml(label);
    }
    return `<a href="${escapeAttribute(safeUrl)}" title="${escapeAttribute(safeUrl)}">${label}</a>`;
  });

  output = output.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
  output = output.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  output = output.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return output;
}

function renderCodeBlock(code, language) {
  const safeLanguage = language || 'text';
  return [
    `<div class="code-block" data-language="${escapeAttribute(safeLanguage)}">`,
    '  <div class="code-header">',
    `    <span class="code-language">${escapeHtml(safeLanguage)}</span>`,
    '    <div class="code-actions">',
    '      <button type="button" data-code-action="copy-code">Copy</button>',
    '      <button type="button" data-code-action="download-code">Download</button>',
    '      <button type="button" data-code-action="toggle-code">Collapse</button>',
    '    </div>',
    '  </div>',
    `  <pre><code>${highlightCode(code, safeLanguage)}</code></pre>`,
    '</div>',
  ].join('');
}

function highlightCodeBlocks(container) {
  container.querySelectorAll('.code-block code').forEach((codeNode) => {
    const block = codeNode.closest('.code-block');
    codeNode.innerHTML = highlightCode(codeNode.textContent || '', block?.dataset.language || 'text');
  });
}

function highlightCode(code, language) {
  const keywords = keywordsForLanguage(language);
  const tokenPattern = /(\/\/[^\n]*|#[^\n]*|--[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*(?=\s*\()|\b[A-Za-z_$][\w$]*\b)/g;
  let html = '';
  let lastIndex = 0;
  let match = tokenPattern.exec(code);

  while (match) {
    const token = match[0];
    html += escapeHtml(code.slice(lastIndex, match.index));
    html += `<span class="token ${classForToken(token, keywords)}">${escapeHtml(token)}</span>`;
    lastIndex = match.index + token.length;
    match = tokenPattern.exec(code);
  }

  html += escapeHtml(code.slice(lastIndex));
  return html;
}

function keywordsForLanguage(language) {
  const common = ['async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'else', 'export', 'extends', 'finally', 'for', 'from', 'function', 'if', 'import', 'let', 'new', 'return', 'switch', 'throw', 'try', 'var', 'while'];
  const byLanguage = {
    csharp: ['abstract', 'as', 'base', 'bool', 'decimal', 'double', 'false', 'int', 'interface', 'namespace', 'null', 'private', 'protected', 'public', 'readonly', 'record', 'sealed', 'static', 'string', 'true', 'using', 'void'],
    cs: ['abstract', 'as', 'base', 'bool', 'decimal', 'double', 'false', 'int', 'interface', 'namespace', 'null', 'private', 'protected', 'public', 'readonly', 'record', 'sealed', 'static', 'string', 'true', 'using', 'void'],
    dart: ['class', 'final', 'Future', 'import', 'late', 'required', 'return', 'StatelessWidget', 'Widget'],
    py: ['and', 'def', 'elif', 'False', 'for', 'from', 'import', 'in', 'is', 'None', 'not', 'or', 'pass', 'True', 'with'],
    python: ['and', 'def', 'elif', 'False', 'for', 'from', 'import', 'in', 'is', 'None', 'not', 'or', 'pass', 'True', 'with'],
    sql: ['and', 'as', 'by', 'create', 'delete', 'from', 'group', 'insert', 'into', 'join', 'left', 'not', 'null', 'on', 'or', 'order', 'select', 'table', 'update', 'values', 'where'],
  };
  return new Set([...(byLanguage[language.toLowerCase()] || common), ...common]);
}

function classForToken(token, keywords) {
  if (/^(\/\/|#|--)/.test(token)) {
    return 'comment';
  }

  if (/^["'`]/.test(token)) {
    return 'string';
  }

  if (/^\d/.test(token)) {
    return 'number';
  }

  if (keywords.has(token)) {
    return 'keyword';
  }

  return 'function';
}

function sanitizeUrl(url) {
  const value = url.replace(/&amp;/g, '&').trim();
  if (/^(https?:|mailto:)/i.test(value)) {
    return value;
  }

  return '';
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function formatTime(value) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function truncate(value, length) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= length) {
    return text;
  }

  return `${text.slice(0, length - 1)}...`;
}

function formatBytes(bytes) {
  if (!bytes) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function extensionForLanguage(language) {
  const map = {
    csharp: 'cs',
    cs: 'cs',
    css: 'css',
    dart: 'dart',
    html: 'html',
    js: 'js',
    javascript: 'js',
    json: 'json',
    md: 'md',
    py: 'py',
    python: 'py',
    sql: 'sql',
    ts: 'ts',
    typescript: 'ts',
  };
  return map[language.toLowerCase()] || 'txt';
}

function init() {
  cacheElements();
  bindEvents();
  applySettingsToUi();
  renderAll(true);
  autoResizeComposer();
  setStatus('Ready');
  requestModelStatus();
  state.modelRefreshTimer = setInterval(requestModelStatus, 60000);
  window.addEventListener('beforeunload', () => {
    clearInterval(state.modelRefreshTimer);
  });
}

init();
