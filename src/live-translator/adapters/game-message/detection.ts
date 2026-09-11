type PropertySource = Record<PropertyKey, unknown>;
type RuntimeFunction = (this: unknown, ...arguments_: unknown[]) => unknown;
interface GameMessageDetectionScope extends PropertySource {
    readonly FORESIGHT_BASE_PRIORITY: unknown;
    readonly createForesightPayload: RuntimeFunction;
    readonly requestForesightTranslation: RuntimeFunction;
    readonly getForesightSourceKey: RuntimeFunction;
    readonly foresightEnabled?: unknown;
    readonly foresightScanner?: unknown;
}
export interface GameMessageDetectionController {
    readonly scheduleForesightTranslations: (windowInstance?: unknown, currentPayload?: unknown, sessionId?: unknown, windowType?: unknown) => number;
    readonly collectUpcomingMessageBlocks: (windowInstance?: unknown, currentPayload?: unknown) => unknown;
}
export interface GameMessageDetectionModule {
    create(scope?: unknown): GameMessageDetectionController;
}
function isPropertySource(value: unknown): value is PropertySource {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    return isPropertySource(value) ? value[key] : undefined;
}
function requirePropertySource(value: unknown, label: string): PropertySource {
    if (isPropertySource(value))
        return value;
    throw new TypeError(`Game message foresight scheduling requires ${label}.`);
}
function requireFunction(value: unknown, label: string): RuntimeFunction {
    if (typeof value === 'function')
        return value as RuntimeFunction;
    throw new TypeError(`Game message foresight scheduling requires ${label}.`);
}
function callFunction(callback: RuntimeFunction, receiver: unknown, argumentsList: readonly unknown[]): unknown {
    return Reflect.apply(callback, receiver, argumentsList);
}
function numberValue(value: unknown): number {
    const converted: unknown = Reflect.apply(Number, undefined, [value]);
    return typeof converted === 'number' ? converted : Number.NaN;
}
function defaultWhenFalsy<Value, Default>(value: Value, defaultValue: Default): Value | Default {
    return value ? value : defaultValue;
}
export function createGameMessageDetectionController(scope: unknown = {}): GameMessageDetectionController {
    const source = requirePropertySource(scope, 'an adapter scope') as GameMessageDetectionScope;
    const configuredForesightBasePriority = source.FORESIGHT_BASE_PRIORITY;
    if (typeof configuredForesightBasePriority !== 'number' || !Number.isFinite(configuredForesightBasePriority)) {
        throw new TypeError('Game message foresight scheduling requires a numeric foresight priority.');
    }
    const foresightBasePriority: number = configuredForesightBasePriority;
    const createForesightPayload = requireFunction(source.createForesightPayload, 'foresight payload creation');
    const requestForesightTranslation = requireFunction(source.requestForesightTranslation, 'foresight request dispatch');
    const getForesightSourceKey = requireFunction(source.getForesightSourceKey, 'foresight source identity');
    function scheduleForesightTranslations(windowInstance: unknown, currentPayload: unknown, sessionId: unknown, windowType: unknown): number {
        if (source.foresightEnabled !== true || !windowInstance || !currentPayload)
            return 0;
        const blocks = collectUpcomingMessageBlocks(windowInstance, currentPayload);
        const forEach = propertyValue(blocks, 'forEach');
        const length = propertyValue(blocks, 'length');
        if (typeof forEach !== 'function' || !length)
            return 0;
        let scheduled = 0;
        const seenSources = new Set<unknown>([callFunction(getForesightSourceKey, undefined, [currentPayload])]);
        callFunction(forEach as RuntimeFunction, blocks, [
            (block: unknown, index: unknown): void => {
                const priorityOffsetValue = numberValue(propertyValue(block, 'priorityOffset'));
                const priorityOffset = Number.isFinite(priorityOffsetValue)
                    ? Math.max(0, Math.floor(priorityOffsetValue))
                    : scheduled;
                const priority = foresightBasePriority - priorityOffset;
                if (!block || priority < 1)
                    return;
                const payload = callFunction(createForesightPayload, undefined, [block]);
                const sourceKey = callFunction(getForesightSourceKey, undefined, [payload]);
                if (!payload || !sourceKey || seenSources.has(sourceKey))
                    return;
                seenSources.add(sourceKey);
                const requested = callFunction(requestForesightTranslation, undefined, [
                    windowInstance,
                    payload,
                    priority,
                    {
                        index,
                        sessionId,
                        windowType: typeof windowType === 'string' && windowType ? windowType : 'Window_Message',
                        interpreterId: defaultWhenFalsy(propertyValue(block, 'interpreterId'), ''),
                        listId: defaultWhenFalsy(propertyValue(block, 'listId'), ''),
                        commonEventId: propertyValue(block, 'commonEventId'),
                        commonEventName: defaultWhenFalsy(propertyValue(block, 'commonEventName'), ''),
                        nestedListType: defaultWhenFalsy(propertyValue(block, 'nestedListType'), ''),
                        nestedListName: defaultWhenFalsy(propertyValue(block, 'nestedListName'), ''),
                        nestedListPath: defaultWhenFalsy(propertyValue(block, 'nestedListPath'), ''),
                        nestedListIndex: propertyValue(block, 'nestedListIndex'),
                        branchDepth: propertyValue(block, 'branchDepth'),
                        branchPath: propertyValue(block, 'branchPath'),
                        priorityOffset: propertyValue(block, 'priorityOffset'),
                        budget: propertyValue(block, 'foresightBudget'),
                        messageStartIndex: propertyValue(block, 'startIndex'),
                        messageNextIndex: propertyValue(block, 'nextIndex'),
                    },
                ]);
                if (requested)
                    scheduled += 1;
            },
        ]);
        return scheduled;
    }
    function collectUpcomingMessageBlocks(_windowInstance: unknown, currentPayload: unknown): unknown {
        const scanner = source.foresightScanner;
        const collect = propertyValue(scanner, 'collectUpcomingMessageBlocks');
        if (source.foresightEnabled !== true || !scanner || typeof collect !== 'function')
            return [];
        return callFunction(collect as RuntimeFunction, scanner, [
            {
                currentMessageOrigin: propertyValue(currentPayload, 'messageOrigin'),
            },
        ]);
    }
    return Object.freeze({
        scheduleForesightTranslations,
        collectUpcomingMessageBlocks,
    });
}
export function createGameMessageDetectionModule(): GameMessageDetectionModule {
    return Object.freeze({ create: createGameMessageDetectionController });
}
