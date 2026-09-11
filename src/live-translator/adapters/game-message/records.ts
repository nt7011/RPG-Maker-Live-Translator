import { readObservedAdapterItemId } from '../../runtime/adapter-contract/local-binding.js';
import { createGameMessageForesightSourceIdentity, createGameMessageOriginIdentity } from './identity.js';
import type { MessageWindowContextAuthority } from './window-context.js';
type PropertySource = Record<PropertyKey, unknown>;
type WindowCandidate = PropertySource;
interface MessagePayload extends PropertySource {
    readonly normalizedTranslationSource?: unknown;
    readonly resolved?: unknown;
    readonly translationSource?: unknown;
    readonly visible?: unknown;
}
interface MessageObservation extends PropertySource {
    id?: unknown;
}
interface MessageRecord extends PropertySource {
    id?: unknown;
    observation?: MessageObservation | null;
    payload?: MessagePayload | null;
    sessionId?: unknown;
    windowInstance?: WindowCandidate | null;
    windowType?: unknown;
}
interface AdapterContractCandidate {
    readonly observeRecord: (record: unknown, payload?: unknown, eventOptions?: unknown) => unknown;
}
interface GameMessageRecordsScope {
    readonly MESSAGE_ADAPTER_ID?: unknown;
    readonly adapterContract?: unknown;
    readonly messageWindowContextAuthority?: unknown;
}
interface RenderTransactionCandidate {
    readonly createSourceDrawBoundary: (input: PropertySource) => unknown;
}
export interface GameMessageRecordsDependencies {
    readonly renderTransaction: RenderTransactionCandidate;
}
export interface GameMessageRecordsController {
    readonly createForesightObservation: (windowInstance: WindowCandidate | null | undefined, payload: MessagePayload | null | undefined, priority: unknown, metadata: PropertySource, sourceKey: unknown) => MessageObservation;
    readonly createMessageRecord: (observation: MessageObservation | null | undefined, payload: MessagePayload | null | undefined, sessionId: unknown, options?: PropertySource) => MessageRecord;
    readonly observeMessageRecord: (record: MessageRecord | null | undefined, eventType: unknown, options?: PropertySource) => string;
}
export interface GameMessageRecordsModule {
    create(scope?: unknown): GameMessageRecordsController;
}
function isPropertySource(value: unknown): value is PropertySource {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function propertyValue(value: unknown, key: PropertyKey): unknown {
    if (!isPropertySource(value))
        return undefined;
    try {
        return value[key];
    }
    catch {
        return undefined;
    }
}
function nonemptyString(value: unknown, defaultValue = ''): string {
    return typeof value === 'string' && value ? value : defaultValue;
}
export function createGameMessageRecordsModule({ renderTransaction, }: GameMessageRecordsDependencies): GameMessageRecordsModule {
    function createController(scope: unknown = {}): GameMessageRecordsController {
        if (!isPropertySource(scope))
            throw new TypeError('[GameMessage] Foresight records require an adapter scope.');
        const source = scope as unknown as GameMessageRecordsScope;
        const authority = source.messageWindowContextAuthority;
        if (!isPropertySource(authority) || typeof authority['acquire'] !== 'function') {
            throw new TypeError('[GameMessage] Foresight records require the message-window identity authority.');
        }
        const windowContextAuthority = authority as unknown as MessageWindowContextAuthority;
        const contract = source.adapterContract;
        if (!isPropertySource(contract) || typeof contract['observeRecord'] !== 'function') {
            throw new TypeError('[GameMessage] Foresight records require TextCore observation.');
        }
        const adapterContract = contract as unknown as AdapterContractCandidate;
        const adapterId = nonemptyString(source.MESSAGE_ADAPTER_ID, 'message');
        function createForesightObservation(windowInstance: WindowCandidate | null | undefined, payload: MessagePayload | null | undefined, priority: unknown, metadata: PropertySource, sourceKey: unknown): MessageObservation {
            const acquisition = windowContextAuthority.acquire(windowInstance);
            if (acquisition.status !== 'ready')
                throw acquisition.error;
            const context = acquisition.context;
            const windowType = nonemptyString(propertyValue(metadata, 'windowType'), 'Window_Message');
            const originIdentity = createGameMessageOriginIdentity({
                interpreterId: propertyValue(metadata, 'interpreterId'),
                listId: propertyValue(metadata, 'listId'),
                startIndex: propertyValue(metadata, 'messageStartIndex'),
                nextIndex: propertyValue(metadata, 'messageNextIndex'),
            });
            const sourceIdentity = createGameMessageForesightSourceIdentity(sourceKey);
            const identitySegment = originIdentity
                ? `origin:${originIdentity}`
                : sourceIdentity
                    ? `foresight:${sourceIdentity}`
                    : 'foresight';
            const surfaceId = `message:${context.identityKey}`;
            const recordId = originIdentity ? `message:${identitySegment}` : `${surfaceId}:${identitySegment}`;
            const resolved = nonemptyString(payload?.resolved);
            const visible = nonemptyString(payload?.visible);
            const translationSource = nonemptyString(payload?.translationSource);
            const normalizedSource = nonemptyString(payload?.normalizedTranslationSource);
            const boundary = renderTransaction.createSourceDrawBoundary({
                beforeNativePaint: false,
                adapterId,
                itemId: recordId,
                recordId,
                surfaceId,
                slotKey: identitySegment,
                generation: 0,
                reason: 'message-foresight-observed',
                details: { foresight: true, screenState: 'background', surfaceType: 'message', windowType },
            });
            return {
                id: recordId,
                ...(originIdentity ? { identityContinuity: 'explicit-id' } : {}),
                sourceAdapter: adapterId,
                hook: 'message',
                hookLabel: 'Game Message Foresight',
                surfaceId,
                slotKey: identitySegment,
                surfaceType: 'message',
                status: 'detected',
                rawText: resolved,
                convertedText: resolved,
                visibleText: visible,
                original: visible,
                translationSource,
                normalizedSource,
                priority,
                generation: 0,
                renderStrategy: '',
                drawBoundary: boundary,
                onScreen: false,
                screenState: 'background',
                visible: false,
                x: 0,
                y: 0,
                bounds: { x: 0, y: 0, width: 0, height: 0 },
                windowType,
                metadata: Object.assign({ sessionId: 0, windowType, screenState: 'background' }, metadata, {
                    foresight: true,
                }),
            };
        }
        function createMessageRecord(observation: MessageObservation | null | undefined, payload: MessagePayload | null | undefined, sessionId: unknown, options: PropertySource = {}): MessageRecord {
            return {
                id: nonemptyString(observation?.id),
                observation: observation ?? null,
                payload: payload ?? null,
                sessionId,
                windowInstance: (propertyValue(options, 'windowInstance') as WindowCandidate | null) ?? null,
                windowType: propertyValue(options, 'windowType') ?? 'Window_Message',
            };
        }
        function observeMessageRecord(record: MessageRecord | null | undefined, eventType: unknown, options: PropertySource = {}): string {
            if (!record?.observation)
                return '';
            const eventOptions: PropertySource = { eventType };
            if (propertyValue(options, 'details') !== undefined) {
                eventOptions['details'] = propertyValue(options, 'details');
            }
            const observed = adapterContract.observeRecord(record, record.observation, eventOptions);
            const id = readObservedAdapterItemId(observed);
            if (!id)
                return '';
            record.id = id;
            record.observation.id = id;
            return id;
        }
        return Object.freeze({ createForesightObservation, createMessageRecord, observeMessageRecord });
    }
    return Object.freeze({ create: createController });
}
