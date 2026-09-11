import type { TranslationManagerControllerFacades } from './controller-facades.js';
import { preservesTranslationMarkers } from '../translation-text-codec.js';
import type { TranslatorExchange } from '../text-record-types.js';
import type { TranslationManagerHandlesModule, TranslationRequestHandle } from './handles.js';
type RuntimeFunction = (this: unknown, ...args: unknown[]) => unknown;
type FalsySensitiveValue = string | number | boolean | bigint | symbol | object | null | undefined;
interface RuntimeObjectCandidate {
    assign(target: unknown, ...sources: unknown[]): unknown;
}
interface TranslationManagerRequestsRuntimeScopeCandidate {
    readonly Object: RuntimeObjectCandidate;
}
interface TranslationManagerRequestsDiagnosticsCandidate {
    increment(name: unknown): unknown;
    recordLazy(type: unknown, detailsFactory: () => unknown): unknown;
    flush(): unknown;
}
interface TranslationManagerRequestsScopeCandidate {
    readonly OVERRIDE_REGEX_SETTING: unknown;
    readonly normalizeCacheKey: RuntimeFunction;
    readonly createImmediateHandle: TranslationManagerHandlesModule['createImmediateHandle'];
    readonly preview: RuntimeFunction;
    readonly controllerFacades: Pick<TranslationManagerControllerFacades, 'eligibility' | 'handoff' | 'queue'>;
    readonly translationDiagnostics: TranslationManagerRequestsDiagnosticsCandidate;
}
interface TranslationManagerNormalizedRequestCandidate {
    readonly normalized: unknown;
    readonly hook: unknown;
    readonly source: unknown;
    readonly priority: unknown;
    readonly streamRequested: unknown;
    readonly stream: unknown;
    readonly timeoutMs: unknown;
    readonly onDelta: unknown;
    readonly onTranslatorExchange?: unknown;
    readonly recordId: unknown;
    readonly metadata: unknown;
    readonly signal: unknown;
}
interface TranslationManagerOverrideCandidate {
    readonly translation: unknown;
    readonly regex: unknown;
    readonly regexIndex: unknown;
}
interface TranslationManagerSkipCandidate {
    readonly skip: unknown;
    readonly reason: unknown;
}
interface TranslationManagerRequestJobCandidate {
    readonly id: unknown;
    readonly key: unknown;
    readonly text: unknown;
    readonly providerInputChanged: unknown;
    readonly status: unknown;
    readonly effectivePriority: unknown;
    readonly stream: unknown;
    readonly hook: unknown;
}
interface TranslationManagerRequestHandoffObservationCandidate {
    readonly kind: 'new' | 'join' | 'stream-upgrade' | 'canceled-before-publication';
    readonly key: unknown;
    readonly jobId: unknown;
    readonly subscriberId: unknown;
    readonly upgradedFromJobId: unknown;
}
interface TranslationManagerRequestHandoffResultCandidate {
    readonly handle: TranslationRequestHandle;
    readonly job: TranslationManagerRequestJobCandidate;
    readonly observation: TranslationManagerRequestHandoffObservationCandidate;
    readonly needsPump: unknown;
}
interface LengthCandidate {
    readonly length: unknown;
}
export interface TranslationRequestBatchEntry {
    readonly input: unknown;
    readonly options?: unknown;
}
export interface AcceptedTranslationRequestBatchAdmission {
    readonly kind: 'accepted';
    readonly handle: TranslationRequestHandle;
    readonly immediateValue?: unknown;
}
export interface RejectedTranslationRequestBatchAdmission {
    readonly kind: 'rejected';
    readonly reason: unknown;
}
export interface NoTranslationRequestBatchAdmission {
    readonly kind: 'no-translation';
    readonly handle: TranslationRequestHandle;
    readonly reason: unknown;
}
export type TranslationRequestBatchAdmission = AcceptedTranslationRequestBatchAdmission | NoTranslationRequestBatchAdmission | RejectedTranslationRequestBatchAdmission;
interface CapturedTranslationRequestBatchEntry {
    readonly input: unknown;
    readonly options: unknown;
}
interface PreparedTranslationRequestBatchEntry {
    readonly kind: 'prepared';
    readonly request: TranslationManagerNormalizedRequestCandidate;
}
type TranslationRequestBatchPreparation = PreparedTranslationRequestBatchEntry | RejectedTranslationRequestBatchAdmission;
export interface TranslationManagerRequestsController {
    lookup(normalized: unknown): unknown;
    request(input: unknown, maybeOptions?: unknown): TranslationRequestHandle;
    requestBatch(entries: unknown): readonly TranslationRequestBatchAdmission[];
}
type TranslationManagerRequestsControllerFactory = (scope?: unknown) => TranslationManagerRequestsController;
export interface TranslationManagerRequestsModule {
    create: TranslationManagerRequestsControllerFactory;
}
const requestsControllerFactories = new WeakMap<object, TranslationManagerRequestsControllerFactory>();
function isObjectLike(value: unknown): value is object {
    return (typeof value === 'object' && value !== null) || typeof value === 'function';
}
function createRealmRequestsControllerFactory(runtimeScope: object): TranslationManagerRequestsControllerFactory {
    const runtime = runtimeScope as TranslationManagerRequestsRuntimeScopeCandidate;
    function createController(scope: unknown = {}): TranslationManagerRequestsController {
        const source = scope as TranslationManagerRequestsScopeCandidate;
        const { OVERRIDE_REGEX_SETTING, normalizeCacheKey, createImmediateHandle, preview } = source;
        const { describeIgnoreTranslationRegex, describeSkip, logTranslationEvent, normalizeRequest, requestContext, lookupCompleted, lookupOverrideTranslationRegex, } = source.controllerFacades.eligibility;
        const { handoffProviderRequest } = source.controllerFacades.handoff;
        const { schedulePump } = source.controllerFacades.queue;
        function observe(operation: () => unknown): void {
            try {
                operation();
            }
            catch {
            }
        }
        function captureNormalizedRequest(value: unknown): TranslationManagerNormalizedRequestCandidate {
            if (!isObjectLike(value)) {
                throw new TypeError('[TranslationService] Request normalization must return an object.');
            }
            const candidate = value as TranslationManagerNormalizedRequestCandidate;
            return Object.freeze({
                normalized: candidate.normalized,
                hook: candidate.hook,
                source: candidate.source,
                priority: candidate.priority,
                streamRequested: candidate.streamRequested,
                stream: candidate.stream,
                timeoutMs: candidate.timeoutMs,
                onDelta: candidate.onDelta,
                onTranslatorExchange: candidate.onTranslatorExchange,
                recordId: candidate.recordId,
                metadata: candidate.metadata,
                signal: candidate.signal,
            });
        }
        function captureContext(request: TranslationManagerNormalizedRequestCandidate): unknown {
            try {
                return requestContext(request);
            }
            catch {
                return {};
            }
        }
        function lookup(normalized: unknown): unknown {
            const key = normalizeCacheKey(normalized);
            const keyValue = key as FalsySensitiveValue;
            if (!keyValue)
                return null;
            const override = lookupOverrideTranslationRegex(key);
            const overrideValue = override as FalsySensitiveValue;
            if (overrideValue) {
                return {
                    source: OVERRIDE_REGEX_SETTING,
                    sourceHint: OVERRIDE_REGEX_SETTING,
                    translation: (override as TranslationManagerOverrideCandidate).translation,
                };
            }
            const ignored = describeIgnoreTranslationRegex(key) as TranslationManagerSkipCandidate;
            if (ignored.skip)
                return null;
            const skipInfo = describeSkip(key) as TranslationManagerSkipCandidate;
            if (skipInfo.skip)
                return null;
            const cached = lookupCompleted(key);
            if (cached !== null)
                return { source: 'cache', sourceHint: 'cache', translation: cached };
            return null;
        }
        function createImmediateAdmission(result: unknown, request: TranslationManagerNormalizedRequestCandidate, sourceHint: unknown, status: 'completed' | 'skipped'): AcceptedTranslationRequestBatchAdmission {
            observe(() => {
                if (typeof request.onTranslatorExchange !== 'function' || typeof result !== 'string')
                    return;
                Reflect.apply(request.onTranslatorExchange, undefined, [
                    Object.freeze({
                        input: request.normalized,
                        output: result,
                        markerMismatch: !preservesTranslationMarkers(request.normalized as string, result),
                    }),
                ]);
            });
            return Object.freeze({
                kind: 'accepted',
                handle: createImmediateHandle(result, {
                    key: request.normalized,
                    status,
                    priority: request.priority,
                    sourceHint,
                }),
                immediateValue: result,
            });
        }
        function createNoTranslationAdmission(request: TranslationManagerNormalizedRequestCandidate, reason: unknown): NoTranslationRequestBatchAdmission {
            return Object.freeze({
                kind: 'no-translation',
                handle: createImmediateHandle(request.normalized, {
                    key: request.normalized,
                    status: 'skipped',
                    priority: request.priority,
                    sourceHint: 'filter',
                }),
                reason,
            });
        }
        function completeCacheHit(cached: unknown, request: TranslationManagerNormalizedRequestCandidate): AcceptedTranslationRequestBatchAdmission {
            const admission = createImmediateAdmission(cached, request, 'cache', 'completed');
            const context = captureContext(request);
            emitReceivedDiagnostics(request, context);
            observe(() => source.translationDiagnostics.increment('cacheHits'));
            observe(() => source.translationDiagnostics.recordLazy('request.cache_hit', () => ({
                hook: request.hook,
                recordId: request.recordId,
                textPreview: preview(request.normalized, 72),
            })));
            observe(() => {
                logTranslationEvent('cache_hit', request.normalized, cached, runtime.Object.assign({}, context, { source: 'cache' }));
            });
            return admission;
        }
        function emitReceivedDiagnostics(request: TranslationManagerNormalizedRequestCandidate, context: unknown): void {
            observe(() => source.translationDiagnostics.increment('requests'));
            observe(() => source.translationDiagnostics.recordLazy('request.received', () => ({
                hook: request.hook,
                source: request.source,
                priority: request.priority,
                streamRequested: request.streamRequested,
                stream: request.stream,
                recordId: request.recordId,
                textPreview: preview(request.normalized, 72),
                textLength: (request.normalized as LengthCandidate).length,
            })));
            observe(() => {
                logTranslationEvent('request', request.normalized, null, context);
            });
        }
        function emitSubscriberAdded(request: TranslationManagerNormalizedRequestCandidate, outcome: TranslationManagerRequestHandoffResultCandidate): void {
            const { job, observation } = outcome;
            observe(() => source.translationDiagnostics.recordLazy('subscriber.added', () => ({
                jobId: observation.jobId,
                subscriberId: observation.subscriberId,
                recordId: request.recordId,
                hook: request.hook,
                priority: request.priority,
                stream: request.stream === true,
                jobStatus: job.status,
            })));
        }
        function emitProviderDiagnostics(request: TranslationManagerNormalizedRequestCandidate, context: unknown, outcome: TranslationManagerRequestHandoffResultCandidate): void {
            const { observation, job } = outcome;
            emitReceivedDiagnostics(request, context);
            if (observation.kind === 'canceled-before-publication') {
                observe(() => source.translationDiagnostics.recordLazy('request.canceled_before_publication', () => ({
                    jobId: observation.jobId,
                    subscriberId: observation.subscriberId,
                    recordId: request.recordId,
                    hook: request.hook,
                })));
                observe(() => source.translationDiagnostics.flush());
                return;
            }
            emitSubscriberAdded(request, outcome);
            if (observation.kind === 'join') {
                observe(() => source.translationDiagnostics.increment('joined'));
                observe(() => source.translationDiagnostics.recordLazy('job.joined', () => ({
                    jobId: observation.jobId,
                    subscriberId: observation.subscriberId,
                    hook: request.hook,
                    recordId: request.recordId,
                    effectivePriority: job.effectivePriority,
                    stream: job.stream,
                })));
            }
            else {
                observe(() => source.translationDiagnostics.increment('queued'));
                observe(() => source.translationDiagnostics.recordLazy('job.queued', () => ({
                    jobId: observation.jobId,
                    hook: job.hook,
                    priority: job.effectivePriority,
                    stream: job.stream,
                    textPreview: preview(job.key, 72),
                    providerTextPreview: job.providerInputChanged ? preview(job.text, 72) : '',
                })));
                if (observation.kind === 'stream-upgrade') {
                    observe(() => source.translationDiagnostics.recordLazy('job.stream_upgrade_queued', () => ({
                        jobId: observation.jobId,
                        upgradedFromJobId: observation.upgradedFromJobId,
                        hook: request.hook,
                        recordId: request.recordId,
                        priority: request.priority,
                        textPreview: preview(request.normalized, 72),
                    })));
                }
                observe(() => {
                    logTranslationEvent('cache_miss', request.normalized, null, runtime.Object.assign({}, context, { source: 'provider' }));
                });
            }
            observe(() => source.translationDiagnostics.flush());
        }
        function admitNormalizedRequest(normalizedRequest: TranslationManagerNormalizedRequestCandidate, requestProviderPump: () => void): AcceptedTranslationRequestBatchAdmission | NoTranslationRequestBatchAdmission {
            const overrideValue = lookupOverrideTranslationRegex(normalizedRequest.normalized);
            if (overrideValue as FalsySensitiveValue) {
                const override = overrideValue as TranslationManagerOverrideCandidate;
                const translation = override.translation;
                const admission = createImmediateAdmission(translation, normalizedRequest, OVERRIDE_REGEX_SETTING, 'completed');
                const context = captureContext(normalizedRequest);
                emitReceivedDiagnostics(normalizedRequest, context);
                observe(() => source.translationDiagnostics.increment('overrideHits'));
                observe(() => source.translationDiagnostics.recordLazy('request.override', () => ({
                    hook: normalizedRequest.hook,
                    recordId: normalizedRequest.recordId,
                    source: OVERRIDE_REGEX_SETTING,
                    regex: override.regex,
                    regexIndex: override.regexIndex,
                    textPreview: preview(normalizedRequest.normalized, 72),
                })));
                observe(() => {
                    logTranslationEvent('override', normalizedRequest.normalized, translation, runtime.Object.assign({}, context, override, {
                        source: OVERRIDE_REGEX_SETTING,
                        sourceHint: OVERRIDE_REGEX_SETTING,
                    }));
                });
                return admission;
            }
            const ignored = describeIgnoreTranslationRegex(normalizedRequest.normalized) as TranslationManagerSkipCandidate;
            if (ignored.skip) {
                const ignoredReason = ignored.reason;
                const reason = (ignoredReason as boolean) ? ignoredReason : 'translation filter';
                const admission = createNoTranslationAdmission(normalizedRequest, reason);
                const context = captureContext(normalizedRequest);
                emitSkipDiagnostics(normalizedRequest, context, ignored, reason);
                return admission;
            }
            const skipInfo = describeSkip(normalizedRequest.normalized) as TranslationManagerSkipCandidate;
            if (skipInfo.skip) {
                const skipReason = skipInfo.reason;
                const reason = (skipReason as boolean) ? skipReason : 'translation filter';
                const admission = createNoTranslationAdmission(normalizedRequest, reason);
                const context = captureContext(normalizedRequest);
                emitSkipDiagnostics(normalizedRequest, context, skipInfo, reason);
                return admission;
            }
            const cached = lookupCompleted(normalizedRequest.normalized);
            if (cached !== null) {
                return completeCacheHit(cached, normalizedRequest);
            }
            return requestFromProvider(normalizedRequest, requestProviderPump);
        }
        function requestFromProvider(normalizedRequest: TranslationManagerNormalizedRequestCandidate, requestProviderPump: () => void): AcceptedTranslationRequestBatchAdmission {
            const context = captureContext(normalizedRequest);
            const outcome = handoffProviderRequest(normalizedRequest, context) as TranslationManagerRequestHandoffResultCandidate;
            observe(() => {
                if (typeof normalizedRequest.onTranslatorExchange !== 'function')
                    return;
                const job = outcome.job as typeof outcome.job & {
                    translatorExchange?: TranslatorExchange;
                };
                const exchange = job.translatorExchange ??
                    Object.freeze({
                        input: job.text,
                        output: null,
                        markerMismatch: false,
                    });
                Reflect.apply(normalizedRequest.onTranslatorExchange, undefined, [exchange]);
            });
            if (outcome.needsPump)
                observe(() => {
                    requestProviderPump();
                });
            emitProviderDiagnostics(normalizedRequest, context, outcome);
            return Object.freeze({ kind: 'accepted', handle: outcome.handle });
        }
        function scheduleProviderPump(): void {
            schedulePump();
        }
        function request(input: unknown, maybeOptions: unknown = {}): TranslationRequestHandle {
            const normalizedRequest = captureNormalizedRequest(normalizeRequest(input, maybeOptions));
            return admitNormalizedRequest(normalizedRequest, scheduleProviderPump).handle;
        }
        function captureBatchEntry(entry: unknown): CapturedTranslationRequestBatchEntry {
            if (!isObjectLike(entry)) {
                throw new TypeError('[TranslationService] A translation request batch entry must be an object.');
            }
            const candidate = entry as TranslationRequestBatchEntry;
            return Object.freeze({ input: candidate.input, options: candidate.options });
        }
        function rejectBatchAdmission(reason: unknown): RejectedTranslationRequestBatchAdmission {
            return Object.freeze({ kind: 'rejected', reason });
        }
        function requestBatch(entries: unknown): readonly TranslationRequestBatchAdmission[] {
            if (!Array.isArray(entries)) {
                throw new TypeError('[TranslationService] Translation request batch must be an array.');
            }
            const captured: (CapturedTranslationRequestBatchEntry | RejectedTranslationRequestBatchAdmission)[] = [];
            const entryCount = entries.length;
            for (let index = 0; index < entryCount; index += 1) {
                try {
                    captured.push(captureBatchEntry(entries[index]));
                }
                catch (error) {
                    captured.push(rejectBatchAdmission(error));
                }
            }
            const prepared: TranslationRequestBatchPreparation[] = [];
            for (const entry of captured) {
                if ('kind' in entry) {
                    prepared.push(entry);
                    continue;
                }
                try {
                    prepared.push(Object.freeze({
                        kind: 'prepared',
                        request: captureNormalizedRequest(normalizeRequest(entry.input, entry.options)),
                    }));
                }
                catch (error) {
                    prepared.push(rejectBatchAdmission(error));
                }
            }
            const providerPumpRequest = { requested: false };
            const requestProviderPump = (): void => {
                providerPumpRequest.requested = true;
            };
            const admissions: TranslationRequestBatchAdmission[] = [];
            for (const entry of prepared) {
                if (entry.kind === 'rejected') {
                    admissions.push(entry);
                    continue;
                }
                try {
                    admissions.push(admitNormalizedRequest(entry.request, requestProviderPump));
                }
                catch (error) {
                    admissions.push(rejectBatchAdmission(error));
                }
            }
            if (providerPumpRequest.requested)
                observe(scheduleProviderPump);
            return Object.freeze(admissions);
        }
        function emitSkipDiagnostics(request: TranslationManagerNormalizedRequestCandidate, context: unknown, description: TranslationManagerSkipCandidate, reason: unknown): void {
            emitReceivedDiagnostics(request, context);
            observe(() => source.translationDiagnostics.increment('skipped'));
            observe(() => source.translationDiagnostics.recordLazy('request.skipped', () => ({
                hook: request.hook,
                recordId: request.recordId,
                reason,
                source: 'filter',
                textPreview: preview(request.normalized, 72),
            })));
            observe(() => {
                logTranslationEvent('skip', request.normalized, reason, runtime.Object.assign({}, context, description, {
                    source: 'filter',
                    skipReason: reason,
                }));
            });
        }
        return { lookup, request, requestBatch };
    }
    return createController;
}
export function createTranslationManagerRequestsModule(runtimeScope: object): TranslationManagerRequestsModule {
    let createController = requestsControllerFactories.get(runtimeScope);
    if (createController === undefined) {
        createController = createRealmRequestsControllerFactory(runtimeScope);
        requestsControllerFactories.set(runtimeScope, createController);
    }
    return { create: createController };
}
