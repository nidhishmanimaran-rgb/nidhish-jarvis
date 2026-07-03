const { activate: bootstrapActivate, deactivate: bootstrapDeactivate } = require('./src/bootstrap');

/**
 * @param {import('vscode').ExtensionContext} context
 */
function activate(context) {
  return bootstrapActivate(context);
}

function deactivate() {
  return bootstrapDeactivate?.();
}

module.exports = {
  activate,
  deactivate,
};
