type RuntimeCallback = (...args: unknown[]) => unknown;
type DirectStringCoercion = (value: unknown) => string;
export interface GameMessageForesightBlock {
    readonly rawText?: unknown;
}
export interface GameMessageForesightPayload {
    readonly resolved?: unknown;
    readonly visible?: unknown;
    readonly translationSource?: unknown;
    readonly normalizedTranslationSource?: unknown;
}
export interface GameMessageForesightRequestContext {
    readonly sessionId?: unknown;
    readonly index?: unknown;
    readonly budget?: unknown;
    readonly windowType?: unknown;
    readonly interpreterId?: unknown;
    readonly listId?: unknown;
    readonly commonEventId?: unknown;
    readonly commonEventName?: unknown;
    readonly nestedListType?: unknown;
    readonly nestedListName?: unknown;
    readonly nestedListPath?: unknown;
    readonly nestedListIndex?: unknown;
    readonly branchDepth?: unknown;
    readonly branchPath?: unknown;
    readonly priorityOffset?: unknown;
    readonly messageStartIndex?: unknown;
    readonly messageNextIndex?: unknown;
}
export interface GameMessageForesightMetadata {
    sessionId: unknown;
    windowType: unknown;
    detachedCacheable: true;
    foresight: true;
    foresightIndex: unknown;
    foresightPriority: unknown;
    foresightBudget: object | null;
    interpreterId: unknown;
    listId: unknown;
    commonEventId: number | null;
    commonEventName: unknown;
    nestedListType: unknown;
    nestedListName: unknown;
    nestedListPath: unknown;
    nestedListIndex: number | null;
    branchDepth: number;
    branchPath: unknown[];
    priorityOffset: number;
    messageStartIndex: number | null;
    messageNextIndex: number | null;
}
export interface GameMessageForesightTranslationRequest {
    readonly hook: 'message';
    readonly priority: unknown;
    readonly metadata: GameMessageForesightMetadata;
}
interface OperationReceiptCandidate {
    readonly handled?: unknown;
    readonly id?: unknown;
    readonly recordId?: unknown;
    readonly terminal?: unknown;
}
interface ForesightGlobalScopeCandidate {
    readonly $gameMessage?: unknown;
}
interface AdapterContractCandidate {
    requestItemTranslation(record: unknown, request: GameMessageForesightTranslationRequest): unknown;
    retireItem(record: unknown, status: unknown, eventOptions: unknown): unknown;
}
interface GameMessageForesightIngressScopeCandidate {
    readonly globalScope: ForesightGlobalScopeCandidate;
    readonly adapterContract: AdapterContractCandidate;
    readonly createEscapeAwarePayload: RuntimeCallback;
    readonly createForesightObservation: RuntimeCallback;
    readonly createMessageRecord: RuntimeCallback;
    readonly observeMessageRecord: RuntimeCallback;
    readonly foresightEnabled?: unknown;
}
function ownDataValue(value: unknown, key: PropertyKey): unknown {
    if (!value || (typeof value !== 'object' && typeof value !== 'function'))
        return undefined;
    try {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor && 'value' in descriptor ? descriptor.value : undefined;
    }
    catch {
        return undefined;
    }
}
export interface GameMessageForesightIngressController {
    readonly getGlobalGameMessage: () => unknown;
    readonly integerIndex: (value: unknown) => number | null;
    readonly createForesightPayload: (block: unknown) => unknown;
    readonly requestForesightTranslation: (windowInstance: unknown, payload: unknown, priority: unknown, context?: unknown) => boolean;
    readonly getForesightSourceKey: (payload: unknown) => string;
}
export interface GameMessageForesightIngressModule {
    create(scope?: unknown): GameMessageForesightIngressController;
}
function receiptMatchesRecord(receipt: unknown, recordId: string): boolean {
    if (!receipt || typeof receipt !== 'object')
        return false;
    const source = receipt as OperationReceiptCandidate;
    if (source.handled !== true || source.terminal === true)
        return false;
    return source.id === recordId || source.recordId === recordId;
}
export function createGameMessageForesightIngressModule(): GameMessageForesightIngressModule {
    function createController(scope: unknown = {}): GameMessageForesightIngressController {
        const source = scope as GameMessageForesightIngressScopeCandidate;
        const { globalScope, adapterContract } = source;
        const { createEscapeAwarePayload, createForesightObservation, createMessageRecord, observeMessageRecord } = source;
        if (typeof adapterContract.requestItemTranslation !== 'function' ||
            typeof adapterContract.retireItem !== 'function') {
            throw new TypeError('GameMessage foresight requires the TextCore request and retirement capabilities.');
        }
        function getGlobalGameMessage(): unknown {
            const gameMessage = ownDataValue(globalScope, '$gameMessage');
            return gameMessage && typeof gameMessage === 'object' ? gameMessage : null;
        }
        function integerIndex(value: unknown): number | null {
            const numeric = typeof value === 'number'
                ? value
                : typeof value === 'string' || typeof value === 'boolean' || typeof value === 'bigint'
                    ? Number(value)
                    : Number.NaN;
            return Number.isInteger(numeric) ? numeric : null;
        }
        function createForesightPayload(block: unknown): unknown {
            if (!block)
                return null;
            const blockSource = block as GameMessageForesightBlock;
            const rawText = blockSource.rawText;
            if (typeof rawText !== 'string')
                return null;
            return Reflect.apply(createEscapeAwarePayload, undefined, [rawText, 'foresight', { rawText }]);
        }
        function createMetadata(priority: unknown, context: GameMessageForesightRequestContext): GameMessageForesightMetadata {
            let defaultValue: unknown;
            return {
                sessionId: ((defaultValue = context.sessionId), defaultValue) ? defaultValue : 0,
                windowType: typeof context.windowType === 'string' && context.windowType
                    ? context.windowType
                    : 'Window_Message',
                detachedCacheable: true,
                foresight: true,
                foresightIndex: ((defaultValue = context.index), defaultValue) ? defaultValue : 0,
                foresightPriority: priority,
                foresightBudget: context.budget && typeof context.budget === 'object' ? Object.assign({}, context.budget) : null,
                interpreterId: ((defaultValue = context.interpreterId), defaultValue) ? defaultValue : '',
                listId: ((defaultValue = context.listId), defaultValue) ? defaultValue : '',
                commonEventId: context.commonEventId === null || context.commonEventId === undefined
                    ? null
                    : Number.isFinite(Number(context.commonEventId))
                        ? Number(context.commonEventId)
                        : null,
                commonEventName: ((defaultValue = context.commonEventName), defaultValue) ? defaultValue : '',
                nestedListType: ((defaultValue = context.nestedListType), defaultValue) ? defaultValue : '',
                nestedListName: ((defaultValue = context.nestedListName), defaultValue) ? defaultValue : '',
                nestedListPath: ((defaultValue = context.nestedListPath), defaultValue) ? defaultValue : '',
                nestedListIndex: context.nestedListIndex === null || context.nestedListIndex === undefined
                    ? null
                    : Number.isFinite(Number(context.nestedListIndex))
                        ? Number(context.nestedListIndex)
                        : null,
                branchDepth: Number.isFinite(Number(context.branchDepth)) ? Number(context.branchDepth) : 0,
                branchPath: Array.isArray(context.branchPath) ? context.branchPath.slice() : [],
                priorityOffset: Number.isFinite(Number(context.priorityOffset)) ? Number(context.priorityOffset) : 0,
                messageStartIndex: Number.isFinite(Number(context.messageStartIndex))
                    ? Number(context.messageStartIndex)
                    : null,
                messageNextIndex: Number.isFinite(Number(context.messageNextIndex))
                    ? Number(context.messageNextIndex)
                    : null,
            };
        }
        function requestForesightTranslation(windowInstance: unknown, payload: unknown, priority: unknown, context: unknown = {}): boolean {
            if (!source.foresightEnabled)
                return false;
            const sourceKey = getForesightSourceKey(payload);
            if (!windowInstance || !payload || !sourceKey)
                return false;
            const contextSource = context as GameMessageForesightRequestContext;
            const metadata = createMetadata(priority, contextSource);
            const observation = Reflect.apply(createForesightObservation, undefined, [
                windowInstance,
                payload,
                priority,
                metadata,
                sourceKey,
            ]);
            const record = Reflect.apply(createMessageRecord, undefined, [
                observation,
                payload,
                0,
                {
                    windowType: metadata.windowType,
                },
            ]);
            const observedId = Reflect.apply(observeMessageRecord, undefined, [record, 'item.detected']);
            if (typeof observedId !== 'string' || !observedId)
                return false;
            const request: GameMessageForesightTranslationRequest = {
                hook: 'message',
                priority,
                metadata,
            };
            let accepted = false;
            try {
                const receipt = adapterContract.requestItemTranslation(record, request);
                accepted = receiptMatchesRecord(receipt, observedId);
                return accepted;
            }
            finally {
                adapterContract.retireItem(record, accepted ? 'disappeared' : 'failed', {
                    eventType: accepted ? 'item.prefetch_detached' : 'item.prefetch_failed',
                    policy: { kind: accepted ? 'prefetch-detached' : 'prefetch-lost' },
                    recordDetached: true,
                    reason: accepted ? 'message-foresight-detached' : 'message-foresight-request-unhandled',
                    ...metadata,
                });
            }
        }
        function getForesightSourceKey(payload: unknown): string {
            const payloadSource = payload as GameMessageForesightPayload;
            let defaultValue: unknown;
            let sourceValue: unknown;
            return (String as DirectStringCoercion)(((sourceValue = payload
                ? ((defaultValue = payloadSource.normalizedTranslationSource), defaultValue)
                    ? defaultValue
                    : ((defaultValue = payloadSource.translationSource), defaultValue)
                        ? defaultValue
                        : payloadSource.visible
                : payload),
                sourceValue)
                ? sourceValue
                : '').trim();
        }
        return {
            getGlobalGameMessage,
            integerIndex,
            createForesightPayload,
            requestForesightTranslation,
            getForesightSourceKey,
        };
    }
    return { create: createController };
}
