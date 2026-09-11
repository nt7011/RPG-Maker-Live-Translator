import { createForesightBranches } from './branches.js';
import { foresightBudget } from './budget.js';
import { createForesightCatalog } from './catalog.js';
import { createForesightCore, type ForesightCoreParts } from './core.js';
import { createForesightDiagnosticsPort } from './diagnostics-port.js';
import { createForesightMovementFlow } from './movement-flow.js';
import { createForesightNestedLists, type ForesightNestedListGlobalScope } from './nested-lists.js';
import { createForesightMessageBlockParser } from './message-block-parser.js';
import { createForesightPathState } from './path-state.js';
import { createForesightProvenance, type ForesightProvenanceAuthority } from './provenance.js';
import { createForesightScanner } from './scanner.js';
import { createForesightScanListGenerationOwner } from './scan-list-generation-owner.js';
type CreateGameMessageForesight = ForesightCoreParts['createGameMessageForesight'];
const objectFreeze = Object.freeze;
function freezeExact<Value extends object>(value: Value): Readonly<Value> {
    return objectFreeze(value);
}
export interface ForesightFacadeParts {
    readonly createGameMessageForesight: CreateGameMessageForesight;
}
export type ForesightGlobalScope = ForesightNestedListGlobalScope & {
    readonly LiveTranslatorAssets?: unknown;
    readonly LiveTranslatorForesightCommands?: unknown;
};
export interface ForesightModule {
    readonly createGameMessageForesight: CreateGameMessageForesight;
}
export interface ForesightInternalComposition extends ForesightModule {
    readonly facade: ForesightModule;
    readonly provenance: ForesightProvenanceAuthority;
}
export function createForesightFacade(core: ForesightFacadeParts): ForesightModule {
    const createGameMessageForesight = core.createGameMessageForesight;
    return freezeExact({ createGameMessageForesight });
}
export function createForesightModule(globalScope: ForesightGlobalScope): ForesightModule {
    return createForesightInternalComposition(globalScope).facade;
}
export function createForesightInternalComposition(globalScope: ForesightGlobalScope): ForesightInternalComposition {
    const catalog = createForesightCatalog(globalScope);
    const listGenerations = createForesightScanListGenerationOwner({ catalog });
    const diagnostics = createForesightDiagnosticsPort(globalScope);
    const movementFlow = createForesightMovementFlow(listGenerations);
    const branches = createForesightBranches(listGenerations, movementFlow);
    const nestedLists = createForesightNestedLists(globalScope, { listGenerations, movementFlow });
    const messageParser = createForesightMessageBlockParser(listGenerations);
    const provenance = createForesightProvenance({ listGenerations, parser: messageParser, globalScope });
    const pathState = createForesightPathState({
        nestedLists,
        budget: foresightBudget,
    });
    const scanner = createForesightScanner({
        catalog,
        listGenerations,
        messageParser,
        pathState,
        nestedLists,
        branches,
        budget: foresightBudget,
        diagnostics,
    });
    const core = createForesightCore({
        origin: provenance,
        scanner,
        budget: foresightBudget,
        diagnostics,
    });
    const facade = createForesightFacade(core);
    return freezeExact({
        createGameMessageForesight: facade.createGameMessageForesight,
        facade,
        provenance,
    });
}
