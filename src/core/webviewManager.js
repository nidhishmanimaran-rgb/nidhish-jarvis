const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const vscode = require('vscode');

function createNonce() {
  return crypto.randomBytes(16).toString('base64');
}

class WebviewManager {
  constructor(context) {
    this.context = context;
  }

  createPanel(id, title, column, options = {}) {
    const panel = vscode.window.createWebviewPanel(id, title, column, options);
    panel.webview.options = {
      enableScripts: true,
      ...(options.localResourceRoots ? { localResourceRoots: options.localResourceRoots } : {}),
      ...(options.webviewOptions || {}),
    };
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

  getWebviewAssetRoot(webview) {
    return webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview'))).toString();
  }

  getAssistantHtml(webview) {
    const htmlPath = path.join(this.context.extensionPath, 'src', 'webview', 'assistant.html');
    const htmlContent = fs.readFileSync(htmlPath, 'utf8');
    const assetBaseUri = this.getWebviewAssetRoot(webview);
    const nonce = createNonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
      `font-src ${webview.cspSource}`,
    ].join('; ');

    return htmlContent
      .replace('<!-- JARVIS_CSP -->', `<meta http-equiv="Content-Security-Policy" content="${csp}" />`)
      .replace(/src="(?:\.\/)?assistant\.js"/g, `src="${assetBaseUri}/assistant.js"`)
      .replace(/<script src="([^"]+)"><\/script>/g, `<script nonce="${nonce}" src="$1"></script>`)
      .replace(/href="/g, `href="${assetBaseUri}/`);
  }

  openAssistantPanel() {
    const panel = this.createPanel('jarvisAssistantPanel', 'Jarvis Assistant', vscode.ViewColumn.One, {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview'))],
    });

    panel.webview.html = this.getAssistantHtml(panel.webview);

    return panel;
  }
}


module.exports = { WebviewManager };

