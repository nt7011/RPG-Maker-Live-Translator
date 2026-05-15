// Game Message foresight scanner public runtime module.
// Support files register catalog, traversal, budget, and diagnostics pieces under LiveTranslatorForesightParts.
(() => {
    'use strict';
    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/foresight.js.');
    }
    const parts = globalScope.LiveTranslatorForesightParts || {};
    const commandCatalog = parts.commandCatalog;
    defineRuntimeModule('adapters.foresight', {
        createGameMessageForesight: parts.createGameMessageForesight,
        getCommandCatalog() {
            return {
                schemaVersion: commandCatalog.schemaVersion,
                eventCommands: parts.cloneCommandTable(commandCatalog.eventCommands),
                movementRouteCommands: parts.cloneCommandTable(commandCatalog.movementRouteCommands),
                stopReasons: Object.assign({}, commandCatalog.stopReasons),
            };
        },
        describeEventCommand: parts.getEventCommandMetadata,
        describeMovementRouteCommand: parts.getMovementRouteCommandMetadata,
    });
})();
