/**
 * @typedef {{
 *   init: (options: any) => Promise<void> | void,
 *   generate: (input: string, context?: any) => Promise<any>,
 *   health: () => Promise<boolean>,
 * }} ProviderInterface
 */

module.exports = { ProviderInterface: {} };