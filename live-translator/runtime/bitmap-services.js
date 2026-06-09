// Bitmap adapter capability service.
//
// Bitmap, window, and sprite adapters need to coordinate low-level bitmap
// replay, mutation, and fallback flush behavior. This runtime service keeps
// those cross-adapter surfaces explicit and facet-scoped instead of publishing
// them as process globals. It also owns the bitmap draw hub: Bitmap.drawText
// wrappers record compact draw units, and adapters consume finalized batches at
// frame or mutation boundaries.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.runtime) {
        globalScope.LiveTranslatorModules.runtime = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before runtime/bitmap-services.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before runtime/bitmap-services.js.');
    }
    const operationDiagnostics = requireRuntimeModule('runtime.operationDiagnostics');

    const REPLAY_REQUIRED_METHODS = [
        'ensureBitmapState',
        'nextDrawOrder',
        'collectReplayItems',
        'replayBitmapItems',
        'withBitmapReplay',
        'rectFromDimensions',
    ];
    const REPLAY_OPTIONAL_METHODS = [
        'getBitmapState',
        'isValidRect',
    ];

    function createBitmapServices(options = {}) {
        const logger = options.logger || console;
        const reportServiceError = operationDiagnostics.createOperationErrorReporter({
            component: 'BitmapServices',
            operationLabel: 'Bitmap service',
            metricBase: 'bitmapServices.error',
            domain: 'bitmap',
            perf: options.perf || null,
            logger,
        });
        const settings = options.settings && typeof options.settings === 'object' ? options.settings : {};
        const captureBitmapDrawState = typeof options.captureBitmapDrawState === 'function'
            ? options.captureBitmapDrawState
            : captureDefaultBitmapDrawState;
        let replayProvider = null;
        let fallbackFlush = null;
        let mutationPublisherCount = 0;
        const bitmapSubscribers = new WeakMap();
        const drawStates = new WeakMap();
        const drawRunContexts = new WeakMap();
        const renderGuardStates = new WeakMap();
        const deferredFlushes = new Map();
        const pendingDrawBitmaps = new Set();
        const drawBatchSubscribers = [];
        let nextDrawStateId = 0;
        let nextDrawUnitId = 0;
        let flushingDrawBatches = false;
        const maxDrawUnitsPerBitmap = readPositiveInteger(
            settings.bitmapDrawHub && settings.bitmapDrawHub.maxUnitsPerBitmap,
            8192
        );

        function warn(message, error) {
            if (!logger || typeof logger.warn !== 'function') return;
            try { logger.warn(message, error); } catch (_) {}
        }

        function perfCount(name, amount = 1) {
            const perf = options.perf;
            if (!perf || typeof perf.count !== 'function') return;
            try { perf.count(name, amount); } catch (_) {}
        }

        function perfTop(name, label, amount = 1) {
            const perf = options.perf;
            if (!perf || typeof perf.top !== 'function') return;
            try { perf.top(name, label, amount); } catch (_) {}
        }

        function freezeApi(api) {
            try { return Object.freeze(api); } catch (_) { return api; }
        }

        function normalizeReplayProvider(provider) {
            if (!provider || typeof provider !== 'object') return null;
            for (const methodName of REPLAY_REQUIRED_METHODS) {
                if (typeof provider[methodName] !== 'function') return null;
            }

            const normalized = {};
            REPLAY_REQUIRED_METHODS.concat(REPLAY_OPTIONAL_METHODS).forEach((methodName) => {
                const method = provider[methodName];
                if (typeof method !== 'function') return;
                normalized[methodName] = (...args) => method.apply(provider, args);
            });
            return freezeApi(normalized);
        }

        function registerReplayProvider(provider) {
            const normalized = normalizeReplayProvider(provider);
            if (!normalized) {
                warn('[BitmapServices] Ignoring invalid bitmap replay provider.');
                return () => {};
            }
            replayProvider = normalized;
            return () => {
                if (replayProvider === normalized) replayProvider = null;
            };
        }

        function hasReplayProvider() {
            return !!replayProvider;
        }

        function callReplayProvider(methodName, fallback, args) {
            const provider = replayProvider;
            const method = provider && provider[methodName];
            if (typeof method !== 'function') return fallback;
            try {
                return method(...args);
            } catch (error) {
                reportServiceError(`replay.${methodName}`, error);
                return fallback;
            }
        }

        function registerFallbackFlush(callback) {
            if (typeof callback !== 'function') {
                warn('[BitmapServices] Ignoring invalid bitmap fallback flush callback.');
                return () => {};
            }
            const registration = { callback };
            fallbackFlush = registration;
            return () => {
                if (fallbackFlush === registration) fallbackFlush = null;
            };
        }

        function flushBitmapFallback(reason) {
            const callback = fallbackFlush && fallbackFlush.callback;
            if (typeof callback !== 'function') return false;
            try {
                callback(reason);
                return true;
            } catch (error) {
                reportServiceError('fallbackFlush', error);
                return false;
            }
        }

        function registerMutationPublisher() {
            mutationPublisherCount += 1;
            let active = true;
            return () => {
                if (!active) return;
                active = false;
                mutationPublisherCount = Math.max(0, mutationPublisherCount - 1);
            };
        }

        function hasMutationPublisher() {
            return mutationPublisherCount > 0;
        }

        function watchBitmap(bitmap, handler) {
            if (!bitmap || typeof handler !== 'function') return () => {};
            let watchers = bitmapSubscribers.get(bitmap);
            if (!watchers) {
                watchers = new Set();
                bitmapSubscribers.set(bitmap, watchers);
            }
            watchers.add(handler);
            return () => {
                try {
                    watchers.delete(handler);
                    if (!watchers.size) bitmapSubscribers.delete(bitmap);
                } catch (error) {
                    reportServiceError('watchBitmap.unregister', error);
                }
            };
        }

        function hasMutationInterest(bitmap) {
            try {
                const direct = bitmap ? bitmapSubscribers.get(bitmap) : null;
                if (direct && direct.size) return true;
            } catch (error) {
                reportServiceError('hasMutationInterest', error);
            }
            return false;
        }

        function createDeferredFlushResult(status, input = {}) {
            const token = stringify(input.token || '');
            const reason = stringify(input.reason || status || 'deferred-flush');
            const source = stringify(input.source || 'bitmap-services');
            return {
                handled: status === 'scheduled' || status === 'already-scheduled',
                scheduled: status === 'scheduled',
                pending: status === 'scheduled' || status === 'already-scheduled',
                status,
                token,
                reason,
                source,
                mode: status === 'scheduled' || status === 'already-scheduled' ? 'deferred-timer' : '',
            };
        }

        function scheduleDeferredFlush(input = {}) {
            const request = input && typeof input === 'object' ? input : {};
            const token = stringify(request.token || '');
            const reason = stringify(request.reason || token || 'deferred-flush');
            const source = stringify(request.source || 'bitmap-services');
            const callback = typeof request.callback === 'function' ? request.callback : null;
            const resultInput = { token, reason, source };
            if (!token) return createDeferredFlushResult('missing-token', resultInput);
            if (!callback) return createDeferredFlushResult('missing-callback', resultInput);
            if (deferredFlushes.has(token)) {
                perfCount('bitmapServices.deferredFlush.coalesced');
                perfTop('bitmapServices.deferredFlush.source', source);
                return createDeferredFlushResult('already-scheduled', resultInput);
            }
            const setTimer = globalScope && typeof globalScope.setTimeout === 'function'
                ? globalScope.setTimeout.bind(globalScope)
                : null;
            if (!setTimer) {
                perfCount('bitmapServices.deferredFlush.unavailable');
                perfTop('bitmapServices.deferredFlush.source', source);
                return createDeferredFlushResult('timer-unavailable', resultInput);
            }

            const scheduled = { token, reason, source, callback, timerId: null };
            let timerCallbackError = null;
            const run = () => {
                if (deferredFlushes.get(token) !== scheduled) return;
                deferredFlushes.delete(token);
                try {
                    callback(reason);
                } catch (error) {
                    timerCallbackError = error;
                    throw error;
                }
            };
            deferredFlushes.set(token, scheduled);
            try {
                scheduled.timerId = setTimer(run, 0);
            } catch (error) {
                if (timerCallbackError === error) throw error;
                if (deferredFlushes.get(token) === scheduled) deferredFlushes.delete(token);
                reportServiceError('scheduleDeferredFlush', error);
                return createDeferredFlushResult('schedule-failed', resultInput);
            }
            perfCount('bitmapServices.deferredFlush.scheduled');
            perfTop('bitmapServices.deferredFlush.source', source);
            return createDeferredFlushResult('scheduled', resultInput);
        }

        function createRenderGuardState() {
            return {
                bitmapReplayDepth: 0,
                bitmapSkipDepth: 0,
                spriteTextReplayDepth: 0,
                windowPipelineDepth: 0,
                bitmapReplaySources: [],
                windowPipelineSources: [],
                activeRedrawEntries: [],
            };
        }

        function canStoreWeakState(bitmap) {
            const type = typeof bitmap;
            return bitmap !== null && (type === 'object' || type === 'function');
        }

        function canStoreRenderGuardState(bitmap) {
            return canStoreWeakState(bitmap);
        }

        function getOrCreateRenderGuardState(bitmap) {
            if (!canStoreRenderGuardState(bitmap)) return null;
            let state = renderGuardStates.get(bitmap);
            if (!state) {
                state = createRenderGuardState();
                renderGuardStates.set(bitmap, state);
            }
            return state;
        }

        function getRenderGuardRecord(bitmap) {
            if (!canStoreRenderGuardState(bitmap)) return null;
            return renderGuardStates.get(bitmap) || null;
        }

        function pruneRenderGuardState(bitmap, state) {
            if (!bitmap || !state) return;
            if (state.bitmapReplayDepth > 0
                || state.bitmapSkipDepth > 0
                || state.spriteTextReplayDepth > 0
                || state.windowPipelineDepth > 0
                || state.bitmapReplaySources.length
                || state.windowPipelineSources.length
                || state.activeRedrawEntries.length) {
                return;
            }
            renderGuardStates.delete(bitmap);
        }

        function normalizeRenderGuardInput(input = {}) {
            const source = input && typeof input === 'object' ? input : {};
            return {
                bitmapReplay: source.bitmapReplay === true,
                bitmapSkip: source.bitmapSkip === true,
                spriteTextReplay: source.spriteTextReplay === true,
                windowPipeline: source.windowPipeline === true,
                bitmapReplaySource: stringify(source.bitmapReplaySource || ''),
                windowPipelineSource: stringify(source.windowPipelineSource || ''),
            };
        }

        function enterRenderGuard(bitmap, input = {}) {
            if (!bitmap) return () => {};
            const guard = normalizeRenderGuardInput(input);
            const state = getOrCreateRenderGuardState(bitmap);
            if (!state) return () => {};
            if (guard.bitmapReplay) {
                state.bitmapReplayDepth += 1;
                state.bitmapReplaySources.push(guard.bitmapReplaySource || 'bitmap-replay');
            }
            if (guard.bitmapSkip) state.bitmapSkipDepth += 1;
            if (guard.spriteTextReplay) state.spriteTextReplayDepth += 1;
            if (guard.windowPipeline) {
                state.windowPipelineDepth += 1;
                state.windowPipelineSources.push(guard.windowPipelineSource || 'window-pipeline');
            }
            let active = true;
            return () => {
                if (!active) return;
                active = false;
                if (guard.bitmapReplay) {
                    state.bitmapReplayDepth = Math.max(0, state.bitmapReplayDepth - 1);
                    state.bitmapReplaySources.pop();
                }
                if (guard.bitmapSkip) state.bitmapSkipDepth = Math.max(0, state.bitmapSkipDepth - 1);
                if (guard.spriteTextReplay) state.spriteTextReplayDepth = Math.max(0, state.spriteTextReplayDepth - 1);
                if (guard.windowPipeline) {
                    state.windowPipelineDepth = Math.max(0, state.windowPipelineDepth - 1);
                    state.windowPipelineSources.pop();
                }
                pruneRenderGuardState(bitmap, state);
            };
        }

        function withRenderGuard(bitmap, input, callback) {
            if (typeof callback !== 'function') return undefined;
            const release = enterRenderGuard(bitmap, input);
            try {
                return callback();
            } finally {
                release();
            }
        }

        function withBitmapReplayGuard(bitmap, callback, source = 'bitmap-replay') {
            return withRenderGuard(bitmap, {
                bitmapReplay: true,
                bitmapReplaySource: source || 'bitmap-replay',
            }, callback);
        }

        function withBitmapSkipGuard(bitmap, callback) {
            return withRenderGuard(bitmap, { bitmapSkip: true }, callback);
        }

        function withSpriteTextReplayGuard(bitmap, callback) {
            return withRenderGuard(bitmap, { spriteTextReplay: true }, callback);
        }

        function withBitmapSkipAndSpriteReplayGuard(bitmap, callback) {
            return withRenderGuard(bitmap, {
                bitmapSkip: true,
                spriteTextReplay: true,
            }, callback);
        }

        function enterWindowPipelineGuard(bitmap, source = 'window-pipeline') {
            return enterRenderGuard(bitmap, {
                windowPipeline: true,
                windowPipelineSource: source || 'window-pipeline',
            });
        }

        function withWindowPipelineGuard(bitmap, callback, source = 'window-pipeline') {
            return withRenderGuard(bitmap, {
                windowPipeline: true,
                windowPipelineSource: source || 'window-pipeline',
            }, callback);
        }

        function withActiveRedrawEntry(bitmap, entry, callback) {
            if (typeof callback !== 'function') return undefined;
            if (!bitmap) return callback();
            const state = getOrCreateRenderGuardState(bitmap);
            if (!state) return callback();
            state.activeRedrawEntries.push(entry || null);
            try {
                return callback();
            } finally {
                state.activeRedrawEntries.pop();
                pruneRenderGuardState(bitmap, state);
            }
        }

        function getActiveRedrawEntry(bitmap) {
            const state = getRenderGuardRecord(bitmap);
            if (!state || !state.activeRedrawEntries.length) return null;
            return state.activeRedrawEntries[state.activeRedrawEntries.length - 1] || null;
        }

        function getRenderGuardState(bitmap) {
            const state = getRenderGuardRecord(bitmap);
            const replaySource = state && state.bitmapReplaySources.length
                ? state.bitmapReplaySources[state.bitmapReplaySources.length - 1]
                : '';
            const windowPipelineSource = state && state.windowPipelineSources.length
                ? state.windowPipelineSources[state.windowPipelineSources.length - 1]
                : '';
            return {
                bitmapReplayDepth: state ? state.bitmapReplayDepth : 0,
                bitmapSkipDepth: state ? state.bitmapSkipDepth : 0,
                spriteTextReplayDepth: state ? state.spriteTextReplayDepth : 0,
                windowPipelineDepth: state ? state.windowPipelineDepth : 0,
                bitmapReplaySource: replaySource || '',
                windowPipelineSource: windowPipelineSource || '',
                activeRedrawEntry: getActiveRedrawEntry(bitmap),
            };
        }

        function getRenderGuardReason(bitmap) {
            const state = getRenderGuardRecord(bitmap);
            if (!state) return '';
            if (state.bitmapReplayDepth > 0) {
                return state.bitmapReplaySources[state.bitmapReplaySources.length - 1] || 'bitmap-replay';
            }
            if (state.bitmapSkipDepth > 0) return 'bitmap-skip';
            if (state.spriteTextReplayDepth > 0) return 'sprite-text-replay';
            if (state.windowPipelineDepth > 0) {
                return state.windowPipelineSources[state.windowPipelineSources.length - 1] || 'window-pipeline';
            }
            return '';
        }

        function invokeMutationSubscriber(handler, bitmap, methodName, args) {
            if (typeof handler !== 'function') return;
            try {
                handler(bitmap, methodName, args.slice());
            } catch (error) {
                reportServiceError('mutationSubscriber', error);
            }
        }

        function publishMutation(bitmap, methodName, args = []) {
            if (!hasMutationInterest(bitmap)) return;
            const argsList = Array.isArray(args) ? args.slice() : [];
            let direct = null;
            try { direct = bitmap ? bitmapSubscribers.get(bitmap) : null; } catch (error) { reportServiceError('publishMutation.lookup', error); }
            Array.from(direct || []).forEach((subscription) => {
                invokeMutationSubscriber(subscription, bitmap, methodName, argsList);
            });
        }

        function ensureDrawState(bitmap) {
            if (!bitmap) return null;
            let state = drawStates.get(bitmap);
            if (!state) {
                state = {
                    id: `bdh-${(++nextDrawStateId).toString(36)}`,
                    bitmap,
                    units: [],
                    styleIds: new Map(),
                    styles: [],
                    order: 0,
                    droppedUnits: 0,
                };
                drawStates.set(bitmap, state);
            }
            if (!Array.isArray(state.units)) state.units = [];
            if (!Array.isArray(state.styles)) state.styles = [];
            if (!state.styleIds || typeof state.styleIds.get !== 'function') state.styleIds = new Map();
            return state;
        }

        function getDrawState(bitmap) {
            if (!bitmap) return null;
            try { return drawStates.get(bitmap) || null; } catch (error) { reportServiceError('getDrawState', error); return null; }
        }

        function enterDrawRunContext(bitmap, input = {}) {
            if (!canStoreWeakState(bitmap)) return () => {};
            const context = normalizeDrawRunContext(input);
            if (!context) return () => {};
            let stack = drawRunContexts.get(bitmap);
            if (!stack) {
                stack = [];
                drawRunContexts.set(bitmap, stack);
            }
            stack.push(context);
            let active = true;
            return () => {
                if (!active) return;
                active = false;
                const current = drawRunContexts.get(bitmap);
                if (!current) return;
                const index = current.lastIndexOf(context);
                if (index >= 0) current.splice(index, 1);
                if (!current.length) drawRunContexts.delete(bitmap);
            };
        }

        function getActiveDrawRunContext(bitmap) {
            if (!canStoreWeakState(bitmap)) return null;
            const stack = drawRunContexts.get(bitmap);
            const context = stack && stack.length ? stack[stack.length - 1] : null;
            return context || null;
        }

        function normalizeDrawRunContext(input = {}) {
            const source = input && typeof input === 'object' ? input : {};
            const type = stringify(source.type || source.kind || '');
            const runId = stringify(source.runId || source.id || source.normalCharacterRunId || '');
            if (!type || !runId) return null;
            const runInfo = source.runInfo && typeof source.runInfo === 'object'
                ? Object.assign({}, source.runInfo)
                : null;
            return {
                type,
                runId,
                runInfo,
            };
        }

        function recordDraw(bitmap, input = {}) {
            if (!bitmap || !input) return null;
            const text = stringify(input.text !== undefined ? input.text : input.rawText);
            if (!text) return null;
            const state = ensureDrawState(bitmap);
            if (!state) return null;
            if (state.units.length >= maxDrawUnitsPerBitmap) {
                state.droppedUnits += 1;
                pendingDrawBitmaps.add(bitmap);
                return null;
            }
            const methodName = stringify(input.methodName || 'drawText') || 'drawText';
            const style = internDrawStyle(state, bitmap, input.drawState);
            const drawRunContext = getActiveDrawRunContext(bitmap);
            const normalCharacterContext = drawRunContext && drawRunContext.type === 'normalCharacter'
                ? drawRunContext
                : null;
            const unit = {
                id: `bdu-${(++nextDrawUnitId).toString(36)}`,
                bitmap,
                methodName,
                text,
                x: finiteNumber(input.x, 0),
                y: finiteNumber(input.y, 0),
                maxWidth: finiteNumber(input.maxWidth, 0),
                lineHeight: positiveNumber(input.lineHeight, bitmap && bitmap.fontSize, 24),
                align: normalizeCanvasTextAlign(input.align),
                ownerType: stringify(input.ownerType || ''),
                normalCharacter: input.normalCharacter === true || !!normalCharacterContext,
                normalCharacterRunId: stringify(input.normalCharacterRunId || normalCharacterContext && normalCharacterContext.runId || ''),
                styleId: style.id,
                drawState: style.state,
                measuredWidth: nonNegativeNumber(input.measuredWidth, 0),
                backgroundPatch: input.backgroundPatch || null,
                fallbackBackgroundPatch: input.fallbackBackgroundPatch || null,
                order: ++state.order,
            };
            state.units.push(unit);
            pendingDrawBitmaps.add(bitmap);
            return unit;
        }

        function internDrawStyle(state, bitmap, explicitState) {
            const source = explicitState && typeof explicitState === 'object'
                ? explicitState
                : captureBitmapDrawState(bitmap);
            const snapshot = source && typeof source === 'object' ? source : {};
            const key = [
                snapshot.fontFace,
                snapshot.fontSize,
                snapshot.fontBold,
                snapshot.fontItalic,
                snapshot.textColor,
                snapshot.outlineColor,
                snapshot.outlineWidth,
            ].join('|');
            const existingId = state.styleIds.get(key);
            if (existingId) {
                const existing = state.styles[existingId - 1];
                if (existing) return existing;
            }
            const style = {
                id: state.styles.length + 1,
                key,
                state: copyDrawState(snapshot),
            };
            state.styles.push(style);
            state.styleIds.set(key, style.id);
            return style;
        }

        function subscribeDrawBatches(options = {}) {
            const source = typeof options === 'function' ? { onBatch: options } : (options || {});
            if (typeof source.onBatch !== 'function') {
                warn('[BitmapServices] Ignoring invalid bitmap draw batch subscriber.');
                return () => {};
            }
            const subscription = {
                onBatch: source.onBatch,
                adapterId: stringify(source.adapterId || source.id || 'bitmap'),
                priority: finiteNumber(source.priority, 1000),
                token: stringify(source.token || 'draw-batches'),
            };
            drawBatchSubscribers.push(subscription);
            drawBatchSubscribers.sort((left, right) => (left.priority || 0) - (right.priority || 0));
            return () => {
                const index = drawBatchSubscribers.indexOf(subscription);
                if (index >= 0) drawBatchSubscribers.splice(index, 1);
            };
        }

        function hasPendingDrawBatches(bitmap = null) {
            if (bitmap) {
                const state = getDrawState(bitmap);
                return !!(state && ((state.units && state.units.length) || state.droppedUnits > 0));
            }
            return pendingDrawBitmaps.size > 0;
        }

        function flushDrawBatches(reason = 'frame', targetBitmap = null, options = {}) {
            if (flushingDrawBatches) return 0;
            const flushOptions = normalizeDrawBatchFlushOptions(options);
            const targets = targetBitmap
                ? (hasPendingDrawBatches(targetBitmap) ? [targetBitmap] : [])
                : Array.from(pendingDrawBitmaps);
            if (!targets.length) return 0;
            flushingDrawBatches = true;
            let flushed = 0;
            try {
                targets.forEach((bitmap) => {
                    const state = getDrawState(bitmap);
                    if (!state || !Array.isArray(state.units) || (!state.units.length && !state.droppedUnits)) {
                        pendingDrawBitmaps.delete(bitmap);
                        return;
                    }
                    const units = state.units;
                    state.units = [];
                    const droppedUnits = state.droppedUnits || 0;
                    state.droppedUnits = 0;
                    pendingDrawBitmaps.delete(bitmap);
                    if (units.length) {
                        const batch = createDrawBatch(bitmap, state, units, reason, droppedUnits);
                        dispatchDrawBatch(batch, flushOptions);
                        if (flushOptions.keepUnconsumed) {
                            const remaining = batch.getUnconsumedUnits();
                            if (remaining.length) {
                                state.units = remaining.concat(Array.isArray(state.units) ? state.units : []);
                            }
                        }
                        flushed += units.length;
                    }
                    if ((state.units && state.units.length) || state.droppedUnits > 0) {
                        pendingDrawBitmaps.add(bitmap);
                    }
                });
            } finally {
                flushingDrawBatches = false;
            }
            return flushed;
        }

        function flushOwnerDrawBatches(reason = 'owner-claim', targetBitmap = null) {
            return flushDrawBatches(reason, targetBitmap, {
                maxPriority: 200,
                keepUnconsumed: true,
                phase: 'owner-claim',
            });
        }

        function normalizeDrawBatchFlushOptions(options = {}) {
            const source = options && typeof options === 'object' ? options : {};
            const maxPriority = Number(source.maxPriority);
            return {
                maxPriority: Number.isFinite(maxPriority) ? maxPriority : Infinity,
                keepUnconsumed: source.keepUnconsumed === true,
                phase: stringify(source.phase || ''),
            };
        }

        function createDrawBatch(bitmap, state, units, reason, droppedUnits) {
            const consumed = new Set();
            return {
                bitmap,
                state,
                units: units.slice(),
                reason: stringify(reason || 'frame'),
                droppedUnits: Math.max(0, Number(droppedUnits) || 0),
                consume(unit, adapterId = '') {
                    if (!unit) return false;
                    consumed.add(unit);
                    try { unit.consumedBy = stringify(adapterId || 'adapter'); } catch (_) {}
                    return true;
                },
                isConsumed(unit) {
                    return consumed.has(unit);
                },
                forEachUnconsumed(callback) {
                    if (typeof callback !== 'function') return 0;
                    let visited = 0;
                    units.forEach((unit) => {
                        if (consumed.has(unit)) return;
                        visited += 1;
                        callback(unit);
                    });
                    return visited;
                },
                getUnconsumedUnits() {
                    return units.filter((unit) => !consumed.has(unit));
                },
                consumedCount() {
                    return consumed.size;
                },
            };
        }

        function dispatchDrawBatch(batch, options = {}) {
            if (!batch || !batch.units || !batch.units.length) return;
            drawBatchSubscribers.slice().forEach((subscription) => {
                if (!subscription || typeof subscription.onBatch !== 'function') return;
                if (Number(subscription.priority) > options.maxPriority) return;
                try {
                    subscription.onBatch(batch, {
                        adapterId: subscription.adapterId,
                        priority: subscription.priority,
                        token: subscription.token,
                        phase: options.phase || '',
                    });
                } catch (error) {
                    reportServiceError('drawBatchSubscriber', error);
                }
            });
        }

        const bitmapFacet = freezeApi({
            registerReplayProvider,
            registerFallbackFlush,
            registerMutationPublisher,
            publishMutation,
            hasMutationInterest,
            getRenderGuardState,
            getRenderGuardReason,
            withBitmapReplayGuard,
            withBitmapSkipGuard,
            withSpriteTextReplayGuard,
            withBitmapSkipAndSpriteReplayGuard,
            enterWindowPipelineGuard,
            withWindowPipelineGuard,
            withActiveRedrawEntry,
            getActiveRedrawEntry,
            scheduleDeferredFlush,
            enterDrawRunContext,
            getActiveDrawRunContext,
            recordDraw,
            subscribeDrawBatches,
            flushDrawBatches,
            flushOwnerDrawBatches,
            hasPendingDrawBatches,
        });

        const windowReplayFacet = freezeApi({
            hasProvider: hasReplayProvider,
            ensureBitmapState(bitmap) {
                return callReplayProvider('ensureBitmapState', null, [bitmap]);
            },
            getBitmapState(bitmap) {
                return callReplayProvider('getBitmapState', null, [bitmap]);
            },
            nextDrawOrder(state) {
                return callReplayProvider('nextDrawOrder', 0, [state]);
            },
            collectReplayItems(state, rect, currentEntry, relation) {
                const items = callReplayProvider('collectReplayItems', [], [state, rect, currentEntry, relation]);
                return Array.isArray(items) ? items : [];
            },
            replayBitmapItems(bitmap, items) {
                return callReplayProvider('replayBitmapItems', false, [bitmap, items]);
            },
            withBitmapReplay(bitmap, callback, source) {
                if (replayProvider && typeof replayProvider.withBitmapReplay === 'function') {
                    return replayProvider.withBitmapReplay(bitmap, callback, source);
                }
                return typeof callback === 'function' ? callback() : undefined;
            },
            getRenderGuardState,
            getRenderGuardReason,
            withBitmapSkipGuard,
            withSpriteTextReplayGuard,
            withBitmapSkipAndSpriteReplayGuard,
            enterWindowPipelineGuard,
            withWindowPipelineGuard,
            rectFromDimensions(x, y, width, height) {
                return callReplayProvider('rectFromDimensions', null, [x, y, width, height]);
            },
            isValidRect(rect) {
                return callReplayProvider('isValidRect', false, [rect]) === true;
            },
            subscribeDrawBatches,
            flushDrawBatches,
            hasPendingDrawBatches,
        });

        const spriteFacet = freezeApi({
            watchBitmap,
            hasMutationPublisher,
            flushBitmapFallback,
            getRenderGuardState,
            getRenderGuardReason,
            withBitmapSkipGuard,
            withSpriteTextReplayGuard,
            withBitmapSkipAndSpriteReplayGuard,
            enterWindowPipelineGuard,
            withWindowPipelineGuard,
            scheduleDeferredFlush,
            subscribeDrawBatches,
            flushDrawBatches,
            flushOwnerDrawBatches,
            hasPendingDrawBatches,
        });

        return freezeApi({
            forBitmapAdapter() {
                return bitmapFacet;
            },
            forWindowAdapter() {
                return windowReplayFacet;
            },
            forSpriteAdapter() {
                return spriteFacet;
            },
        });
    }

    function captureDefaultBitmapDrawState(bitmap) {
        if (!bitmap) return null;
        return {
            fontFace: bitmap.fontFace,
            fontSize: bitmap.fontSize,
            fontBold: bitmap.fontBold,
            fontItalic: bitmap.fontItalic,
            textColor: bitmap.textColor,
            outlineColor: bitmap.outlineColor,
            outlineWidth: bitmap.outlineWidth,
        };
    }

    function copyDrawState(source) {
        return {
            fontFace: source.fontFace,
            fontSize: source.fontSize,
            fontBold: source.fontBold,
            fontItalic: source.fontItalic,
            textColor: source.textColor,
            outlineColor: source.outlineColor,
            outlineWidth: source.outlineWidth,
        };
    }

    function stringify(value) {
        try { return String(value ?? ''); } catch (_) { return ''; }
    }

    function finiteNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    function positiveNumber(...values) {
        for (const value of values) {
            const numeric = Number(value);
            if (Number.isFinite(numeric) && numeric > 0) return numeric;
        }
        return 1;
    }

    function nonNegativeNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
    }

    function readPositiveInteger(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : fallback;
    }

    function normalizeCanvasTextAlign(align) {
        const value = stringify(align).toLowerCase();
        return ['left', 'right', 'center', 'start', 'end'].indexOf(value) >= 0 ? value : 'left';
    }

    defineRuntimeModule('runtime.bitmapServices', {
        createBitmapServices,
    });
})();
