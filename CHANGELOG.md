# Change Log

All notable changes to the "nidhish-jarvis" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.1.3] - 2026-08-01

- Restored explicit `onView` activation events for all Jarvis sidebar views so opening the Activity Bar container activates and registers providers reliably.
- Hardened Jarvis sidebar webview providers to log initialization failures and render an error state instead of leaving views stuck loading.
- Kept workspace restore/watch startup lazy and non-blocking during extension activation.
- Added regression coverage for exact manifest/provider ID matching, no-workspace activation, provider-network independence, lazy indexing, and sidebar failure rendering.

## [0.1.2] - 2026-07-31

- Added a dedicated Jarvis Activity Bar container with Chat, Workspace, Search, Files, Memory, Agents, Git, Terminal, Models, and Settings webview sections.
- Updated `Jarvis: Open Assistant` to focus the docked Chat view.
- Expanded the assistant architecture with workspace intelligence, Context Builder/RAG, bounded-concurrency indexing, Safe Edit diff approval, AI debugging, Terminal Agent safety controls, Git Assistant, agent runtime, media, plugin, MCP, and automation foundations.
- Added provider architecture improvements, including SecretStorage-backed OpenAI-compatible provider support.
- Hardened webview CSP/message handling, webview `localResourceRoots` lifecycle handling, workspace path protections, terminal approval, and provider error redaction.
- Added a theme-aware `currentColor` Activity Bar SVG while keeping `icon.png` for the Marketplace listing.
- Added command ThemeIcons and package/QA verification scripts for release validation.
