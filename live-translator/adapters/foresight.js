// Game Message foresight scanner public runtime module.
// Support files register catalog, traversal, budget, and diagnostics pieces in the internal parts registry.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.foresight',
        requires: {
            partsRegistry: 'adapters.foresight.partsRegistry',
        },
        factory({ partsRegistry }) {
            const parts = partsRegistry.getParts();
            const commandCatalog = parts.commandCatalog;

            return {
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
            };
        },
    });
})();
