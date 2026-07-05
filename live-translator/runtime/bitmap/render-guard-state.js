// Bitmap render guard state.
//
// Bitmap, window, and sprite adapters enter nested replay/native-draw scopes
// around bitmap mutations. This module owns only the per-bitmap stack/depth
// bookkeeping for those scopes. Callers still own the behavior that happens
// while a guard is active.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.renderGuardState',
        factory() {
            function createRenderGuardStateManager(deps = {}) {
                const onPendingDrawUnitFlushReady = typeof deps.onPendingDrawUnitFlushReady === 'function'
                    ? deps.onPendingDrawUnitFlushReady
                    : () => {};
                const renderGuardStates = new WeakMap();

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
                    if (!canStoreRenderGuardState(bitmap) || !state) return;
                    if (state.bitmapReplayDepth > 0
                        || state.bitmapSkipDepth > 0
                        || state.spriteTextReplayDepth > 0
                        || state.windowPipelineDepth > 0
                        || state.pendingDrawUnitFlushDepth > 0
                        || state.windowDrawTextExReplayDepth > 0
                        || state.bitmapReplaySources.length
                        || state.windowPipelineSources.length
                        || state.bitmapNativeDrawAttributions.length
                        || state.activeRedrawEntries.length) {
                        return;
                    }
                    renderGuardStates.delete(bitmap);
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
                    if (guard.windowDrawTextExReplay) state.windowDrawTextExReplayDepth += 1;
                    if (guard.windowPipeline) {
                        state.windowPipelineDepth += 1;
                        state.windowPipelineSources.push(guard.windowPipelineSource || 'window-pipeline');
                    }
                    if (guard.bitmapNativeDrawAttribution) {
                        state.bitmapNativeDrawAttributions.push(guard.bitmapNativeDrawAttribution);
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
                        if (guard.windowDrawTextExReplay) state.windowDrawTextExReplayDepth = Math.max(0, state.windowDrawTextExReplayDepth - 1);
                        if (guard.windowPipeline) {
                            state.windowPipelineDepth = Math.max(0, state.windowPipelineDepth - 1);
                            state.windowPipelineSources.pop();
                        }
                        if (guard.bitmapNativeDrawAttribution) state.bitmapNativeDrawAttributions.pop();
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

                function withWindowDrawTextExReplayGuard(bitmap, callback) {
                    return withRenderGuard(bitmap, { windowDrawTextExReplay: true }, callback);
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

                function enterPendingDrawUnitFlushDeferral(bitmap, reason = 'pending-draw-unit-flush') {
                    if (!bitmap) return () => {};
                    const state = getOrCreateRenderGuardState(bitmap);
                    if (!state) return () => {};
                    const flushReason = stringify(reason || 'pending-draw-unit-flush') || 'pending-draw-unit-flush';
                    state.pendingDrawUnitFlushDepth += 1;
                    let active = true;
                    return () => {
                        if (!active) return;
                        active = false;
                        state.pendingDrawUnitFlushDepth = Math.max(0, state.pendingDrawUnitFlushDepth - 1);
                        const shouldFlush = state.pendingDrawUnitFlushDepth === 0;
                        pruneRenderGuardState(bitmap, state);
                        if (shouldFlush) onPendingDrawUnitFlushReady(bitmap, flushReason);
                    };
                }

                function withPendingDrawUnitFlushDeferral(bitmap, reason, callback) {
                    if (typeof callback !== 'function') return undefined;
                    const release = enterPendingDrawUnitFlushDeferral(bitmap, reason);
                    try {
                        return callback();
                    } finally {
                        release();
                    }
                }

                function withBitmapNativeDrawAttribution(bitmap, attribution, callback) {
                    if (typeof callback !== 'function') return undefined;
                    const label = stringify(attribution || '');
                    if (!label) return callback();
                    return withRenderGuard(bitmap, { bitmapNativeDrawAttribution: label }, callback);
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
                    const bitmapNativeDrawAttribution = state && state.bitmapNativeDrawAttributions.length
                        ? state.bitmapNativeDrawAttributions[state.bitmapNativeDrawAttributions.length - 1]
                        : '';
                    return {
                        bitmapReplayDepth: state ? state.bitmapReplayDepth : 0,
                        bitmapSkipDepth: state ? state.bitmapSkipDepth : 0,
                        spriteTextReplayDepth: state ? state.spriteTextReplayDepth : 0,
                        windowPipelineDepth: state ? state.windowPipelineDepth : 0,
                        pendingDrawUnitFlushDepth: state ? state.pendingDrawUnitFlushDepth : 0,
                        windowDrawTextExReplayDepth: state ? state.windowDrawTextExReplayDepth : 0,
                        bitmapReplaySource: replaySource || '',
                        windowPipelineSource: windowPipelineSource || '',
                        bitmapNativeDrawAttribution: bitmapNativeDrawAttribution || '',
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
                    if (state.windowDrawTextExReplayDepth > 0) return 'window-drawTextEx-replay';
                    if (state.windowPipelineDepth > 0) {
                        return state.windowPipelineSources[state.windowPipelineSources.length - 1] || 'window-pipeline';
                    }
                    return '';
                }

                function getSourceObservationPolicy(bitmap) {
                    const state = getRenderGuardRecord(bitmap);
                    if (!state) return createSourceObservationPolicy();

                    const suppressReason = getSourceObservationSuppressionReason(state);
                    const deferReason = getSourceDispatchDeferralReason(state);
                    return createSourceObservationPolicy({
                        suppressSourceObservation: !!suppressReason,
                        deferSourceDispatch: !!deferReason,
                        // A window pipeline can defer source dispatch without
                        // suppressing source observation. Replacement still stays
                        // quiet while native window rendering is active.
                        suppressInlineReplacement: !!(suppressReason || deferReason),
                        suppressNativeReplacement: !!(suppressReason || deferReason),
                        intelReason: suppressReason || deferReason || '',
                    });
                }

                function getSourceObservationSuppressionReason(state) {
                    if (!state) return '';
                    if (state.bitmapReplayDepth > 0) {
                        return state.bitmapReplaySources[state.bitmapReplaySources.length - 1] || 'bitmap-replay';
                    }
                    if (state.bitmapSkipDepth > 0) return 'bitmap-skip';
                    if (state.spriteTextReplayDepth > 0) return 'sprite-text-replay';
                    if (state.windowDrawTextExReplayDepth > 0) return 'window-drawTextEx-replay';
                    return '';
                }

                function getSourceDispatchDeferralReason(state) {
                    if (!state) return '';
                    if (state.windowPipelineDepth > 0) {
                        return state.windowPipelineSources[state.windowPipelineSources.length - 1] || 'window-pipeline';
                    }
                    if (state.pendingDrawUnitFlushDepth > 0) return 'pending-draw-unit-flush';
                    return '';
                }

                return freezeApi({
                    getRenderGuardState,
                    getRenderGuardReason,
                    getSourceObservationPolicy,
                    withBitmapReplayGuard,
                    withBitmapSkipGuard,
                    withSpriteTextReplayGuard,
                    withBitmapSkipAndSpriteReplayGuard,
                    withWindowDrawTextExReplayGuard,
                    enterWindowPipelineGuard,
                    withWindowPipelineGuard,
                    enterPendingDrawUnitFlushDeferral,
                    withPendingDrawUnitFlushDeferral,
                    withBitmapNativeDrawAttribution,
                    withActiveRedrawEntry,
                    getActiveRedrawEntry,
                });
            }

            function createRenderGuardState() {
                return {
                    bitmapReplayDepth: 0,
                    bitmapSkipDepth: 0,
                    spriteTextReplayDepth: 0,
                    windowPipelineDepth: 0,
                    pendingDrawUnitFlushDepth: 0,
                    windowDrawTextExReplayDepth: 0,
                    bitmapReplaySources: [],
                    windowPipelineSources: [],
                    bitmapNativeDrawAttributions: [],
                    activeRedrawEntries: [],
                };
            }

            function createSourceObservationPolicy(input = {}) {
                const source = input && typeof input === 'object' ? input : {};
                const intelReason = stringify(source.intelReason || '');
                return freezeApi({
                    suppressSourceObservation: source.suppressSourceObservation === true,
                    deferSourceDispatch: source.deferSourceDispatch === true,
                    suppressInlineReplacement: source.suppressInlineReplacement === true,
                    suppressNativeReplacement: source.suppressNativeReplacement === true,
                    intelReason,
                    reason: intelReason,
                });
            }

            function normalizeRenderGuardInput(input = {}) {
                const source = input && typeof input === 'object' ? input : {};
                return {
                    bitmapReplay: source.bitmapReplay === true,
                    bitmapSkip: source.bitmapSkip === true,
                    spriteTextReplay: source.spriteTextReplay === true,
                    windowPipeline: source.windowPipeline === true,
                    windowDrawTextExReplay: source.windowDrawTextExReplay === true,
                    bitmapReplaySource: stringify(source.bitmapReplaySource || ''),
                    windowPipelineSource: stringify(source.windowPipelineSource || ''),
                    bitmapNativeDrawAttribution: stringify(source.bitmapNativeDrawAttribution || ''),
                };
            }

            function canStoreRenderGuardState(bitmap) {
                const type = typeof bitmap;
                return bitmap !== null && (type === 'object' || type === 'function');
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createRenderGuardStateManager,
            });
        },
    });
})();
