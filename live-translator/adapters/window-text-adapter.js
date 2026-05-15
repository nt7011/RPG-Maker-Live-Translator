// Window_Base text adapter.
//
// This module observes Window_Base.drawText/drawTextEx calls and reports those
// draw slots to TextOrchestrator. The adapter keeps only rendering mechanics:
// bitmap state capture, scoped redraw, replay around the replaced pixels, and
// validation that the target window/entry still exists before drawing.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/window-text-adapter.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before adapters/window-text-adapter.js.');
    }
    const windowTextControllers = {
        subscriptionController: requireRuntimeModule('adapters.windowTextSubscriptionController'),
        drawObserver: requireRuntimeModule('adapters.windowTextDrawObserver'),
        entryService: requireRuntimeModule('adapters.windowTextEntryService'),
        renderPending: requireRuntimeModule('adapters.windowTextRenderPending'),
        renderDraw: requireRuntimeModule('adapters.windowTextRenderDraw'),
        entryLifecycle: requireRuntimeModule('adapters.windowTextEntryLifecycle'),
        textMeasure: requireRuntimeModule('adapters.windowTextTextMeasure'),
        bitmapReplay: requireRuntimeModule('adapters.windowTextBitmapReplay'),
    };

    const ADAPTER_ID = 'window';
    const ADAPTER_LABEL = 'Window Text';
    const RENDER_STRATEGY = 'windowTextRedraw';
    const WINDOW_PRIORITY_VISIBLE = 650;
    const WINDOW_WRAPPER_TOKEN = 'liveTranslator.windowText';
    const MAX_BACKGROUND_SNAPSHOT_PIXELS = 1024 * 2048;
    const DEFAULT_DETACHED_ENTRY_LIMIT = 256;
    const REQUIRED_ORCHESTRATOR_METHODS = Object.freeze([
        'observeRecord',
        'requestItemTranslation',
        'cancelItemTranslation',
        'updateItem',
        'retireItem',
        'recordDecision',
        'setItemVisibility',
        'recordRenderAccepted',
        'recordRenderDeferred',
        'recordRenderRejected',
        'describeTextEligibility',
        'subscribeRecords',
        'subscribeSurfaceDraws',
    ]);
    const REDRAW_DIAGNOSTIC_ITEM_LIMIT = 8;

    function installWindowTextAdapter(options = {}) {
        const {
            logger,
            telemetry,
            adapterContract,
            windowRegistry,
            registeredWindows,
            windowLifecycle = null,
            ensureWindowRegistered,
            pruneDetachedRegisteredWindows = null,
            generateKey,
            captureBitmapDrawState,
            applyBitmapDrawState,
            resolveTextScalePercent,
            createWindowTextScaleScope,
            preview = (text) => String(text ?? ''),
            diag = () => {},
            dbg = () => {},
            perf = null,
            drawCaptureTrace = null,
            bitmapReplay = null,
            bitmapDraws = null,
            contentsOwners = null,
            settings = {},
            stripControls,
            encodeText,
            restoreText,
        } = options;

        if (!logger || !telemetry || !windowRegistry || !registeredWindows) {
            throw new Error('[WindowTextAdapter] Missing required window adapter dependencies.');
        }
        if (typeof ensureWindowRegistered !== 'function') {
            throw new Error('[WindowTextAdapter] ensureWindowRegistered must be a function.');
        }
        if (typeof generateKey !== 'function') {
            throw new Error('[WindowTextAdapter] generateKey must be a function.');
        }
        if (typeof captureBitmapDrawState !== 'function' || typeof applyBitmapDrawState !== 'function') {
            throw new Error('[WindowTextAdapter] bitmap draw-state helpers are required.');
        }
        if (typeof stripControls !== 'function'
            || typeof encodeText !== 'function'
            || typeof restoreText !== 'function') {
            throw new Error('[WindowTextAdapter] text codec helpers are required.');
        }
        if (!hasRequiredOrchestrator(adapterContract)) {
            return {
                status: 'skipped',
                reason: 'Text orchestrator is unavailable.',
                helpers: null,
            };
        }
        if (typeof Window_Base === 'undefined' || !Window_Base || !Window_Base.prototype) {
            return {
                status: 'skipped',
                reason: 'Window_Base is unavailable.',
                helpers: null,
            };
        }
        if (typeof Window_Base.prototype.drawText !== 'function'
            || typeof Window_Base.prototype.drawTextEx !== 'function') {
            return {
                status: 'skipped',
                reason: 'Window_Base drawText/drawTextEx are unavailable.',
                helpers: null,
            };
        }

        const adapter = createWindowTextAdapter({
            logger,
            telemetry,
            adapterContract,
            windowRegistry,
            registeredWindows,
            windowLifecycle,
            ensureWindowRegistered,
            pruneDetachedRegisteredWindows,
            generateKey,
            captureBitmapDrawState,
            applyBitmapDrawState,
            resolveTextScalePercent,
            createWindowTextScaleScope,
            preview,
            diag,
            dbg,
            perf,
            drawCaptureTrace,
            bitmapReplay,
            bitmapDraws,
            contentsOwners,
            settings,
            stripControls,
            encodeText,
            restoreText,
        });
        const helpers = adapter.install();
            return {
                status: 'installed',
                reason: 'Window_Base text adapter installed.',
                helpers,
            };
    }

    function createWindowTextAdapter(context) {
        const { logger, adapterContract, resolveTextScalePercent, settings, bitmapDraws } = context;
        const entriesByRecordId = new Map();
        const detachedEntriesByRecordId = new Map();
        const redrawSettings = readRedrawSettings(settings);
        const detachedEntryLimit = readDetachedEntryLimit(settings);
        const textScaleOthers = typeof resolveTextScalePercent === 'function'
            ? resolveTextScalePercent(settings, 'textScaleOthers', 100)
            : 100;
        const methodControllers = Object.assign(Object.create(null), {
            installOrchestratorSubscription: 'subscriptionController',
            getRenderGeneration: 'subscriptionController',
            isRenderTargetCurrent: 'subscriptionController',
            handleRenderRejected: 'subscriptionController',
            handleDrawText: 'drawObserver',
            handleDrawTextEx: 'drawObserver',
            handleSurfaceDrawText: 'drawObserver',
            createObservedEntry: 'drawObserver',
            recordSkippedEntry: 'drawObserver',
            createEntry: 'drawObserver',
            refreshEntry: 'drawObserver',
            requestEntryTranslation: 'entryService',
            observeEntry: 'entryService',
            syncEntryFromObservedItem: 'entryService',
            getEntryStatus: 'entryService',
            isEntryActive: 'entryService',
            isEntryRequestActive: 'entryService',
            isEntryCompleted: 'entryService',
            firstNonEmptyString: 'entryService',
            recordDrawTrace: 'entryService',
            windowTraceDetails: 'entryService',
            getRegisteredWindowData: 'entryService',
            markEntryObservedInRefresh: 'entryService',
            safeStripRpgmEscapes: 'entryService',
            describeWindowScreenState: 'entryService',
            buildOrchestratorPayload: 'entryService',
            applyRenderCommand: 'renderPending',
            markRequestSkipped: 'renderPending',
            markRequestFailed: 'renderPending',
            updateOrchestratorItem: 'renderPending',
            beginPendingRenderCommand: 'renderPending',
            markPendingRenderDeferred: 'renderPending',
            completePendingRenderCommand: 'renderPending',
            rejectPendingRender: 'renderPending',
            clearPendingRenderCommand: 'renderPending',
            getPendingRenderDetails: 'renderPending',
            redrawTranslatedText: 'renderPending',
            drawTranslatedEntry: 'renderDraw',
            calculateRedrawBounds: 'renderDraw',
            drawTranslatedWindowText: 'renderDraw',
            invokeCompletedEntry: 'renderDraw',
            invokeOriginalDrawText: 'renderDraw',
            invokeOriginalDrawTextEx: 'renderDraw',
            withTranslatedWindowTextScale: 'renderDraw',
            withWindowTranslatedDrawScope: 'renderDraw',
            isWindowTranslatedDrawActive: 'renderDraw',
            withWindowDrawTextExReplayScope: 'renderDraw',
            findExistingEntry: 'entryLifecycle',
            retireEntriesInSameSlot: 'entryLifecycle',
            markEntryStale: 'entryLifecycle',
            rememberDetachedEntry: 'entryLifecycle',
            takeDetachedEntry: 'entryLifecycle',
            peekDetachedEntry: 'entryLifecycle',
            forgetEntryRecord: 'entryLifecycle',
            cancelEntryTranslation: 'entryLifecycle',
            markRecordDisappeared: 'entryLifecycle',
            recordDecision: 'entryLifecycle',
            queuePendingRedraw: 'entryLifecycle',
            clearPendingInvalidation: 'entryLifecycle',
            getCurrentEntry: 'entryLifecycle',
            getTextEntryKey: 'entryLifecycle',
            dropPendingRedraw: 'entryLifecycle',
            resolveWindowData: 'entryLifecycle',
            resolveTargetWindow: 'entryLifecycle',
            isWindowReadyForRedraw: 'entryLifecycle',
            refreshEntryBounds: 'entryLifecycle',
            estimateEntryBounds: 'textMeasure',
            measurePlainTextWidth: 'textMeasure',
            estimateDrawTextExFallbackWidth: 'textMeasure',
            estimateDrawTextExFallbackHeight: 'textMeasure',
            estimateMaxDrawTextExFallbackHeight: 'textMeasure',
            getDrawTextExLineCount: 'textMeasure',
            getLineHeight: 'textMeasure',
            getWindowIconWidth: 'textMeasure',
            countDrawTextExIcons: 'textMeasure',
            prepareTranslationSource: 'textMeasure',
            restoreTranslatedWindowText: 'textMeasure',
            sanitizeDrawTextOutput: 'textMeasure',
            convertWindowText: 'textMeasure',
            describeWindowTextEligibility: 'textMeasure',
            describeEntryEligibility: 'textMeasure',
            isDedicatedMessageWindow: 'textMeasure',
            rememberMessageStart: 'textMeasure',
            getSurfaceId: 'textMeasure',
            getIdentitySurfaceId: 'textMeasure',
            createSlotKey: 'textMeasure',
            createWindowTextRecordId: 'textMeasure',
            safeRecordIdPart: 'textMeasure',
            hashTextForRecordId: 'textMeasure',
            normalizeSlotNumber: 'textMeasure',
            getWindowTypeName: 'textMeasure',
            getWindowCtorName: 'textMeasure',
            normalizeDrawTextAlignValue: 'textMeasure',
            mergeBounds: 'bitmapReplay',
            isValidRect: 'bitmapReplay',
            roundDiagnosticNumber: 'bitmapReplay',
            cloneDiagnosticRect: 'bitmapReplay',
            cloneDiagnosticArea: 'bitmapReplay',
            calculateBitmapSurfaceTextYOffset: 'bitmapReplay',
            estimateBitmapSurfaceTextBounds: 'bitmapReplay',
            withWindowRedrawClear: 'bitmapReplay',
            withWindowContents: 'bitmapReplay',
            isUsableBitmap: 'bitmapReplay',
            getRedrawContents: 'bitmapReplay',
            wasDrawnToDetachedContents: 'bitmapReplay',
            isTransientRefreshWindow: 'bitmapReplay',
            isCoreRefreshWindowType: 'bitmapReplay',
            getBitmapReplayApi: 'bitmapReplay',
            assignWindowTextDrawOrder: 'bitmapReplay',
            captureWindowEntrySource: 'bitmapReplay',
            restoreWindowEntrySource: 'bitmapReplay',
            restoreEntriesForBitmapMutation: 'bitmapReplay',
            redrawRestoredEntriesForBitmapMutation: 'bitmapReplay',
            createClearRectFromArea: 'bitmapReplay',
            getReplayItemRect: 'bitmapReplay',
            mergeReplayRect: 'bitmapReplay',
            expandReplayDirtyRect: 'bitmapReplay',
            replayRectsOverlap: 'bitmapReplay',
            collectWindowTextReplayItems: 'bitmapReplay',
            windowEntryBelongsToContents: 'bitmapReplay',
            combineReplayItems: 'bitmapReplay',
            filterReplayForEntry: 'bitmapReplay',
            replayMixedItems: 'bitmapReplay',
            replayWindowTextEntry: 'bitmapReplay',
            getWindowReplayText: 'bitmapReplay',
            getBitmapCanvasContext: 'bitmapReplay',
            supportsBitmapReplayClip: 'bitmapReplay',
            withBitmapReplayClip: 'bitmapReplay',
            getReplayClipArea: 'bitmapReplay',
            getBitmapSnapshotContext: 'bitmapReplay',
            captureWindowEntryBackground: 'bitmapReplay',
            captureWindowEntryBackgroundPatch: 'bitmapReplay',
            ensureWindowEntryBackground: 'bitmapReplay',
            getWindowEntryBackgroundSnapshotStatus: 'bitmapReplay',
            restoreWindowEntryBackground: 'bitmapReplay',
            getEntryContentsRevision: 'bitmapReplay',
            getSnapshotContentsRevision: 'bitmapReplay',
            getWindowDataContentsRevision: 'bitmapReplay',
            getEntrySnapshotPadding: 'bitmapReplay',
            getSnapshotArea: 'bitmapReplay',
            getSnapshotDiagnostics: 'bitmapReplay',
            summarizeReplayItemsForDiagnostics: 'bitmapReplay',
            summarizeReplayStateForDiagnostics: 'bitmapReplay',
        });
        const controllers = Object.create(null);
        const publicHelpers = {
            redrawTranslatedText(...args) {
                return callController('redrawTranslatedText', ...args);
            },
            rejectPendingRender(...args) {
                return callController('rejectPendingRender', ...args);
            },
            forgetEntryRecord(...args) {
                return callController('forgetEntryRecord', ...args);
            },
            detachEntryRecord(...args) {
                return callController('rememberDetachedEntry', ...args);
            },
            restoreEntriesForBitmapMutation(...args) {
                return callController('restoreEntriesForBitmapMutation', ...args);
            },
            redrawRestoredEntriesForBitmapMutation(...args) {
                return callController('redrawRestoredEntriesForBitmapMutation', ...args);
            },
        };
        const controllerContext = Object.assign({}, context, {
            entriesByRecordId,
            detachedEntriesByRecordId,
            redrawSettings,
            DETACHED_ENTRY_LIMIT: detachedEntryLimit,
            textScaleOthers,
            ADAPTER_ID,
            ADAPTER_LABEL,
            RENDER_STRATEGY,
            WINDOW_PRIORITY_VISIBLE,
            WINDOW_WRAPPER_TOKEN,
            REDRAW_DIAGNOSTIC_ITEM_LIMIT,
            MAX_BACKGROUND_SNAPSHOT_PIXELS,
            install,
            installWindowBaseWrappers,
            installSurfaceDrawSubscription,
            hasHookInChain,
        });

        Object.keys(methodControllers).forEach((methodName) => {
            controllerContext[methodName] = (...args) => callController(methodName, ...args);
        });

        function getController(controllerName) {
            if (!controllers[controllerName]) {
                const controllerModule = windowTextControllers[controllerName];
                if (!controllerModule || typeof controllerModule.create !== 'function') {
                    throw new Error(`[WindowTextAdapter] Missing ${controllerName} controller.`);
                }
                controllers[controllerName] = controllerModule.create(controllerContext);
            }
            return controllers[controllerName];
        }

        function callController(methodName, ...args) {
            const controllerName = methodControllers[methodName];
            const controller = controllerName ? getController(controllerName) : null;
            const method = controller && controller[methodName];
            if (typeof method !== 'function') {
                throw new Error(`[WindowTextAdapter] Missing controller method: ${methodName}`);
            }
            return method(...args);
        }

        function install() {
            callController('installOrchestratorSubscription');
            installSurfaceDrawSubscription();
            installBitmapDrawBatchSubscription();
            return installWindowBaseWrappers();
        }

        function installSurfaceDrawSubscription() {
            if (!adapterContract || typeof adapterContract.subscribeSurfaceDraws !== 'function') return false;
            return adapterContract.subscribeSurfaceDraws({
                token: 'window-contents-bitmap-draws',
                onDraw(payload, event) {
                    return callController('handleSurfaceDrawText', payload, event);
                },
            });
        }

        function installBitmapDrawBatchSubscription() {
            if (!bitmapDraws || typeof bitmapDraws.subscribeDrawBatches !== 'function') return false;
            return bitmapDraws.subscribeDrawBatches({
                adapterId: ADAPTER_ID,
                token: 'window-contents-bitmap-draws',
                priority: 100,
                onBatch(batch) {
                    if (!batch || !batch.bitmap || typeof batch.forEachUnconsumed !== 'function') return 0;
                    let handled = 0;
                    batch.forEachUnconsumed((unit) => {
                        if (!unit || batch.isConsumed(unit)) return;
                        const result = callController('handleSurfaceDrawText', {
                            bitmap: batch.bitmap,
                            target: batch.bitmap,
                            methodName: unit.methodName,
                            text: unit.text,
                            rawText: unit.text,
                            x: unit.x,
                            y: unit.y,
                            maxWidth: unit.maxWidth,
                            lineHeight: unit.lineHeight,
                            align: unit.align,
                            drawState: unit.drawState,
                            backgroundPatch: unit.backgroundPatch,
                            measuredWidth: 0,
                            sourceAdapter: 'bitmap',
                            ownershipStatus: 'claimed',
                        }, {
                            type: 'bitmap.drawBatch',
                            sourceAdapter: 'bitmap',
                            status: 'claimed',
                            reason: batch.reason || 'bitmap-draw-batch',
                            postDraw: true,
                        });
                        if (!result || typeof result !== 'object') return;
                        batch.consume(unit, ADAPTER_ID);
                        handled += 1;
                    });
                    return handled;
                },
            });
        }

        function installWindowBaseWrappers() {
            logger.debug('[WindowText] Installing Window_Base text adapter.');

            const currentDrawText = Window_Base.prototype.drawText;
            const currentDrawTextEx = Window_Base.prototype.drawTextEx;
            if (currentDrawText
                && currentDrawTextEx
                && hasHookInChain(currentDrawText, '__trWindowTextWrapper', WINDOW_WRAPPER_TOKEN)
                && hasHookInChain(currentDrawTextEx, '__trWindowTextWrapper', WINDOW_WRAPPER_TOKEN)) {
                return publicHelpers;
            }

            const originalDrawText = currentDrawText;
            const originalDrawTextEx = currentDrawTextEx;

            Window_Base.prototype.drawText = function(text, x, y, maxWidth, align) {
                return callController('handleDrawText', this, originalDrawText, text, x, y, maxWidth, align);
            };
            Window_Base.prototype.drawText.__trOriginal = originalDrawText;
            Window_Base.prototype.drawText.__trWindowTextWrapper = WINDOW_WRAPPER_TOKEN;

            Window_Base.prototype.drawTextEx = function(text, x, y) {
                return callController('handleDrawTextEx', this, originalDrawTextEx, text, x, y);
            };
            Window_Base.prototype.drawTextEx.__trOriginal = originalDrawTextEx;
            Window_Base.prototype.drawTextEx.__trWindowTextWrapper = WINDOW_WRAPPER_TOKEN;

            return publicHelpers;
        }

        function hasHookInChain(fn, property, token) {
            const seen = [];
            let current = typeof fn === 'function' ? fn : null;
            while (current && seen.indexOf(current) < 0) {
                if (current[property] === token) return true;
                seen.push(current);
                current = typeof current.__trOriginal === 'function' ? current.__trOriginal : null;
            }
            return false;
        }

        return { install };
    }

    function hasRequiredOrchestrator(adapterContract) {
        return !!(adapterContract
            && typeof adapterContract.hasRequiredMethods === 'function'
            && adapterContract.hasRequiredMethods(REQUIRED_ORCHESTRATOR_METHODS));
    }

    function readRedrawSettings(settings) {
        const source = settings && settings.redraw && typeof settings.redraw === 'object'
            ? settings.redraw
            : {};
        return {
            extraPadding: nonNegativeNumber(source.extraPadding, 0),
            defaultOutline: nonNegativeNumber(source.defaultOutline, 0),
        };
    }

    function nonNegativeNumber(value, fallback) {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric >= 0 ? numeric : fallback;
    }

    function readDetachedEntryLimit(settings) {
        const numeric = Number(settings && settings.detachedWindowTextEntryLimit);
        return Number.isFinite(numeric) && numeric > 0
            ? Math.floor(numeric)
            : DEFAULT_DETACHED_ENTRY_LIMIT;
    }

    defineRuntimeModule('adapters.windowText', {
        install: installWindowTextAdapter,
    });
})();
