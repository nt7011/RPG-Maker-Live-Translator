// Game Message foresight scanner public runtime module.
// Support files register catalog, traversal, budget, and diagnostics pieces in the internal parts registry.
(() => {
    'use strict';
    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function' || typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/foresight.js.');
    }
    const parts = requireRuntimeModule('adapters.foresight.partsRegistry').getParts();
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
