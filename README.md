# Nidhish's Jarvis

Jarvis is a modular AI productivity platform for VS Code. It starts as a capable assistant shell with conversation memory, planning support, writing help, coding assistance, and a plugin architecture ready for future providers and tools.

## Highlights

- Multi-turn conversation support with persistent history
- Plugin-based routing for general assistance, reasoning, writing, and coding
- Dedicated Jarvis Activity Bar container with Chat, Workspace, Search, Files, Memory, Agents, Git, Terminal, Models, and Settings views
- Workspace-aware greetings and extensible runtime configuration
- Workspace intelligence for indexing projects, detecting languages/frameworks, parsing symbols/imports, and summarizing architecture
- Commands for opening the assistant, exporting history, checking status, indexing, searching, symbol lookup, safe edits, debugging, terminal assistance, Git assistance, memory, providers, and agents
- Status bar entry for opening Jarvis and seeing Ready/Indexing/Error state
- Nonce-based webview Content Security Policy and sanitized markdown rendering
- Safe Edit proposals with per-file diff preview and explicit approval before workspace modification
- Multi-provider support with SecretStorage-backed API keys

## Activity Bar

Jarvis contributes a permanent Activity Bar container. Select the Jarvis icon to open the assistant workspace and switch between:

- Chat
- Workspace
- Search
- Files
- Memory
- Agents
- Git
- Terminal
- Models
- Settings

The `Jarvis: Open Assistant` command focuses the Jarvis Chat view while the legacy assistant panel remains available through the existing webview infrastructure.

## Commands

- Jarvis: Open Assistant
- Jarvis: New Chat
- Jarvis: Clear Chat
- Jarvis: Export Conversation
- Jarvis: Show Status
- Jarvis: Open Settings
- Jarvis: Index Workspace
- Jarvis: Reindex Workspace
- Jarvis: Explain Project
- Jarvis: Search Workspace
- Jarvis: Find Symbol
- Jarvis: Explain Symbol
- Jarvis: Find References
- Jarvis: Explain/Fix/Refactor/Optimize Selection
- Jarvis: Generate Tests
- Jarvis: Generate Documentation
- Jarvis: Review Code
- Jarvis: Rename Across Project
- Jarvis: Update Imports
- Jarvis: Analyze Problems
- Jarvis: Explain/Fix Error
- Jarvis: Explain Terminal Output
- Jarvis: Run Approved Command
- Jarvis: Show Git Status
- Jarvis: Explain Git Changes
- Jarvis: Generate Commit Message
- Jarvis: Remember/Search/Clear Memory
- Jarvis: Run Agent
- Jarvis: Add/Remove/Test API Key

## Workspace Intelligence

Jarvis can index the active workspace and build a lightweight project model that includes:

- Project type, package managers, frameworks, dependencies, and dominant languages
- Source symbols such as classes, interfaces, functions, methods, and variables
- Import relationships between local files
- Architecture signals from existing folders and manifests
- Search over indexed file names, summaries, imports, symbols, comments, and code text
- Symbol lookup with file and line metadata
- Folder, dependency, and local import graph metadata

## Settings

- jarvis.provider
- jarvis.model
- jarvis.memoryEnabled
- jarvis.maxHistory

## Provider Setup

Jarvis defaults to Ollama at `http://127.0.0.1:11434`. Install Ollama, pull a supported model such as `qwen2.5-coder:3b`, then open the Jarvis Chat view. If Ollama is offline or the selected model is missing, the chat UI shows an actionable warning instead of failing silently.

OpenAI-compatible providers are available through `jarvis.provider`. Store cloud API keys with `Jarvis: Add API Key`; keys are kept in VS Code SecretStorage and are never written to repository files.

## Security Model

Jarvis treats workspace content and model output as untrusted. The chat webview uses a restrictive Content Security Policy with nonce-based scripts, markdown output is escaped before rendering, and command messages from summary views are restricted to that view's declared actions. AI prompts are not logged verbatim.

AI-generated file changes must flow through Safe Edit proposals, diff preview, and explicit user approval before application. Terminal execution is risk-classified and uses direct process execution without shell interpolation; risky commands require approval. Workspace path handling rejects traversal outside workspace roots.

## Roadmap Status

Core roadmap systems through security/QA are implemented and covered by focused tests. Remaining known limitations:

- AI Debugger fix flow produces reviewed suggestions instead of automatically converting model output into Safe Edit patches.
- Vision and voice have capability-gated service scaffolding, but no full multimodal provider payload or TTS UI.
- MCP and plugin systems provide registries and permission boundaries, but no live external protocol/plugin loading.
- VSIX installation verification still requires a VS Code host/manual run.

## Development

Run the test suite with:

```bash
npm test
```

Run static build checks and package a VSIX with:

```bash
npm run build
npm run package
```
