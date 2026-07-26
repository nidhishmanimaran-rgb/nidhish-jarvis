# Nidhish's Jarvis

Jarvis is a modular AI productivity platform for VS Code. It starts as a capable assistant shell with conversation memory, planning support, writing help, coding assistance, and a plugin architecture ready for future providers and tools.

## Highlights

- Multi-turn conversation support with persistent history
- Plugin-based routing for general assistance, reasoning, writing, and coding
- Dedicated Jarvis Activity Bar container with Chat, Workspace, Memory, Agents, Git, Terminal, and Settings views
- Workspace-aware greetings and extensible runtime configuration
- Workspace intelligence for indexing projects, detecting languages/frameworks, parsing symbols/imports, and summarizing architecture
- Commands for opening the assistant, exporting history, and checking status
- Marketplace-ready metadata and settings for future provider integration

## Activity Bar

Jarvis contributes a permanent Activity Bar container. Select the Jarvis icon to open the assistant workspace and switch between:

- Chat
- Workspace
- Memory
- Agents
- Git
- Terminal
- Settings

The `Jarvis: Open Assistant` command focuses the Jarvis Chat view while the legacy assistant panel remains available through the existing webview infrastructure.

## Commands

- Jarvis: Open Assistant
- Jarvis: Export Conversation
- Jarvis: Show Status
- Jarvis: Index Workspace
- Jarvis: Explain Project

## Workspace Intelligence

Jarvis can index the active workspace and build a lightweight project model that includes:

- Project type, package managers, frameworks, dependencies, and dominant languages
- Source symbols such as classes, interfaces, functions, methods, and variables
- Import relationships between local files
- Architecture signals from existing folders and manifests
- Natural language search over indexed file names, summaries, imports, and symbols

## Settings

- jarvis.provider
- jarvis.model
- jarvis.memoryEnabled
- jarvis.maxHistory

## Roadmap

The architecture is designed for future expansion with:

- MCP integration
- Additional LLM providers
- Tool calling and RAG
- Browser, terminal, database, Docker, and cloud plugins
- Accessibility and localization improvements

## Development

Run the test suite with:

```bash
npm test
```
