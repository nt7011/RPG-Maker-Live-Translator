// PIXI.Text and PIXI.BitmapText adapter.
//
// This adapter is deliberately thin around the TextOrchestrator:
// - observe native PIXI text setter and display-object lifecycle events,
// - report text/visibility/removal to the orchestrator,
// - apply pixiTextSetter render commands after validating object identity.
//
// Translation requests, stale result protection, queue priority ownership, and
// render command generation belong to runtime/text-orchestrator.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.adapters) {
        globalScope.LiveTranslatorModules.adapters = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/pixi-text-adapter.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before adapters/pixi-text-adapter.js.');
    }

    const pixiUtils = requireRuntimeModule('adapters.pixiTextUtils');
    const pixiAdapterHelpers = requireRuntimeModule('adapters.pixiTextAdapterHelpers');
    const pixiTextScale = requireRuntimeModule('adapters.pixiTextScale');
    const pixiRenderController = requireRuntimeModule('adapters.pixiTextRenderController');
    const pixiLifecycleController = requireRuntimeModule('adapters.pixiTextLifecycleController');
    const pixiStateController = requireRuntimeModule('adapters.pixiTextStateController');
    const pixiVisibilityController = requireRuntimeModule('adapters.pixiTextVisibilityController');
    const {
        ADAPTER_ID,
        DESTROY_HOOK_TOKEN,
        FRAME_HOOK_TOKEN,
        PRIORITY_DETACHED,
        PRIORITY_HIDDEN,
        PRIORITY_VISIBLE,
        REMOVAL_HOOK_TOKEN,
        RENDER_STRATEGY,
        SETTER_HOOK_TOKEN,
        SURFACE_TYPE,
        errorMessage,
        findDescriptor,
        hasHookInChain,
        hasRequiredOrchestrator,
        inferLabel,
        isDisplayObjectRenderable,
        priorityReason,
        resolvePriority,
        resolveScalePercent,
        safeCall,
        screenStateFor,
        snapshotRemovedChildren,
        stringifyText,
    } = pixiUtils;

    // Public adapter entrypoint used by runtime/install-hooks.js.
    function installPixiTextAdapter(context = {}) {
        return createPixiTextAdapter(context).install();
    }

    // Build one adapter instance for the current game runtime. All mutable
    // PIXI object state is kept private to this closure.
    function createPixiTextAdapter(context = {}) {
        const {
            logger = console,
            dbg = () => {},
            diag = () => {},
            preview = (text) => String(text ?? ''),
            encodeText = (text) => ({
                originalText: String(text ?? ''),
                visibleText: String(text ?? '').trim(),
                translationText: String(text ?? ''),
                normalizedText: String(text ?? '').trim(),
                tokens: [],
            }),
            restoreText = (translated) => translated,
            telemetry = null,
            adapterContract = null,
            settings = {},
            resolveTextScalePercent = null,
            scaleFontSizeValue = null,
        } = context;

        const pixiStates = new WeakMap();
        const objectsByItemId = new Map();
        const watchedObjects = new Set();
        const textScaleOthers = resolveScalePercent(settings, resolveTextScalePercent);
        let stateController = null;
        let lifecycleController = null;
        let renderController = null;
        let textScaleController = null;
        let visibilityController = null;
        const {
            prepareTranslationInput,
            describePixiTextEligibility,
            updateItem,
            logTelemetry,
            isAdapterContractFailure,
            warn,
        } = pixiAdapterHelpers.create({
            adapterContract,
            encodeText,
            telemetry,
            logger,
            safeCall,
            ADAPTER_ID,
        });

        function getStateController() {
            if (!stateController) {
                stateController = pixiStateController.create({
                    pixiStates,
                    inferLabel,
                });
            }
            return stateController;
        }

        function ensureState(displayObject, label = '') { return getStateController().ensureState(displayObject, label); }
        function getState(displayObject) { return getStateController().getState(displayObject); }
        function exposeDebugState(displayObject, state) { return getStateController().exposeDebugState(displayObject, state); }

        function getVisibilityController() {
            if (!visibilityController) {
                visibilityController = pixiVisibilityController.create({
                    adapterContract,
                    watchedObjects,
                    globalScope,
                    getState,
                    retireCurrentItem,
                    exposeDebugState,
                    isDisplayObjectRenderable,
                    resolvePriority,
                    screenStateFor,
                    priorityReason,
                    hasHookInChain,
                    FRAME_HOOK_TOKEN,
                });
            }
            return visibilityController;
        }

        function isStateActive(state) { return getVisibilityController().isStateActive(state); }
        function installVisibilityFrameHooks() { return getVisibilityController().installVisibilityFrameHooks(); }

        function getLifecycleController() {
            if (!lifecycleController) {
                lifecycleController = pixiLifecycleController.create({
                    adapterContract,
                    objectsByItemId,
                    watchedObjects,
                    getState,
                    isStateActive,
                    exposeDebugState,
                    hasHookInChain,
                    snapshotRemovedChildren,
                    DESTROY_HOOK_TOKEN,
                    REMOVAL_HOOK_TOKEN,
                });
            }
            return lifecycleController;
        }

        function installTextDestroyHook(Ctor, label) { return getLifecycleController().installTextDestroyHook(Ctor, label); }
        function installContainerRemovalHooks(Ctor) { return getLifecycleController().installContainerRemovalHooks(Ctor); }
        function retireTree(displayObject, reason, labelHint, status) { return getLifecycleController().retireTree(displayObject, reason, labelHint, status); }
        function retireCurrentItem(displayObject, reason, labelHint = '', status = 'disappeared') { return getLifecycleController().retireCurrentItem(displayObject, reason, labelHint, status); }
        function clearItemState(displayObject, reason, options = {}) { return getLifecycleController().clearItemState(displayObject, reason, options); }

        function getTextScaleController() {
            if (!textScaleController) {
                textScaleController = pixiTextScale.create({
                    textScaleOthers,
                    scaleFontSizeValue,
                });
            }
            return textScaleController;
        }

        function applyTranslatedTextScale(displayObject) {
            return getTextScaleController().applyTranslatedTextScale(displayObject);
        }

        function restoreTextScale(displayObject) {
            return getTextScaleController().restoreTextScale(displayObject);
        }

        function getRenderController() {
            if (!renderController) {
                renderController = pixiRenderController.create({
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
                });
            }
            return renderController;
        }

        // Locate PIXI classes and install the adapter hooks. Returning a
        // structured status lets the hook installer report partial failures.
        function install() {
            const PIXIObj = globalScope.PIXI || globalScope.Pixi || globalScope.pixi;
            if (!PIXIObj) {
                diag('[PIXI] Not found, skipping PIXI text hooks');
                return {
                    status: 'skipped',
                    reason: 'PIXI is unavailable.',
                };
            }

            if (!hasRequiredOrchestrator(adapterContract)) {
                return {
                    status: 'skipped',
                    reason: 'Text orchestrator is unavailable.',
                };
            }

            let hookedAny = false;
            try { hookedAny = installTextSetter(PIXIObj.Text, 'PIXI.Text') || hookedAny; } catch (error) { warn('[PIXI] Failed to hook PIXI.Text.', error); }
            try { hookedAny = installTextSetter(PIXIObj.BitmapText, 'PIXI.BitmapText') || hookedAny; } catch (error) { warn('[PIXI] Failed to hook PIXI.BitmapText.', error); }
            if (!hookedAny) {
                diag('[PIXI] No text classes hooked');
                return {
                    status: 'skipped',
                    reason: 'No writable PIXI.Text/PIXI.BitmapText text setters found.',
                };
            }

            try { installContainerRemovalHooks(PIXIObj.Container); } catch (error) { warn('[PIXI] Failed to hook PIXI.Container removal.', error); }
            try { installContainerRemovalHooks(PIXIObj.DisplayObjectContainer); } catch (error) { warn('[PIXI] Failed to hook PIXI.DisplayObjectContainer removal.', error); }
            getRenderController().installRenderCommandSubscription();
            installVisibilityFrameHooks();

            return {
                status: 'installed',
                reason: 'PIXI text setter hooks installed.',
            };
        }

        // Wrap one PIXI text class. The setter is the only place native text
        // assignments enter the translation lifecycle.
        function installTextSetter(Ctor, label) {
            if (!Ctor || !Ctor.prototype) return false;
            if (Object.prototype.hasOwnProperty.call(Ctor.prototype, '__trPixiTextWrapped')
                && Ctor.prototype.__trPixiTextWrapped === SETTER_HOOK_TOKEN) {
                return true;
            }

            const found = findDescriptor(Ctor.prototype, 'text');
            if (!found || typeof found.desc.set !== 'function') {
                diag(`[PIXI] ${label}.text setter not found; skipping`);
                return false;
            }
            if (found.desc.set.__trPixiTextSetterWrapped === SETTER_HOOK_TOKEN) {
                try { Ctor.prototype.__trPixiTextWrapped = SETTER_HOOK_TOKEN; } catch (_) {}
                installTextDestroyHook(Ctor, label);
                return true;
            }

            const originalSetter = found.desc.set;
            const originalGetter = typeof found.desc.get === 'function'
                ? found.desc.get
                : function() { return this._text; };

            // Write through the original setter while suppressing recursive
            // adapter handling. Scaling is a render concern, so it only applies
            // when the orchestrator told us to draw translated text.
            const writeNativeText = (displayObject, value, translated) => {
                const state = ensureState(displayObject, label);
                if (state) state.applyingNativeText = true;
                try {
                    if (translated) {
                        applyTranslatedTextScale(displayObject);
                    } else {
                        restoreTextScale(displayObject);
                    }
                    return originalSetter.call(displayObject, value);
                } finally {
                    if (state) state.applyingNativeText = false;
                }
            };

            // Intercept direct game/plugin assignments.
            const wrappedSetter = function(value) {
                const state = ensureState(this, label);
                if (state && state.applyingNativeText) {
                    return originalSetter.call(this, value);
                }

                const incomingText = stringifyText(value);
                try {
                    return handleNativeTextAssignment(this, incomingText, label, writeNativeText);
                } catch (error) {
                    if (isAdapterContractFailure(error)) throw error;
                    warn('[PIXI] Text setter adapter failed; leaving native text untouched.', error);
                    return writeNativeText(this, value, false);
                }
            };
            wrappedSetter.__trPixiTextSetterWrapped = SETTER_HOOK_TOKEN;

            Object.defineProperty(found.owner, 'text', {
                configurable: true,
                enumerable: found.desc.enumerable,
                get: originalGetter,
                set: wrappedSetter,
            });

            try { Ctor.prototype.__trPixiTextWrapped = SETTER_HOOK_TOKEN; } catch (_) {}
            installTextDestroyHook(Ctor, label);
            dbg(`[PIXI] Hooked ${label}.text setter`);
            return true;
        }

        // Convert a native setter assignment into an orchestrator observation
        // and translation request. The adapter keeps the original PIXI text on
        // screen until a render command arrives.
        function handleNativeTextAssignment(displayObject, text, label, writeNativeText) {
            retireCurrentItem(displayObject, 'pixi-text-replaced', label, 'stale');

            const state = ensureState(displayObject, label);
            state.surfaceRevision += 1;
            state.originalText = text;
            state.codecState = null;
            state.translationSource = '';
            state.normalizedSource = '';
            state.renderedText = '';

            const rawEligibility = describePixiTextEligibility({
                rawText: text,
                visibleText: text,
                original: text,
            });
            if (!rawEligibility.eligible && rawEligibility.category === 'empty') {
                clearItemState(displayObject, 'pixi-text-empty', { invalidate: false });
                return writeNativeText(displayObject, text, false);
            }

            const codecState = prepareTranslationInput(text);
            const translationSource = stringifyText(codecState.translationText !== undefined
                ? codecState.translationText
                : text);
            const normalizedSource = translationSource.trim();
            const sourceEligibility = describePixiTextEligibility({
                rawText: text,
                visibleText: text,
                original: text,
                translationSource,
                normalizedSource,
            });
            if (!sourceEligibility.eligible && sourceEligibility.category === 'empty') {
                clearItemState(displayObject, 'pixi-text-empty-source', { invalidate: false });
                return writeNativeText(displayObject, text, false);
            }

            const priority = resolvePriority(displayObject);
            const renderable = isDisplayObjectRenderable(displayObject);
            const itemId = `pixi:${state.objectId}:${state.surfaceRevision}`;
            const payload = {
                id: itemId,
                sourceAdapter: ADAPTER_ID,
                hook: ADAPTER_ID,
                hookLabel: 'PIXI',
                surfaceId: `pixi:${state.objectId}`,
                slotKey: 'text',
                surfaceType: SURFACE_TYPE,
                status: 'detected',
                rawText: text,
                visibleText: text,
                original: text,
                translationSource,
                normalizedSource,
                priority,
                generation: state.surfaceRevision,
                renderStrategy: RENDER_STRATEGY,
                visible: renderable,
                onScreen: renderable,
                screenState: screenStateFor(displayObject, renderable),
                metadata: {
                    windowType: label,
                    objectId: state.objectId,
                },
            };

            const eligibility = describePixiTextEligibility(payload);
            if (!eligibility.eligible) {
                payload.status = 'skipped';
                payload.sourceHint = eligibility.sourceHint || 'policy';
                payload.metadata = Object.assign({}, payload.metadata || {}, {
                    skipReason: eligibility.reason || 'translation skipped',
                    eligibilityCategory: eligibility.category || '',
                });
            }
            const observed = observeState(displayObject, state, payload);
            if (!observed || !observed.id) {
                clearItemState(displayObject, 'pixi-text-observe-failed', { invalidate: false });
                writeNativeText(displayObject, text, false);
                return undefined;
            }
            payload.id = observed.id;
            payload.status = observed.status || payload.status;
            activateState(displayObject, state, payload, codecState);
            logTelemetry(normalizedSource, label);

            writeNativeText(displayObject, text, false);
            if (!eligibility.eligible || payload.status === 'skipped') return undefined;
            requestTranslation(displayObject, state, payload);
            return undefined;
        }

        // Make a PIXI object the active render target for one orchestrator item.
        // The item id map is what lets render commands find the live object.
        function activateState(displayObject, state, payload, codecState) {
            state.itemId = payload.id;
            state.payload = createDebugPayload(payload);
            state.codecState = codecState;
            state.originalText = payload.original;
            state.translationSource = payload.translationSource;
            state.normalizedSource = payload.normalizedSource;
            state.priority = payload.priority;
            state.visible = payload.visible === true;
            state.screenState = payload.screenState;
            watchedObjects.add(displayObject);
            exposeDebugState(displayObject, state);
        }

        function createDebugPayload(payload) {
            const next = Object.assign({}, payload || {});
            delete next.status;
            return next;
        }

        // Report detected text to the orchestrator. The contract reconciles the
        // local record id to the canonical slot owner returned by the
        // orchestrator.
        function observeState(displayObject, state, payload) {
            return adapterContract.observeRecord(state, payload, { eventType: 'item.detected' }, {
                idField: 'itemId',
                registry: objectsByItemId,
                registryValue: displayObject,
            });
        }

        // Ask the orchestrator to create the translation subscriber. Subscriber
        // ownership stays inside the orchestrator, not in this adapter.
        function requestTranslation(displayObject, state, payload) {
            if (!state || !isStateActive(state) || state.itemId !== payload.id) return false;
            try {
                const requested = adapterContract.requestItemTranslation(state, {
                    hook: ADAPTER_ID,
                    priority: payload.priority,
                    renderStrategy: RENDER_STRATEGY,
                    metadata: payload.metadata,
                });
                if (!requested) {
                    updateItem(state, { status: 'failed' }, 'item.failed', {
                        reason: 'translation request failed',
                        windowType: state.label,
                    });
                }
            } catch (error) {
                if (isAdapterContractFailure(error)) throw error;
                updateItem(state, { status: 'failed' }, 'item.failed', {
                    reason: errorMessage(error),
                    windowType: state.label,
                });
            }
            exposeDebugState(displayObject, state);
        }

        return { install };
    }

    defineRuntimeModule('adapters.pixiText', {
        install: installPixiTextAdapter,
    });
})();
