# Change Log

All notable changes to the "nidhish-jarvis" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.2] - 2026-07-31

- Added a dedicated Jarvis Activity Bar container with Chat, Workspace, Search, Files, Memory, Agents, Git, Terminal, Models, and Settings webview sections.
- Updated `Jarvis: Open Assistant` to focus the docked Chat view.
- Expanded the assistant architecture with workspace intelligence, Context Builder/RAG, bounded-concurrency indexing, Safe Edit diff approval, AI debugging, Terminal Agent safety controls, Git Assistant, agent runtime, media, plugin, MCP, and automation foundations.
- Added provider architecture improvements, including SecretStorage-backed OpenAI-compatible provider support.
- Hardened webview CSP/message handling, webview `localResourceRoots` lifecycle handling, workspace path protections, terminal approval, and provider error redaction.
- Added a theme-aware `currentColor` Activity Bar SVG while keeping `icon.png` for the Marketplace listing.
- Added command ThemeIcons and package/QA verification scripts for release validation.
