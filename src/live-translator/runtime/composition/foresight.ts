import { createMessageProjection } from '../../foresight/projection.js';
import { createForesightLog } from './foresight-log.js';
import type { ForesightCandidate, ForesightStopSite } from '../../foresight/graph.js';
import { createForesightSources } from '../../foresight/source.js';
import { createForesightPosition } from '../../foresight/position.js';
import { own } from '../../foresight/commands.js';
import { createForesightScan } from '../../foresight/scan.js';
import type { SemanticAdapter, TextObservationRef } from '../../semantic-adapters/contract.js';
import type { SemanticTextRevisionHandle } from '../../stores/semantic-text-store.js';
import { encodeTranslationText, decodeTranslationText, type EncodedTranslationText, } from '../translation-text-codec.js';
import type { TranslationManagerService } from '../translation-manager/manager.js';
import type { TranslationRequestHandle } from '../translation-manager/handles.js';
import type { ForesightView, ForesightPreparation } from '../../foresight/view.js';
import { DEFAULT_FORESIGHT_SETTINGS, normalizeForesightSettings, type ForesightSettings, } from '../../configuration/foresight.js';
export function foresightEnabled(settings: unknown): boolean {
    const adapters = own(settings, 'adapters');
    return (own(adapters, 'foresight') === true && own(adapters, 'window') === true && own(adapters, 'gameMessage') === true);
}
export function foresightSettings(settings: unknown): ForesightSettings {
    return normalizeForesightSettings(own(settings, 'foresight'));
}
interface Preparation {
    state: ForesightPreparation;
    translation: string | null;
    translationTruncated: boolean;
}
function retainTranslation(preparation: Preparation, encoded: EncodedTranslationText, value: string | null, snippet: number): void {
    const text = value === null ? null : (decodeTranslationText(encoded, value)?.text ?? null);
    preparation.translation = text?.slice(0, snippet) ?? null;
    preparation.translationTruncated = text !== null && text.length > snippet;
}
interface Delivery {
    complete: ((state: ForesightPreparation, translation: string | null) => void) | null;
}
interface Outstanding {
    readonly handle: TranslationRequestHandle;
    readonly delivery: Delivery;
}
async function settled(promise: Promise<unknown>, delivery: Delivery): Promise<void> {
    let state: ForesightPreparation, translation: string | null = null;
    try {
        const value = await promise;
        translation = typeof value === 'string' ? value : null;
        state = translation === null ? 'skipped' : 'ready';
    }
    catch {
        state = 'failed';
    }
    const complete = delivery.complete;
    delivery.complete = null;
    complete?.(state, translation);
}
export function createForesight(options: {
    readonly scope: object;
    readonly enabled: boolean;
    readonly settings?: ForesightSettings;
    readonly logger?: unknown;
    readonly adapters: readonly SemanticAdapter[];
    readonly requester: Pick<TranslationManagerService, 'requestBatch'>;
    readonly accepted: (source: TextObservationRef) => boolean;
    readonly changed?: () => void;
}) {
    if (!options.enabled ||
        !['window', 'game-message'].every((family) => options.adapters.some((adapter) => adapter.family === family)))
        return null;
    const log = createForesightLog(options.logger);
    const settings = options.settings ?? DEFAULT_FORESIGHT_SETTINGS;
    const { scan: limits, native: nativeLimits, projection: projectionLimits, view: viewLimits } = settings.limits;
    let loggedPhase: string | null = null;
    const position = createForesightPosition(options.scope, nativeLimits);
    const associations = new Map<SemanticTextRevisionHandle, readonly TextObservationRef[]>();
    const submitted = new Map<number, ReadonlySet<SemanticTextRevisionHandle>>();
    let root: object | null = null, source: TextObservationRef | null = null, selectedChoice: number | null = null;
    let scan: ReturnType<typeof createForesightScan> | null = null;
    let pending: ForesightCandidate | null = null;
    let projection: ReturnType<typeof createMessageProjection> | null = null;
    let nativeSource: ReturnType<typeof createForesightSources> | null = null;
    let requestSequence = 0;
    let outstanding: Outstanding | null = null;
    let disposed = false, preparing = false;
    const attempted = new Map<string, Preparation>();
    let preparations = new WeakMap<ForesightCandidate, Preparation>();
    let anchor: ForesightView['anchor'] = null, anchorId = 0, revision = 0, prepared = 0, failed = 0;
    let unavailable = position.hooks.length === 0;
    let waiting: ForesightView['waiting'] = 'no-submission';
    let cachedView: ForesightView | null = null;
    function changed(): void {
        if (disposed)
            return;
        cachedView = null;
        revision++;
        try {
            options.changed?.();
        }
        catch {
        }
    }
    function phase(): 'scanning' | 'projecting' | 'preparing' | 'complete' {
        if (!scan?.stats().done)
            return 'scanning';
        if (projection?.stats().state === 'building')
            return 'projecting';
        return pending !== null || !scan.exhausted() || outstanding !== null ? 'preparing' : 'complete';
    }
    function logState(event: 'start' | 'phase' | 'retire' | 'work'): void {
        if (anchor === null)
            return;
        const stats = scan?.stats() ?? null;
        const currentPhase = phase();
        if (event !== 'work')
            loggedPhase = currentPhase;
        log.state(event, {
            episode: anchor.id,
            textId: anchor.textId,
            index: anchor.index,
            phase: currentPhase,
            prepared,
            failed,
            outstanding: outstanding !== null,
            scan: stats === null ? null : { ...stats, lastStop: stopSite(stats.lastStop) },
            projection: projection?.stats() ?? null,
        });
    }
    function stopSite(site: ForesightStopSite | null) {
        return site === null
            ? null
            : Object.freeze({
                reason: site.reason,
                index: site.index,
                code: site.code,
                location: viewLocation(site),
            });
    }
    function viewLocation(value: {
        frame: number;
        index: number;
    }) {
        const location = nativeSource?.describe(scan?.locate(value) ?? null) ?? null;
        return location !== null && location.via.length <= viewLimits.pathDepth ? location : null;
    }
    function isDisposed(): boolean {
        return disposed;
    }
    function skip(candidate: ForesightCandidate): void {
        preparations.set(candidate, { state: 'skipped', translation: null, translationTruncated: false });
        changed();
    }
    function cancelQueued(): void {
        try {
            outstanding?.handle.cancel('Foresight anchor changed', { abortJob: true, onlyIfQueued: true });
        }
        catch {
        }
    }
    function clear(): void {
        const wasPresent = root !== null;
        if (wasPresent)
            logState('retire');
        loggedPhase = null;
        nativeSource = null;
        root = null;
        source = null;
        scan = null;
        projection = null;
        pending = null;
        attempted.clear();
        preparations = new WeakMap();
        cachedView = null;
        anchor = null;
        prepared = 0;
        failed = 0;
        cancelQueued();
        if (wasPresent)
            changed();
    }
    function retireUnseenAnchor(): void {
        if (anchor === null || source === null)
            return;
        for (const shown of submitted.values())
            for (const handle of shown)
                if (handle.textId === anchor.textId && associations.get(handle)?.includes(source))
                    return;
        waiting = 'no-submission';
        clear();
    }
    function isCurrentAnchor(id: number): boolean {
        return anchor?.id === id;
    }
    function prepare(): void {
        if (isDisposed() || unavailable || preparing)
            return;
        preparing = true;
        const beforeRevision = revision;
        try {
            const observations = new Map<TextObservationRef, number>();
            const shown = new Set([...submitted.values()].flatMap((handles) => [...handles]));
            for (const [handle, sources] of associations)
                if (shown.has(handle))
                    for (const token of sources)
                        if (options.accepted(token) && !observations.has(token))
                            observations.set(token, handle.textId);
            const current = position.select(observations.keys());
            const nextWaiting = current !== null ? null : observations.size === 0 ? 'no-submission' : 'origin-unavailable';
            if (waiting !== nextWaiting) {
                waiting = nextWaiting;
                changed();
            }
            if (current === null) {
                clear();
                return;
            }
            const textId = observations.get(current.source);
            if (textId === undefined) {
                clear();
                return;
            }
            if (root !== current.key ||
                source !== current.source ||
                selectedChoice !== current.selectedChoice ||
                anchor?.textId !== textId) {
                clear();
                root = current.key;
                source = current.source;
                selectedChoice = current.selectedChoice;
                anchor = Object.freeze({
                    id: ++anchorId,
                    textId,
                    index: current.messageIndex,
                });
                nativeSource = createForesightSources(options.scope, current.list, nativeLimits);
                scan = createForesightScan({
                    start: current.start,
                    length: current.list.length,
                    currentChoices: current.currentChoices,
                    selectedChoice,
                    limits,
                    messageUnits: nativeLimits.messageUnits,
                });
                logState('start');
                changed();
            }
            if (scan === null || nativeSource === null)
                return;
            const before = scan.stats().reads;
            scan.step(nativeSource.read, nativeSource.route, nativeSource.call);
            if (scan.stats().done) {
                projection ??= createMessageProjection(scan.graph(), projectionLimits, viewLimits);
                if (projection.step() > 0)
                    changed();
            }
            if (scan.stats().reads !== before)
                changed();
            let remaining = limits.slice - (scan.stats().reads - before);
            if (!scan.stats().done || outstanding !== null || (pending === null && scan.exhausted()))
                return;
            const preparingAnchor = anchorId;
            for (let work = 0; work < limits.drain && remaining > 0 && !isDisposed(); work++) {
                if (!isCurrentAnchor(preparingAnchor))
                    break;
                pending ??= scan.next();
                if (pending === null) {
                    if (scan.exhausted())
                        changed();
                    break;
                }
                const candidate = pending;
                const location = scan.locate(candidate);
                const reads = candidate.end - candidate.index + 1 + (location?.path.length ?? 0);
                if (reads > limits.slice) {
                    pending = null;
                    skip(candidate);
                    continue;
                }
                if (reads > remaining)
                    break;
                remaining -= reads;
                pending = null;
                if (location === null || !nativeSource.validate(candidate, location)) {
                    skip(candidate);
                    continue;
                }
                const encoded = encodeTranslationText({
                    sourceText: candidate.text,
                    styleEnds: [candidate.text.length],
                });
                if (!encoded.supported) {
                    skip(candidate);
                    continue;
                }
                const priority = candidate.choice === null && candidate.distance <= settings.prioritizedMessages
                    ? 1000 - candidate.distance
                    : Math.max(0, 200 - candidate.distance);
                const previous = attempted.get(encoded.text);
                if (previous !== undefined) {
                    preparations.set(candidate, previous);
                    changed();
                    continue;
                }
                const preparation: Preparation = { state: 'pending', translation: null, translationTruncated: false };
                attempted.set(encoded.text, preparation);
                preparations.set(candidate, preparation);
                const requestId = ++requestSequence;
                const admittedAnchor = anchorId;
                const requestLocation = nativeSource.describe(location);
                const requestUnits = candidate.text.length;
                const admission = options.requester.requestBatch([
                    {
                        input: encoded.text,
                        options: { hook: 'foresight', source: 'foresight', priority, stream: false },
                    },
                ])[0];
                if (admission?.kind !== 'accepted') {
                    preparation.state = admission?.kind === 'no-translation' ? 'skipped' : 'failed';
                    if (preparation.state === 'failed' && isCurrentAnchor(admittedAnchor))
                        failed++;
                    log.request('admission', {
                        episode: admittedAnchor,
                        requestId,
                        location: requestLocation,
                        units: requestUnits,
                        state: preparation.state,
                        immediate: false,
                    });
                    changed();
                    continue;
                }
                if ('immediateValue' in admission) {
                    preparation.state = typeof admission.immediateValue === 'string' ? 'ready' : 'skipped';
                    retainTranslation(preparation, encoded, typeof admission.immediateValue === 'string' ? admission.immediateValue : null, viewLimits.snippet);
                    if (preparation.state === 'ready' && isCurrentAnchor(admittedAnchor))
                        prepared++;
                    log.request('admission', {
                        episode: admittedAnchor,
                        requestId,
                        location: requestLocation,
                        units: requestUnits,
                        state: preparation.state,
                        immediate: true,
                    });
                    changed();
                    continue;
                }
                if (isDisposed()) {
                    admission.handle.cancel('Foresight disposed', { abortJob: true });
                    break;
                }
                const delivery: Delivery = { complete: null };
                const entry: Outstanding = { handle: admission.handle, delivery };
                outstanding = entry;
                log.request('admission', {
                    episode: admittedAnchor,
                    requestId,
                    location: requestLocation,
                    units: requestUnits,
                    state: 'pending',
                    immediate: false,
                });
                delivery.complete = (state, translation) => {
                    log.request('settled', {
                        episode: admittedAnchor,
                        requestId,
                        location: requestLocation,
                        units: requestUnits,
                        state,
                        immediate: false,
                    });
                    if (outstanding === entry)
                        outstanding = null;
                    if (isCurrentAnchor(admittedAnchor)) {
                        preparation.state = state;
                        retainTranslation(preparation, encoded, translation, viewLimits.snippet);
                        if (state === 'ready')
                            prepared++;
                        if (state === 'failed')
                            failed++;
                    }
                    changed();
                };
                changed();
                void settled(admission.handle.promise, delivery);
                if (!isCurrentAnchor(admittedAnchor))
                    cancelQueued();
                break;
            }
        }
        catch {
            disable();
        }
        finally {
            if (anchor !== null) {
                if (loggedPhase !== phase())
                    logState('phase');
                if (revision !== beforeRevision)
                    logState('work');
            }
            preparing = false;
        }
    }
    function disable(): void {
        position.dispose();
        unavailable = true;
        clear();
        associations.clear();
        submitted.clear();
        changed();
    }
    return Object.freeze({
        position,
        disable,
        associate(handle: SemanticTextRevisionHandle, sources: readonly TextObservationRef[]): void {
            if (disposed || unavailable)
                return;
            if (sources.length > 0)
                associations.set(handle, sources);
            else
                associations.delete(handle);
        },
        release(handles: readonly SemanticTextRevisionHandle[]): void {
            for (const handle of handles)
                associations.delete(handle);
            for (const [output, shown] of submitted) {
                const retained = new Set([...shown].filter((handle) => associations.has(handle)));
                if (retained.size === 0)
                    submitted.delete(output);
                else
                    submitted.set(output, retained);
            }
            retireUnseenAnchor();
        },
        observeSubmission(output: number, handles: ReadonlySet<SemanticTextRevisionHandle>): void {
            if (disposed || unavailable)
                return;
            if (handles.size === 0)
                submitted.delete(output);
            else
                submitted.set(output, new Set(handles));
            retireUnseenAnchor();
        },
        releaseOutput(output: number): void {
            submitted.delete(output);
            retireUnseenAnchor();
        },
        prepare,
        stats: () => scan?.stats() ?? null,
        snapshot(): ForesightView {
            if (cachedView !== null)
                return cachedView;
            const stats = scan?.stats() ?? null;
            cachedView = Object.freeze({
                revision,
                showSpoilers: settings.showSpoilers,
                limits: viewLimits,
                waiting: unavailable ? null : waiting,
                anchor,
                prepared,
                failed,
                outstanding: outstanding !== null,
                state: unavailable
                    ? 'unavailable'
                    : stats === null
                        ? 'waiting'
                        : !stats.done
                            ? 'scanning'
                            : pending !== null || !scan?.exhausted() || outstanding !== null
                                ? 'preparing'
                                : 'complete',
                stats: stats === null
                    ? null
                    : Object.freeze({
                        reads: stats.reads,
                        nodes: stats.nodes,
                        candidates: stats.candidates,
                        units: stats.units,
                        stops: Object.freeze(stats.stops),
                        lastStop: stopSite(stats.lastStop),
                    }),
                graph: projection?.view((candidate) => preparations.get(candidate) ?? {
                    state: 'unrequested',
                    translation: null,
                    translationTruncated: false,
                }, viewLocation) ??
                    (scan === null
                        ? null
                        : {
                            nodes: [
                                {
                                    id: 0,
                                    index: anchor?.index ?? 0,
                                    kind: 'root' as const,
                                    location: nativeSource?.describe({ source: 0, index: anchor?.index ?? 0, path: [] }) ??
                                        null,
                                    outcome: null,
                                    omittedNext: 0,
                                    arm: null,
                                    valid: true,
                                    next: [],
                                    texts: [],
                                    stops: [],
                                },
                            ],
                            truncated: false,
                            projection: null,
                        }) ??
                    Object.freeze({ nodes: Object.freeze([]), truncated: false, projection: null }),
            });
            return cachedView;
        },
        dispose(): void {
            disposed = true;
            position.dispose();
            if (outstanding !== null) {
                outstanding.delivery.complete = null;
                try {
                    outstanding.handle.cancel('Foresight disposed', { abortJob: true });
                }
                catch {
                }
                outstanding = null;
            }
            clear();
            associations.clear();
            submitted.clear();
        },
    });
}
