const path = require('path');
const fs = require('fs');
const vscode = require('vscode');

class WebviewManager {
  constructor(context) {
    this.context = context;
  }

  createPanel(id, title, column, options = {}) {
    const panel = vscode.window.createWebviewPanel(id, title, column, options);
    panel.webview.options = { enableScripts: true, ...options.webviewOptions };
    return panel;
  }

  openFoundationPanel() {
    const panel = this.createPanel('jarvisFoundationPanel', 'Jarvis Foundation', vscode.ViewColumn.One, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview'))],
    });

    const htmlPath = path.join(this.context.extensionPath, 'src', 'webview', 'panel.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const assetBaseUri = panel.webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview'))).toString();

    panel.webview.html = htmlContent
      .replace(/src="main\.js"/g, `src="${assetBaseUri}/main.js"`)
      .replace(/href="/g, `href="${assetBaseUri}/`);

    return panel;
  }

  openAssistantPanel() {
    const panel = this.createPanel('jarvisAssistantPanel', 'Jarvis Assistant', vscode.ViewColumn.One, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview'))],
    });

    const htmlPath = path.join(this.context.extensionPath, 'src', 'webview', 'assistant.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const assetBaseUri = panel.webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview'))).toString();

    panel.webview.html = htmlContent
      .replace(/src="(?:\.\/)?assistant\.js"/g, `src="${assetBaseUri}/assistant.js"`)
      .replace(/href="/g, `href="${assetBaseUri}/`);

    return panel;
  }
}


module.exports = { WebviewManager };

