// PIXI adapter render command controller.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/pixi-text/render-controller.js.');
    }

    // Render command handling stays behind the adapter contract gate and never observes new native text.
    function createPixiRenderController(context = {}) {
        const {
            adapterContract,
            objectsByItemId,
            getState,
            ensureState,
            clearItemState,
            retireCurrentItem,
            restoreText,
            warn,
            updateItem,
            dbg,
            preview,
            exposeDebugState,
            applyTranslatedTextScale,
            restoreTextScale,
            ADAPTER_ID,
            RENDER_STRATEGY,
            SETTER_HOOK_TOKEN,
        } = context;
    
        function installRenderCommandSubscription() {
                    adapterContract.subscribeRecords({
                        token: SETTER_HOOK_TOKEN,
                        renderStrategy: RENDER_STRATEGY,
                        resolveRecord: resolvePixiEventTarget,
                        getLifecycleRecord: getLifecycleRecord,
                        getRenderGeneration: getRenderGeneration,
                        isRenderTargetCurrent: isRenderTargetCurrent,
                        onRenderQueued: applyRenderCommand,
                        onRenderRejected: handleRenderRejected,
                        onFailed(target) {
                            markTerminalState(target, 'failed');
                        },
                        onSkipped(target) {
                            markTerminalState(target, 'skipped');
                        },
                    });
                }
        
        function resolvePixiEventTarget(itemId) {
                    const normalizedId = String(itemId || '');
                    const displayObject = objectsByItemId.get(normalizedId);
                    const state = getState(displayObject);
                    if (!displayObject || !state || state.itemId !== normalizedId) return null;
                    return { displayObject, state };
                }
        
        function getLifecycleRecord(target) {
                    return target && target.state ? target.state : null;
                }
        
        function getRenderGeneration(target) {
                    const state = target && target.state;
                    return state && state.surfaceRevision ? Number(state.surfaceRevision) : 0;
                }
        
        function isRenderTargetCurrent(target, command, route) {
                    const displayObject = target && target.displayObject;
                    const state = target && target.state;
                    if (!displayObject || !state) return false;
                    const recordId = route && route.recordId ? String(route.recordId) : '';
                    return !!(recordId
                        && state.itemId === recordId
                        && objectsByItemId.get(recordId) === displayObject);
                }
        
        function handleRenderRejected(target, decision = {}) {
                    const displayObject = target && target.displayObject;
                    const state = target && target.state;
                    if (!displayObject || !state || shouldKeepStateAfterRenderRejection(decision)) return;
                    const reason = normalizeRenderRejectionReason(decision);
                    retireCurrentItem(
                        displayObject,
                        `pixi-render-${reason}`,
                        state.label,
                        isRenderApplicationFailure(reason) ? 'failed' : 'stale'
                    );
                }
        
        function applyRenderCommand(target, command = {}) {
                    const displayObject = target && target.displayObject;
                    const state = target && target.state;
                    if (!displayObject || !state) return false;
                    const translated = typeof command.text === 'string' ? command.text : '';
                    const restored = restoreTranslatedText(translated, state);
                    if (restored.trim() === String(state.originalText || '').trim()) {
                        markRenderSkipped(displayObject, state, translated);
                        return true;
                    }
        
                    writeTextThroughWrappedSetter(displayObject, restored, true);
                    state.renderedText = restored;
                    exposeDebugState(displayObject, state);
                    updateItem(state, {
                        status: 'completed',
                        translation: restored,
                        translationDrawn: restored,
                    }, 'item.rendered', {
                        windowType: state.label,
                        translationDrawn: restored,
                        translationReceived: command.metadata
                            ? command.metadata.translationReceived
                            : translated,
                    });
                    return true;
                }
        
        function restoreTranslatedText(translated, state) {
                    try {
                        const restored = restoreText(translated, state.codecState || {});
                        return typeof restored === 'string' ? restored : String(state.originalText || '');
                    } catch (error) {
                        warn('[PIXI] Failed to restore control-code placeholders for translated text.', error);
                        return translated;
                    }
                }
        
        function markRenderSkipped(displayObject, state, translated) {
                    updateItem(state, { status: 'skipped' }, 'item.skipped', {
                        reason: 'translated text matched original',
                        source: ADAPTER_ID,
                        translationReceived: translated,
                    });
                    adapterContract.retireItem(state, 'skipped', {
                        eventType: 'item.skipped',
                        message: 'pixi-text-render-skipped',
                        details: {
                            reason: 'translated text matched original',
                            source: ADAPTER_ID,
                        },
                    });
                    dbg(`[PIXI Skip] Original and translated text are identical: "${preview(state.normalizedSource || state.originalText || '')}"`);
                    clearItemState(displayObject, 'pixi-text-render-skipped');
                }
        
        function markTerminalState(target, status) {
                    const displayObject = target && target.displayObject;
                    const state = target && target.state;
                    if (!displayObject || !state) return;
                    exposeDebugState(displayObject, state);
                }
        
        function shouldKeepStateAfterRenderRejection(decision = {}) {
                    const reason = normalizeRenderRejectionReason(decision);
                    if (reason !== 'generation-mismatch') return false;
                    const targetGeneration = Number(decision.details && decision.details.targetGeneration);
                    const commandGeneration = Number(decision.commandGeneration);
                    return Number.isFinite(targetGeneration)
                        && Number.isFinite(commandGeneration)
                        && targetGeneration > commandGeneration;
                }
        
        function isRenderApplicationFailure(reason) {
                    return reason === 'adapter-render-error' || reason === 'adapter-declined';
                }
        
        function normalizeRenderRejectionReason(decision = {}) {
                    const reason = String(decision && decision.reason || '').trim();
                    return reason || 'render-rejected';
                }
        
        function writeTextThroughWrappedSetter(displayObject, value, translated) {
                    const state = ensureState(displayObject);
                    if (state) state.applyingNativeText = true;
                    try {
                        if (translated) {
                            applyTranslatedTextScale(displayObject);
                        } else {
                            restoreTextScale(displayObject);
                        }
                        displayObject.text = value;
                        return true;
                    } finally {
                        if (state) state.applyingNativeText = false;
                    }
                }
    
        return {
            installRenderCommandSubscription,
        };
    }
    
    defineRuntimeModule('adapters.pixiTextRenderController', {
        create: createPixiRenderController,
    });

})();
