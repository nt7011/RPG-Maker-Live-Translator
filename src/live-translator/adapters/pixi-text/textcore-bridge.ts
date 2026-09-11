import type { PixiCanvasTextPresenter, PixiCanvasTextSourceSupport } from './canvas-text-presenter.js';
import type { PixiTextFrameObserver, PixiTextFrameResult, PixiTextSourceChange, PixiTextSourceSnapshot, } from './frame-observer.js';
import type { PixiTextPresentationAuthority, PixiTextPresentationEvent } from './presentation-authority.js';
type PropertySource = Record<PropertyKey, unknown>;
type RuntimeFunction = (this: unknown, ...argumentsList: unknown[]) => unknown;
export interface PixiTextCoreBridgeOptions {
    readonly adapterContract: unknown;
    readonly canvasPresenter: PixiCanvasTextPresenter;
    readonly createTextSource: unknown;
    readonly frameObserver: PixiTextFrameObserver;
    readonly presentationAuthority: PixiTextPresentationAuthority;
    readonly logger?: unknown;
    readonly renderStrategy?: unknown;
    readonly visiblePriority?: unknown;
    readonly hiddenPriority?: unknown;
}
export interface PixiTextCoreBridge {
    readonly recordsByItemId: ReadonlyMap<string, unknown>;
    scan(root: unknown, frameId: unknown): PixiTextFrameResult;
    handlePresentationPainted(event: PixiTextPresentationEvent): void;
    handlePresentationRejected(event: PixiTextPresentationEvent): void;
    installSubscription(): (() => unknown) | null;
    dispose(reason?: unknown): boolean;
}
export interface PixiTextCoreBridgeModule {
    create(options: PixiTextCoreBridgeOptions): PixiTextCoreBridge;
}
interface PreparedTextSource {
    readonly visibleText: string;
    readonly translationSource: string;
    readonly normalizedSource: string;
    readonly codecState: unknown;
}
type CommandStatus = 'awaiting-paint' | 'painted' | 'rejected';
interface PixiRenderCommandState {
    readonly commandId: string;
    readonly generation: number;
    status: CommandStatus;
    reason: string;
    settled: boolean;
    lastNotificationFrame: number;
}
interface PixiTextRecord {
    readonly sourceId: string;
    readonly source: object;
    snapshot: PixiTextSourceSnapshot;
    itemId: string;
    active: boolean;
    support: PixiCanvasTextSourceSupport;
    readonly commands: Map<string, PixiRenderCommandState>;
    appliedCommandId: string;
}
const bridgeFreeze = Object.freeze;
const bridgeReflectApply = Reflect.apply;
const DEFAULT_RENDER_STRATEGY = 'pixiOwnedCanvasText';
function isPropertySource(value: unknown): value is PropertySource {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function readProperty(value: unknown, key: PropertyKey): unknown {
    return isPropertySource(value) ? Reflect.get(value, key, value) : undefined;
}
function nonemptyString(...values: unknown[]): string {
    for (const value of values)
        if (typeof value === 'string' && value)
            return value;
    return '';
}
function finitePriority(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}
function freezeDecision<Value extends object>(value: Value): Readonly<Value> {
    bridgeFreeze(value);
    return value;
}
function normalizePreparedTextSource(value: unknown, fallback: string): PreparedTextSource | null {
    if (!isPropertySource(value))
        return null;
    const visibleTextCandidate = readProperty(value, 'visibleText');
    const translationSourceCandidate = readProperty(value, 'translationSource');
    if (typeof visibleTextCandidate !== 'string' || typeof translationSourceCandidate !== 'string')
        return null;
    const visibleText = visibleTextCandidate;
    const translationSource = translationSourceCandidate;
    const normalizedSourceCandidate = readProperty(value, 'normalizedSource');
    const normalizedTranslationSourceCandidate = readProperty(value, 'normalizedTranslationSource');
    const normalizedSource = typeof normalizedSourceCandidate === 'string'
        ? normalizedSourceCandidate
        : typeof normalizedTranslationSourceCandidate === 'string'
            ? normalizedTranslationSourceCandidate
            : translationSource;
    return freezeDecision({
        visibleText,
        translationSource,
        normalizedSource,
        codecState: readProperty(value, 'codecState') ?? { source: fallback },
    });
}
export function createPixiTextCoreBridgeModule(): PixiTextCoreBridgeModule {
    function create(optionsValue: PixiTextCoreBridgeOptions): PixiTextCoreBridge {
        const candidate: unknown = optionsValue;
        if (!isPropertySource(candidate))
            throw new TypeError('[PIXI Text] TextCore bridge options are required.');
        const adapterContract = readProperty(candidate, 'adapterContract');
        const canvasPresenterCandidate = readProperty(candidate, 'canvasPresenter') as PixiCanvasTextPresenter | undefined;
        const frameObserverCandidate = readProperty(candidate, 'frameObserver') as PixiTextFrameObserver | undefined;
        const presentationAuthorityCandidate = readProperty(candidate, 'presentationAuthority') as PixiTextPresentationAuthority | undefined;
        const createTextSource = readProperty(candidate, 'createTextSource');
        if (!isPropertySource(adapterContract)) {
            throw new TypeError('[PIXI Text] Adapter contract is required.');
        }
        if (!canvasPresenterCandidate || typeof canvasPresenterCandidate.describeSource !== 'function') {
            throw new TypeError('[PIXI Text] Canvas presentation capability is required.');
        }
        if (!frameObserverCandidate || typeof frameObserverCandidate.scan !== 'function') {
            throw new TypeError('[PIXI Text] Frame observation capability is required.');
        }
        if (!presentationAuthorityCandidate || typeof presentationAuthorityCandidate.prepare !== 'function') {
            throw new TypeError('[PIXI Text] Presentation authority is required.');
        }
        if (typeof createTextSource !== 'function') {
            throw new TypeError('[PIXI Text] Text source codec is required.');
        }
        const canvasPresenter: PixiCanvasTextPresenter = canvasPresenterCandidate;
        const frameObserver: PixiTextFrameObserver = frameObserverCandidate;
        const presentationAuthority: PixiTextPresentationAuthority = presentationAuthorityCandidate;
        const renderStrategy = nonemptyString(readProperty(candidate, 'renderStrategy'), DEFAULT_RENDER_STRATEGY);
        const visiblePriority = finitePriority(readProperty(candidate, 'visiblePriority'), 750);
        const hiddenPriority = finitePriority(readProperty(candidate, 'hiddenPriority'), 100);
        const logger = readProperty(candidate, 'logger');
        const recordsBySourceId = new Map<string, PixiTextRecord>();
        const mutableRecordsByItemId = new Map<string, PixiTextRecord>();
        const recordsBySource = new WeakMap<object, PixiTextRecord>();
        let currentFrameId = 0;
        let subscriptionRelease: (() => unknown) | null = null;
        let shutdownStarted = false;
        function log(level: PropertyKey, message: string, detail?: unknown): void {
            try {
                const callback = readProperty(logger, level);
                if (typeof callback !== 'function')
                    return;
                bridgeReflectApply(callback as RuntimeFunction, logger, detail === undefined ? [message] : [message, detail]);
            }
            catch {
            }
        }
        function callContract(methodName: PropertyKey, argumentsList: readonly unknown[]): unknown {
            const method = readProperty(adapterContract, methodName);
            if (typeof method !== 'function')
                return null;
            return bridgeReflectApply(method as RuntimeFunction, adapterContract, argumentsList);
        }
        function prepareText(snapshot: PixiTextSourceSnapshot): PreparedTextSource | null {
            try {
                const prepared = bridgeReflectApply(createTextSource as RuntimeFunction, undefined, [
                    snapshot.text,
                    { surfaceType: 'pixi' },
                ]);
                return normalizePreparedTextSource(prepared, snapshot.text);
            }
            catch (error) {
                log('warn', '[PIXI Text] Text source preparation failed.', error);
                return null;
            }
        }
        function describeSupport(snapshot: PixiTextSourceSnapshot): PixiCanvasTextSourceSupport {
            if (snapshot.kind !== 'canvas-text') {
                return freezeDecision({ supported: false, reason: 'pixi-bitmap-text-presentation-unavailable' });
            }
            try {
                return canvasPresenter.describeSource(snapshot.source);
            }
            catch {
                return freezeDecision({ supported: false, reason: 'pixi-canvas-source-capability-failed' });
            }
        }
        function createPayload(snapshot: PixiTextSourceSnapshot, prepared: PreparedTextSource, support: PixiCanvasTextSourceSupport): PropertySource {
            const priority = snapshot.visible ? visiblePriority : hiddenPriority;
            return {
                id: snapshot.sourceId,
                identityContinuity: 'explicit-id',
                sourceAdapter: 'pixi',
                hook: 'pixi_text',
                hookLabel: snapshot.kind === 'bitmap-text' ? 'PIXI BitmapText' : 'PIXI Text',
                surfaceId: snapshot.sourceId,
                slotKey: 'text',
                surfaceType: 'pixi',
                status: 'detected',
                rawText: snapshot.text,
                convertedText: snapshot.text,
                visibleText: prepared.visibleText,
                original: prepared.visibleText,
                translationSource: prepared.translationSource,
                normalizedSource: prepared.normalizedSource,
                codecState: prepared.codecState,
                priority,
                generation: snapshot.revision,
                renderStrategy: support.supported ? renderStrategy : '',
                onScreen: snapshot.visible,
                screenState: snapshot.visible ? 'visible' : 'hidden',
                visible: snapshot.visible,
                metadata: {
                    sourceKind: snapshot.kind,
                    presentationSupported: support.supported,
                    presentationReason: support.reason,
                },
            };
        }
        function requestTranslation(record: PixiTextRecord, prepared: PreparedTextSource): void {
            if (!record.support.supported || !prepared.translationSource)
                return;
            try {
                callContract('requestItemTranslation', [
                    record,
                    {
                        priority: record.snapshot.visible ? visiblePriority : hiddenPriority,
                        renderStrategy,
                        sourceKind: record.snapshot.kind,
                        metadata: { sourceId: record.sourceId, revision: record.snapshot.revision },
                    },
                ]);
            }
            catch (error) {
                log('warn', '[PIXI Text] Translation request failed.', error);
            }
        }
        function observeRecord(record: PixiTextRecord, eventType: string): boolean {
            const prepared = prepareText(record.snapshot);
            if (!prepared)
                return false;
            record.support = describeSupport(record.snapshot);
            let observed: unknown;
            try {
                observed = callContract('observeRecord', [
                    record,
                    createPayload(record.snapshot, prepared, record.support),
                    {
                        eventType,
                        details: {
                            sourceKind: record.snapshot.kind,
                            presentationSupported: record.support.supported,
                            presentationReason: record.support.reason,
                        },
                    },
                ]);
            }
            catch (error) {
                log('warn', '[PIXI Text] TextCore observation failed.', error);
                return false;
            }
            const itemId = nonemptyString(readProperty(observed, 'id'));
            if (!itemId)
                return false;
            if (record.itemId && record.itemId !== itemId)
                mutableRecordsByItemId.delete(record.itemId);
            record.itemId = itemId;
            mutableRecordsByItemId.set(itemId, record);
            requestTranslation(record, prepared);
            return true;
        }
        function enterSnapshot(snapshot: PixiTextSourceSnapshot): void {
            let record = recordsBySource.get(snapshot.source);
            if (!record) {
                record = {
                    sourceId: snapshot.sourceId,
                    source: snapshot.source,
                    snapshot,
                    itemId: '',
                    active: true,
                    support: describeSupport(snapshot),
                    commands: new Map(),
                    appliedCommandId: '',
                };
                recordsBySource.set(snapshot.source, record);
                recordsBySourceId.set(snapshot.sourceId, record);
            }
            else {
                record.snapshot = snapshot;
                record.active = true;
                recordsBySourceId.set(snapshot.sourceId, record);
                if (record.itemId)
                    mutableRecordsByItemId.set(record.itemId, record);
            }
            observeRecord(record, 'item.observed');
        }
        function applySourceChange(record: PixiTextRecord, change: PixiTextSourceChange): void {
            presentationAuthority.withdraw(record.source, 'pixi-source-replaced');
            record.snapshot = change.current;
            record.appliedCommandId = '';
            observeRecord(record, change.kindChanged ? 'item.source_kind_changed' : 'item.source_changed');
        }
        function applyVisibilityChange(record: PixiTextRecord, change: PixiTextSourceChange): void {
            record.snapshot = change.current;
            try {
                callContract('setItemVisibility', [
                    record,
                    change.current.visible,
                    {
                        reason: change.current.visible ? 'pixi-text-visible' : 'pixi-text-hidden',
                        frameId: change.current.frameId,
                    },
                ]);
                callContract('setItemTranslationPriority', [
                    record,
                    change.current.visible ? visiblePriority : hiddenPriority,
                    change.current.visible ? 'pixi-text-visible' : 'pixi-text-hidden',
                ]);
            }
            catch (error) {
                log('warn', '[PIXI Text] Visibility publication failed.', error);
            }
        }
        function departSnapshot(snapshot: PixiTextSourceSnapshot): void {
            const record = recordsBySource.get(snapshot.source);
            if (!record)
                return;
            if (!record.active)
                return;
            record.active = false;
            presentationAuthority.withdraw(record.source, 'pixi-source-departed');
            try {
                callContract('retireItem', [
                    record,
                    'disappeared',
                    {
                        eventType: 'item.disappeared',
                        details: { reason: 'pixi-source-departed', frameId: snapshot.frameId },
                    },
                ]);
            }
            catch (error) {
                log('warn', '[PIXI Text] Source retirement failed.', error);
            }
            if (record.itemId)
                mutableRecordsByItemId.delete(record.itemId);
            recordsBySourceId.delete(record.sourceId);
        }
        function supportChanged(left: PixiCanvasTextSourceSupport, right: PixiCanvasTextSourceSupport): boolean {
            return left.supported !== right.supported || left.reason !== right.reason;
        }
        function reconcilePresentationCapabilities(): void {
            for (const record of recordsBySourceId.values()) {
                if (!record.active)
                    continue;
                const next = describeSupport(record.snapshot);
                if (!supportChanged(record.support, next))
                    continue;
                if (!next.supported)
                    presentationAuthority.withdraw(record.source, next.reason);
                record.support = next;
                observeRecord(record, 'item.presentation_capability_changed');
            }
        }
        function notifyCommand(record: PixiTextRecord, state: PixiRenderCommandState): void {
            if (state.settled || state.status === 'awaiting-paint' || state.lastNotificationFrame === currentFrameId)
                return;
            state.lastNotificationFrame = currentFrameId;
            try {
                callContract('notifyRenderCommandReady', [
                    state.commandId,
                    {
                        reason: state.reason,
                        sourceId: record.sourceId,
                        generation: state.generation,
                    },
                ]);
            }
            catch (error) {
                log('warn', '[PIXI Text] Render readiness notification failed.', error);
            }
        }
        function flushCommandNotifications(): void {
            for (const record of recordsBySourceId.values()) {
                for (const state of record.commands.values())
                    notifyCommand(record, state);
            }
        }
        function scan(root: unknown, frameId: unknown): PixiTextFrameResult {
            if (shutdownStarted)
                return frameObserver.scan(null, frameId);
            const result = frameObserver.scan(root, frameId);
            if (result.status !== 'reconciled')
                return result;
            currentFrameId = result.frameId;
            for (const snapshot of result.entered)
                enterSnapshot(snapshot);
            for (const change of result.changed) {
                const record = recordsBySource.get(change.current.source);
                if (!record) {
                    enterSnapshot(change.current);
                    continue;
                }
                if (change.sourceChanged || change.kindChanged)
                    applySourceChange(record, change);
                else if (change.visibilityChanged)
                    applyVisibilityChange(record, change);
            }
            for (const snapshot of result.departed)
                departSnapshot(snapshot);
            reconcilePresentationCapabilities();
            flushCommandNotifications();
            return result;
        }
        function commandDecision(status: 'committed' | 'deferred' | 'rejected', state: PixiRenderCommandState, record: PixiTextRecord): Readonly<PropertySource> {
            return freezeDecision({
                status,
                reason: state.reason,
                commandId: state.commandId,
                strategy: renderStrategy,
                details: {
                    sourceId: record.sourceId,
                    revision: record.snapshot.revision,
                    ownedPresentation: true,
                    ...(status === 'deferred'
                        ? { resumeWhen: { kind: 'adapter-signal', commandId: state.commandId } }
                        : {}),
                },
                ...(status === 'deferred'
                    ? { resumeWhen: { kind: 'adapter-signal', commandId: state.commandId } }
                    : {}),
            });
        }
        function onRenderCommandReady(recordValue: unknown, commandValue: unknown): Readonly<PropertySource> {
            const record = isPropertySource(recordValue) ? (recordValue as unknown as PixiTextRecord) : null;
            const commandId = nonemptyString(readProperty(commandValue, 'commandId'));
            const generation = Number(readProperty(commandValue, 'generation')) || 0;
            const target = readProperty(commandValue, 'text');
            if (!record?.active || !commandId || typeof target !== 'string') {
                return freezeDecision({ status: 'rejected', reason: 'pixi-render-command-invalid' });
            }
            const existing = record.commands.get(commandId);
            if (existing) {
                if (existing.status === 'painted') {
                    existing.reason = 'pixi-owned-paint-committed';
                    return commandDecision('committed', existing, record);
                }
                if (existing.status === 'rejected')
                    return commandDecision('rejected', existing, record);
                return commandDecision('deferred', existing, record);
            }
            if (!record.support.supported || generation !== record.snapshot.revision) {
                return freezeDecision({
                    status: 'rejected',
                    reason: !record.support.supported ? record.support.reason : 'pixi-render-generation-stale',
                });
            }
            const admission = presentationAuthority.prepare({
                commandId,
                sourceId: record.sourceId,
                source: record.source,
                sourceText: record.snapshot.text,
                revision: record.snapshot.revision,
                target,
            });
            if (admission.status !== 'prepared') {
                return freezeDecision({ status: 'rejected', reason: admission.reason });
            }
            const state: PixiRenderCommandState = {
                commandId,
                generation,
                status: 'awaiting-paint',
                reason: 'pixi-owned-paint-pending',
                settled: false,
                lastNotificationFrame: -1,
            };
            record.commands.set(commandId, state);
            return commandDecision('deferred', state, record);
        }
        function onRenderSettled(recordValue: unknown, decisionValue: unknown, routeValue: unknown): void {
            const record = isPropertySource(recordValue) ? (recordValue as unknown as PixiTextRecord) : null;
            const commandId = nonemptyString(readProperty(routeValue, 'commandId'), readProperty(decisionValue, 'commandId'));
            if (!record)
                return;
            const state = record.commands.get(commandId);
            if (!state)
                return;
            state.settled = true;
            if (readProperty(decisionValue, 'status') === 'committed')
                record.appliedCommandId = commandId;
            record.commands.delete(commandId);
        }
        function onRenderRejected(recordValue: unknown, decisionValue: unknown, routeValue: unknown): void {
            const record = isPropertySource(recordValue) ? (recordValue as unknown as PixiTextRecord) : null;
            const commandId = nonemptyString(readProperty(routeValue, 'commandId'), readProperty(decisionValue, 'commandId'));
            if (!record)
                return;
            const state = record.commands.get(commandId);
            if (state) {
                state.settled = true;
                record.commands.delete(commandId);
            }
            if (record.appliedCommandId === commandId)
                record.appliedCommandId = '';
        }
        function getRenderGeneration(recordValue: unknown): number {
            return (recordValue as PixiTextRecord | null)?.snapshot.revision ?? 0;
        }
        function isRenderTargetCurrent(recordValue: unknown, commandValue: unknown): boolean {
            const record = recordValue as PixiTextRecord | null;
            return (record?.active === true &&
                nonemptyString(readProperty(commandValue, 'targetSurfaceId'), readProperty(commandValue, 'surfaceId')) === record.sourceId);
        }
        function installSubscription(): (() => unknown) | null {
            if (shutdownStarted)
                return null;
            if (subscriptionRelease)
                return subscriptionRelease;
            const release = callContract('subscribeRecords', [
                {
                    token: renderStrategy,
                    records: mutableRecordsByItemId,
                    renderStrategy,
                    getRenderGeneration,
                    isRenderTargetCurrent,
                    onRenderCommandReady,
                    onRenderRejected,
                    onRenderSettled,
                },
            ]);
            subscriptionRelease = typeof release === 'function' ? (release as () => unknown) : null;
            return subscriptionRelease;
        }
        function handlePresentationPainted(event: PixiTextPresentationEvent): void {
            const record = recordsBySourceId.get(event.request.sourceId);
            const state = record?.commands.get(event.request.commandId);
            if (!record || !state || state.settled || state.generation !== event.request.revision)
                return;
            state.status = 'painted';
            state.reason = 'pixi-owned-paint-ready';
            state.lastNotificationFrame = -1;
            notifyCommand(record, state);
        }
        function handlePresentationRejected(event: PixiTextPresentationEvent): void {
            const record = recordsBySourceId.get(event.request.sourceId) ?? recordsBySource.get(event.request.source);
            if (!record)
                return;
            const state = record.commands.get(event.request.commandId);
            if (state && !state.settled) {
                state.status = 'rejected';
                state.reason = event.reason;
                state.lastNotificationFrame = -1;
                notifyCommand(record, state);
                return;
            }
            if (record.appliedCommandId === event.request.commandId) {
                record.appliedCommandId = '';
                try {
                    callContract('invalidateRenderTarget', [
                        record,
                        {
                            reason: event.reason,
                            sourceId: record.sourceId,
                            generation: record.snapshot.revision,
                        },
                    ]);
                }
                catch (error) {
                    log('warn', '[PIXI Text] Applied presentation invalidation failed.', error);
                }
            }
        }
        function dispose(reasonValue: unknown = 'pixi-adapter-disposed'): boolean {
            const reason = nonemptyString(reasonValue, 'pixi-adapter-disposed');
            if (!shutdownStarted) {
                shutdownStarted = true;
                presentationAuthority.dispose(reason);
                const departed = frameObserver.retireAll(currentFrameId + 1);
                for (const snapshot of departed)
                    departSnapshot(snapshot);
            }
            let released = true;
            if (subscriptionRelease) {
                try {
                    released = subscriptionRelease() !== false;
                }
                catch {
                    released = false;
                }
            }
            if (released)
                subscriptionRelease = null;
            return released;
        }
        return bridgeFreeze({
            recordsByItemId: mutableRecordsByItemId,
            scan,
            handlePresentationPainted,
            handlePresentationRejected,
            installSubscription,
            dispose,
        });
    }
    return bridgeFreeze({ create });
}
