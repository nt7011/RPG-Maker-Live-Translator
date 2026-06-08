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
    const renderTransaction = requireRuntimeModule('runtime.renderTransaction');
    const entryLifecycleState = requireRuntimeModule('runtime.entryLifecycle');
    if (!entryLifecycleState || typeof entryLifecycleState.isStale !== 'function') {
        throw new Error('[LiveTranslator] runtime.entryLifecycle is unavailable before adapters/window-text-adapter.js.');
    }
    const windowTextControllers = {
        services: requireRuntimeModule('adapters.windowTextServices'),
        controllerFacades: requireRuntimeModule('adapters.windowTextControllerFacades'),
        subscriptionController: requireRuntimeModule('adapters.windowTextSubscriptionController'),
        drawObserver: requireRuntimeModule('adapters.windowTextDrawObserver'),
        entryService: requireRuntimeModule('adapters.windowTextEntryService'),
        renderPlanner: requireRuntimeModule('adapters.windowTextRenderPlanner'),
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
            surfaceOwnership = null,
            settings = {},
            textCodec = null,
            stripControls,
            createTextSource,
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
        if (!textCodec
            || typeof textCodec.createPlainTextSource !== 'function'
            || typeof textCodec.sanitizeDrawTextOutput !== 'function'
            || typeof textCodec.countIconEscapes !== 'function'
            || typeof stripControls !== 'function'
            || typeof createTextSource !== 'function'
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
            surfaceOwnership,
            settings,
            textCodec,
            stripControls,
            createTextSource,
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
            planTranslatedRedraw: 'renderPlanner',
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
            queueRenderRetry: 'entryLifecycle',
            clearPendingInvalidation: 'entryLifecycle',
            getCurrentEntry: 'entryLifecycle',
            getTextEntryKey: 'entryLifecycle',
            dropRenderRetry: 'entryLifecycle',
            beginEntryNativeSourceDraw: 'entryLifecycle',
            completeEntryNativeSourceDraw: 'entryLifecycle',
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
            DETACHED_ENTRY_LIMIT: detachedEntryLimit,
            textScaleOthers,
            ADAPTER_ID,
            ADAPTER_LABEL,
            RENDER_STRATEGY,
            WINDOW_PRIORITY_VISIBLE,
            WINDOW_WRAPPER_TOKEN,
            REDRAW_DIAGNOSTIC_ITEM_LIMIT,
            MAX_BACKGROUND_SNAPSHOT_PIXELS,
            renderTransaction,
            entryLifecycleState,
            install,
            installWindowBaseWrappers,
            installSurfaceDrawSubscription,
            hasHookInChain,
        });
        controllerContext.services = windowTextControllers.services.create(controllerContext);
        controllerContext.facades = windowTextControllers.controllerFacades.create({
            callController,
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
                    collectBitmapWindowDrawGroups(batch).forEach((group) => {
                        if (!group || !Array.isArray(group.units) || !group.units.length) return;
                        if (group.units.some((unit) => batch.isConsumed(unit))) return;
                        const payload = createBitmapWindowDrawPayload(batch, group.units);
                        if (!payload) return;
                        const result = callController('handleSurfaceDrawText', payload, {
                            type: 'bitmap.drawBatch',
                            sourceAdapter: 'bitmap',
                            status: 'claimed',
                            reason: batch.reason || 'bitmap-draw-batch',
                            postDraw: true,
                        });
                        if (!result || typeof result !== 'object') return;
                        group.units.forEach((unit) => batch.consume(unit, ADAPTER_ID));
                        handled += group.units.length;
                    });
                    return handled;
                },
            });
        }

        function collectBitmapWindowDrawGroups(batch) {
            const groups = [];
            let activeRun = null;
            batch.forEachUnconsumed((unit) => {
                if (!unit || batch.isConsumed(unit)) return;
                // processNormalCharacter writes one bitmap draw per glyph. When a
                // later plugin has bypassed the Window_Base.drawTextEx wrapper, the
                // draw-hub run id is the only durable text-run boundary left.
                const runKey = createNormalCharacterRunKey(unit);
                if (runKey && activeRun && activeRun.runKey === runKey) {
                    activeRun.units.push(unit);
                    return;
                }
                const group = { runKey, units: [unit] };
                groups.push(group);
                activeRun = runKey ? group : null;
            });
            return groups;
        }

        function createNormalCharacterRunKey(unit) {
            if (!unit || unit.normalCharacter !== true || !unit.normalCharacterRunId) return '';
            return [
                String(unit.normalCharacterRunId || ''),
                String(unit.methodName || 'drawText'),
                String(unit.styleId || ''),
                String(unit.align || ''),
                formatDrawGroupNumber(unit.y),
                formatDrawGroupNumber(unit.lineHeight),
            ].join('|');
        }

        function createBitmapWindowDrawPayload(batch, units) {
            const ordered = units.slice().sort(compareBitmapDrawUnits);
            const first = ordered[0];
            if (!first) return null;
            const text = ordered.map((unit) => String(unit && unit.text !== undefined ? unit.text : '')).join('');
            if (!text) return null;
            const bounds = measureBitmapDrawUnits(ordered);
            const x = finiteBitmapDrawNumber(first.x, 0);
            const y = finiteBitmapDrawNumber(first.y, 0);
            const maxWidth = Math.max(0, bounds.x2 - x, finiteBitmapDrawNumber(first.maxWidth, 0));
            const lineHeight = Math.max(1, ...ordered.map((unit) => finiteBitmapDrawNumber(unit && unit.lineHeight, 0)));
            return {
                bitmap: batch.bitmap,
                target: batch.bitmap,
                methodName: first.methodName,
                text,
                rawText: text,
                x,
                y,
                maxWidth,
                lineHeight,
                align: first.align,
                ownerType: first.ownerType,
                drawState: first.drawState,
                backgroundPatch: first.backgroundPatch || null,
                measuredWidth: Math.max(0, bounds.x2 - bounds.x1),
                sourceAdapter: 'bitmap',
                ownershipStatus: 'claimed',
            };
        }

        function compareBitmapDrawUnits(left, right) {
            const leftOrder = Number(left && left.order);
            const rightOrder = Number(right && right.order);
            if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) {
                return leftOrder - rightOrder;
            }
            const leftX = finiteBitmapDrawNumber(left && left.x, 0);
            const rightX = finiteBitmapDrawNumber(right && right.x, 0);
            if (leftX !== rightX) return leftX - rightX;
            return finiteBitmapDrawNumber(left && left.y, 0) - finiteBitmapDrawNumber(right && right.y, 0);
        }

        function measureBitmapDrawUnits(units) {
            return units.reduce((bounds, unit) => {
                const x = finiteBitmapDrawNumber(unit && unit.x, 0);
                const y = finiteBitmapDrawNumber(unit && unit.y, 0);
                const width = Math.max(0, finiteBitmapDrawNumber(unit && unit.maxWidth, 0));
                const height = Math.max(1, finiteBitmapDrawNumber(unit && unit.lineHeight, 1));
                return {
                    x1: Math.min(bounds.x1, x),
                    y1: Math.min(bounds.y1, y),
                    x2: Math.max(bounds.x2, x + width),
                    y2: Math.max(bounds.y2, y + height),
                };
            }, { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
        }

        function formatDrawGroupNumber(value) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? String(Math.round(numeric * 1000) / 1000) : '';
        }

        function finiteBitmapDrawNumber(value, fallback) {
            const numeric = Number(value);
            return Number.isFinite(numeric) ? numeric : fallback;
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
