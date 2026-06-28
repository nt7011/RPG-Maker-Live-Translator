// Window_Base text adapter.
//
// This module observes Window_Base.drawText/drawTextEx calls and reports those
// draw slots to TextOrchestrator. The adapter keeps only rendering mechanics:
// bitmap state capture, scoped redraw, replay around the replaced pixels, and
// validation that the target window/entry still exists before drawing.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.windowText',
        requires: {
            renderTransaction: 'runtime.renderTransaction',
            bitmapRenderOps: 'runtime.bitmapRenderOps',
            entryLifecycleState: 'runtime.entryLifecycle',
            hookWrapper: 'runtime.hookWrapper',
            services: 'adapters.windowText.services',
            controllerFacades: 'adapters.windowText.controllerFacades',
            subscriptionController: 'adapters.windowText.subscriptionController',
            drawObserver: 'adapters.windowText.drawObserver',
            entryService: 'adapters.windowText.entryService',
            renderPlanner: 'adapters.windowText.renderPlanner',
            renderProof: 'adapters.windowText.renderProof',
            renderPending: 'adapters.windowText.renderPending',
            renderDraw: 'adapters.windowText.renderDraw',
            entryLifecycle: 'adapters.windowText.entryLifecycle',
            textMeasure: 'adapters.windowText.textMeasure',
            bitmapReplay: 'adapters.windowText.bitmapReplay',
        },
        factory({
            renderTransaction,
            bitmapRenderOps,
            entryLifecycleState,
            hookWrapper,
            services,
            controllerFacades,
            subscriptionController,
            drawObserver,
            entryService,
            renderPlanner,
            renderProof,
            renderPending,
            renderDraw,
            entryLifecycle,
            textMeasure,
            bitmapReplay,
        }, { scope: globalScope }) {
    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.adapters) {
        globalScope.LiveTranslatorModules.adapters = {};
    }
    const { hasHookInChain } = hookWrapper;
    const windowTextControllers = {
        services,
        controllerFacades,
        subscriptionController,
        drawObserver,
        entryService,
        renderPlanner,
        renderProof,
        renderPending,
        renderDraw,
        entryLifecycle,
        textMeasure,
        bitmapReplay,
    };

    const ADAPTER_ID = 'window';
    const ADAPTER_LABEL = 'Window Text';
    const RENDER_STRATEGY = 'windowTextRedraw';
    const WINDOW_PRIORITY_VISIBLE = 650;
    const BITMAP_TEXT_RUN_CLAIM_ORDER = 0;
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
        'recordRenderCommitted',
        'recordRenderDeferred',
        'recordRenderRejected',
        'queueStoredRenderCommand',
        'notifyRenderCommandReady',
        'getUnresolvedRenderCommandsForItem',
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
        const { logger, adapterContract, resolveTextScalePercent, settings, bitmapDraws, windowRegistry, registeredWindows, surfaceOwnership } = context;
        const entriesByRecordId = new Map();
        const detachedEntriesByRecordId = new Map();
        const sourceRunEntriesByKey = new Map();
        const sourceRunEntryKeys = new WeakMap();
        const detachedEntryLimit = readDetachedEntryLimit(settings);
        let bitmapMutationParticipantInstalled = false;
        const restoredMutationSourcesByContext = new WeakMap();
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
            findEntryBySourceRun: 'entryService',
            forgetEntrySourceRun: 'entryService',
            firstNonEmptyString: 'entryService',
            recordDrawTrace: 'entryService',
            windowTraceDetails: 'entryService',
            getRegisteredWindowData: 'entryService',
            markEntryObservedInRefresh: 'entryService',
            safeStripRpgmEscapes: 'entryService',
            describeWindowScreenState: 'entryService',
            buildOrchestratorPayload: 'entryService',
            planTranslatedRedraw: 'renderPlanner',
            planWindowBitmapReplay: 'renderPlanner',
            planWindowBitmapRedraw: 'renderPlanner',
            planWindowCopiedTargetRedraw: 'renderPlanner',
            resolveDetachedRenderTarget: 'renderProof',
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
            retireEntriesInExactSlot: 'entryLifecycle',
            retireEntriesForReplacementDraw: 'entryLifecycle',
            markEntryStale: 'entryLifecycle',
            rememberDetachedEntry: 'entryLifecycle',
            takeDetachedEntry: 'entryLifecycle',
            peekDetachedEntry: 'entryLifecycle',
            forgetEntryRecord: 'entryLifecycle',
            cancelEntryTranslation: 'entryLifecycle',
            markRecordDisappeared: 'entryLifecycle',
            recordDecision: 'entryLifecycle',
            scheduleRenderRetry: 'entryLifecycle',
            clearPendingInvalidation: 'entryLifecycle',
            getCurrentEntry: 'entryLifecycle',
            getTextEntryKey: 'entryLifecycle',
            dropScheduledRenderRetry: 'entryLifecycle',
            beginEntryNativeSourceDraw: 'entryLifecycle',
            completeEntryNativeSourceDraw: 'entryLifecycle',
            resolveWindowData: 'entryLifecycle',
            resolveTargetWindow: 'entryLifecycle',
            isWindowReadyForRedraw: 'entryLifecycle',
            refreshEntryBounds: 'entryLifecycle',
            invalidateEntriesForBitmapMutation: 'entryLifecycle',
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
            normalizeDrawTextAlignValue: 'textMeasure',
            mergeBounds: 'bitmapReplay',
            isValidRect: 'bitmapReplay',
            roundDiagnosticNumber: 'bitmapReplay',
            cloneDiagnosticRect: 'bitmapReplay',
            cloneDiagnosticArea: 'bitmapReplay',
            calculateBitmapSurfaceTextYOffset: 'bitmapReplay',
            estimateBitmapSurfaceTextBounds: 'bitmapReplay',
            withWindowRedrawClear: 'bitmapReplay',
            isWindowRedrawClearActive: 'bitmapReplay',
            withWindowContents: 'bitmapReplay',
            isUsableBitmap: 'bitmapReplay',
            getRedrawContents: 'bitmapReplay',
            wasDrawnToDetachedContents: 'bitmapReplay',
            isTransientRefreshWindow: 'bitmapReplay',
            isCoreRefreshWindowType: 'bitmapReplay',
            getBitmapReplayApi: 'bitmapReplay',
            registerCopiedWindowTextTargetProvider: 'bitmapReplay',
            assignWindowTextDrawOrder: 'bitmapReplay',
            rememberInlineReplacement: 'bitmapReplay',
            captureWindowEntrySource: 'bitmapReplay',
            restoreWindowEntrySource: 'bitmapReplay',
            restoreEntriesForBitmapMutation: 'bitmapReplay',
            redrawRestoredEntriesForBitmapMutation: 'bitmapReplay',
            materializeCopiedTargetsBeforeBitmapMutation: 'bitmapReplay',
            redrawMaterializedCopiedTargetsAfterBitmapMutation: 'bitmapReplay',
            invalidateCopiedTargetsForBitmapMutation: 'bitmapReplay',
            hasLedgerCopiedTargetsForBitmap: 'bitmapReplay',
            materializeCopiedRenderTargetsForEntry: 'bitmapReplay',
            redrawCopiedWindowTextTargets: 'bitmapReplay',
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
            materializeCopiedTargetsBeforeBitmapMutation(...args) {
                return callController('materializeCopiedTargetsBeforeBitmapMutation', ...args);
            },
            redrawMaterializedCopiedTargetsAfterBitmapMutation(...args) {
                return callController('redrawMaterializedCopiedTargetsAfterBitmapMutation', ...args);
            },
            invalidateCopiedTargetsForBitmapMutation(...args) {
                return callController('invalidateCopiedTargetsForBitmapMutation', ...args);
            },
            hasLedgerCopiedTargetsForBitmap(...args) {
                return callController('hasLedgerCopiedTargetsForBitmap', ...args);
            },
            materializeCopiedRenderTargetsForEntry(...args) {
                return callController('materializeCopiedRenderTargetsForEntry', ...args);
            },
            withWindowTranslatedDrawScope(...args) {
                return callController('withWindowTranslatedDrawScope', ...args);
            },
        };
        const controllerContext = Object.assign({}, context, {
            entriesByRecordId,
            detachedEntriesByRecordId,
            sourceRunEntriesByKey,
            sourceRunEntryKeys,
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
            installBitmapMutationParticipant,
            hasHookInChain,
        });
        controllerContext.services = windowTextControllers.services.create(controllerContext);
        controllerContext.facades = windowTextControllers.controllerFacades.create({
            callController,
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
            installBitmapTextRunSubscription();
            installCopiedTargetProvider();
            installBitmapMutationParticipant();
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

        function installBitmapTextRunSubscription() {
            if (!bitmapDraws || typeof bitmapDraws.subscribeTextRuns !== 'function') return false;
            return bitmapDraws.subscribeTextRuns({
                adapterId: ADAPTER_ID,
                token: 'window-contents-bitmap-draws',
                claimOrder: BITMAP_TEXT_RUN_CLAIM_ORDER,
                onRun(run, dispatch, metadata = {}) {
                    if (!run || !Array.isArray(run.units) || !run.units.length) return 0;
                    if (typeof metadata.createSurfaceDrawPayload !== 'function') return 0;
                    const payload = metadata.createSurfaceDrawPayload(run);
                    if (!payload) return 0;
                    const result = callController('handleSurfaceDrawText', payload, {
                        type: 'bitmap.textRun',
                        sourceAdapter: 'bitmap',
                        phase: 'source-draw-committed',
                        sourcePhase: 'source-draw-committed',
                        sourceCommitted: true,
                        nativeDrawCapability: 'committed',
                        canReplaceNativeDraw: false,
                        canSuppressNativeDraw: false,
                        status: 'claimed',
                        reason: dispatch && dispatch.reason || 'bitmap-text-run',
                        postDraw: true,
                    });
                    if (!result || typeof result !== 'object') return 0;
                    return typeof metadata.consume === 'function'
                        ? metadata.consume(run, ADAPTER_ID)
                        : 0;
                },
            });
        }

        function installCopiedTargetProvider() {
            return callController('registerCopiedWindowTextTargetProvider') === true;
        }

        function installBitmapMutationParticipant() {
            if (bitmapMutationParticipantInstalled) return true;
            if (!bitmapDraws || typeof bitmapDraws.registerMutationParticipant !== 'function') return false;
            bitmapMutationParticipantInstalled = true;
            const copiedTargetMaterializationsByContext = new WeakMap();
            if (typeof bitmapDraws.registerMutationInterestProvider === 'function') {
                bitmapDraws.registerMutationInterestProvider({
                    token: 'window-copied-target-materialization',
                    hasMutationInterest(bitmap) {
                        return hasCopiedWindowTargets(bitmap);
                    },
                    getMutationCapabilities(bitmap, input) {
                        return collectWindowBitmapMutationCapabilities(bitmap, input);
                    },
                });
            }
            bitmapDraws.registerMutationParticipant({
                name: 'source-restore',
                capability: 'source-restore',
                order: 20,
                beforeNative(context) {
                    const restored = restoreSourceForBitmapMutation(context, createBitmapMutationDescriptor(context));
                    if (restored.length) restoredMutationSourcesByContext.set(context, restored);
                    return { restoredWindowSources: restored.length };
                },
                afterNativeSuccess(context) {
                    return redrawRestoredSourcesForBitmapMutation(context);
                },
                afterNativeFailure(context) {
                    return redrawRestoredSourcesForBitmapMutation(context);
                },
            });
            bitmapDraws.registerMutationParticipant({
                name: 'window-invalidation',
                capability: 'invalidation',
                order: 75,
                shouldRun(context) {
                    return hasWindowMutationInvalidationTarget(context && context.bitmap, context && context.methodName);
                },
                afterNativeSuccess(context) {
                    const mutation = createBitmapMutationDescriptor(context);
                    const invalidated = callController(
                        'invalidateEntriesForBitmapMutation',
                        context.bitmap,
                        mutation.rect,
                        context.methodName || 'bitmap',
                        {
                            sourceBitmap: mutation.sourceBitmap,
                            sourceRect: mutation.sourceRect,
                            full: mutation.full === true,
                        }
                    );
                    return { invalidatedWindowEntries: Number(invalidated) || 0 };
                },
            });
            bitmapDraws.registerMutationParticipant({
                name: 'window-copied-target-materialization',
                capabilities: ['copied-target-materialization', 'observer'],
                order: 85,
                shouldRun(context) {
                    return isCopiedWindowTextMutationContext(context) || hasCopiedWindowTargets(context && context.bitmap);
                },
                beforeNative(context) {
                    const mutation = createBitmapMutationDescriptor(context);
                    const materialized = callController(
                        'materializeCopiedTargetsBeforeBitmapMutation',
                        context.bitmap,
                        context.methodName,
                        mutation
                    );
                    const targets = Array.isArray(materialized) ? materialized : [];
                    if (targets.length) {
                        copiedTargetMaterializationsByContext.set(context, targets);
                        appendCopiedTargetProjectionRecords(context, targets);
                    }
                    return { materializedWindowCopiedTargets: targets.length };
                },
                afterNativeSuccess(context) {
                    const materialized = copiedTargetMaterializationsByContext.get(context) || [];
                    copiedTargetMaterializationsByContext.delete(context);
                    const mutation = createBitmapMutationDescriptor(context);
                    // A mutation first invalidates any stale copied targets in
                    // the affected area, then redraws targets materialized from
                    // the just-copied source. Reversing this order erases the
                    // fresh copy target immediately.
                    const invalidated = callController(
                        'invalidateCopiedTargetsForBitmapMutation',
                        context.bitmap,
                        context.targetRect || null,
                        `${context.methodName || 'bitmap'}-bitmap`
                    );
                    const redrawn = materialized.length
                        ? callController('redrawMaterializedCopiedTargetsAfterBitmapMutation', context.bitmap, context.methodName, mutation, materialized)
                        : null;
                    return {
                        committedWindowCopiedTargets: Number(redrawn && redrawn.committed) || 0,
                        redrawnWindowCopiedTargets: Number(redrawn && redrawn.redrawn) || 0,
                        invalidatedWindowCopiedTargets: Number(invalidated) || 0,
                    };
                },
                afterNativeFailure(context) {
                    copiedTargetMaterializationsByContext.delete(context);
                },
            });
            return true;
        }

        function appendCopiedTargetProjectionRecords(context, materialized) {
            if (!context || typeof context.setMetadata !== 'function') return;
            const records = collectCopiedTargetProjectionRecords(materialized);
            if (!records.length) return;
            const existing = typeof context.getMetadata === 'function'
                ? context.getMetadata('copiedTargetProjectionRecords')
                : [];
            context.setMetadata(
                'copiedTargetProjectionRecords',
                Array.isArray(existing) ? existing.concat(records) : records
            );
        }

        function collectCopiedTargetProjectionRecords(materialized) {
            const records = [];
            (Array.isArray(materialized) ? materialized : []).forEach((item) => {
                if (item && item.projectionRecord) records.push(item.projectionRecord);
            });
            return records;
        }

        function collectWindowBitmapMutationCapabilities(bitmap, input = {}) {
            const methodName = String(input && input.methodName || '');
            const args = Array.isArray(input && input.args) ? input.args : [];
            const capabilities = [];
            const sourceBitmap = getWindowSourceBitmapForMutation(bitmap, methodName, args);
            if (hasWindowMutationInvalidationTarget(bitmap, methodName)) pushCapability(capabilities, 'invalidation');
            if (sourceBitmap && hasWindowTextEntriesForBitmap(sourceBitmap)) {
                pushCapability(capabilities, 'source-restore');
                if (methodName === 'blt' || methodName === 'bltImage') {
                    pushCapability(capabilities, 'surface-ledger');
                    pushCapability(capabilities, 'copy-lineage');
                    pushCapability(capabilities, 'copied-target-materialization');
                }
            }
            if ((methodName === 'blt' || methodName === 'bltImage')
                && sourceBitmap
                && hasPendingWindowDrawUnits(sourceBitmap)) {
                pushCapability(capabilities, 'pending-source-drain');
                pushCapability(capabilities, 'surface-ledger');
                pushCapability(capabilities, 'copy-lineage');
                pushCapability(capabilities, 'copied-target-materialization');
            }
            if (hasCopiedWindowTargets(bitmap)) pushCapability(capabilities, 'copied-target-materialization');
            return capabilities;
        }

        function hasWindowMutationInvalidationTarget(bitmap, methodName) {
            if (hasWindowTextEntriesForBitmap(bitmap)) return true;
            return !!(bitmap
                && bitmapRenderOps
                && typeof bitmapRenderOps.isWindowSurfaceReplayMutation === 'function'
                && bitmapRenderOps.isWindowSurfaceReplayMutation(methodName) === true
                && hasWindowBitmapSurface(bitmap));
        }

        function getWindowSourceBitmapForMutation(bitmap, methodName, args) {
            switch (methodName) {
            case 'blt':
            case 'bltImage':
                return args && args[0] || null;
            case 'resize':
            case 'adjustTone':
            case 'rotateHue':
            case 'blur':
                return bitmap || null;
            default:
                return null;
            }
        }

        function hasWindowTextEntriesForBitmap(bitmap) {
            if (!bitmap || !registeredWindows || typeof registeredWindows.forEach !== 'function') return false;
            let found = false;
            try {
                registeredWindows.forEach((windowInstance) => {
                    if (found || !windowInstance) return;
                    const data = windowRegistry && typeof windowRegistry.get === 'function'
                        ? windowRegistry.get(windowInstance)
                        : null;
                    if (!data || !data.texts || typeof data.texts.forEach !== 'function') return;
                    data.texts.forEach((entry) => {
                        if (found || !entry) return;
                        if (entry.contentsBitmap === bitmap || data.contentsBitmap === bitmap || windowInstance.contents === bitmap) {
                            found = true;
                        }
                    });
                });
            } catch (_) {
                return false;
            }
            return found;
        }

        function hasPendingWindowDrawUnits(bitmap) {
            if (!hasWindowBitmapSurface(bitmap)) return false;
            if (!bitmapDraws || typeof bitmapDraws.hasPendingDrawUnits !== 'function') return false;
            try {
                return bitmapDraws.hasPendingDrawUnits(bitmap) === true;
            } catch (_) {
                return false;
            }
        }

        function hasWindowBitmapSurface(bitmap) {
            if (surfaceOwnership && typeof surfaceOwnership.isWindowOwnedBitmap === 'function') {
                try {
                    if (surfaceOwnership.isWindowOwnedBitmap(bitmap) === true) return true;
                } catch (_) {
                    // Fall back to the registry scan below; the provider should
                    // remain conservative if ownership metadata is unavailable.
                }
            }
            if (!bitmap || !registeredWindows || typeof registeredWindows.forEach !== 'function') return false;
            let found = false;
            try {
                registeredWindows.forEach((windowInstance) => {
                    if (found || !windowInstance) return;
                    const data = windowRegistry && typeof windowRegistry.get === 'function'
                        ? windowRegistry.get(windowInstance)
                        : null;
                    if ((data && data.contentsBitmap === bitmap) || windowInstance.contents === bitmap) {
                        found = true;
                    }
                });
            } catch (_) {
                return false;
            }
            return found;
        }

        function pushCapability(capabilities, value) {
            const capability = String(value || '');
            if (capability && capabilities.indexOf(capability) < 0) capabilities.push(capability);
        }

        function restoreSourceForBitmapMutation(context, mutation) {
            if (!mutation || !mutation.sourceBitmap || !mutation.sourceRect) return [];
            let count = 0;
            try {
                count = callController(
                    'restoreEntriesForBitmapMutation',
                    mutation.sourceBitmap,
                    mutation.sourceRect,
                    `${context && context.methodName || 'bitmap'}-source`
                );
            } catch (_) {
                return [];
            }
            return Number(count) > 0 ? [mutation.sourceBitmap] : [];
        }

        function redrawRestoredSourcesForBitmapMutation(context) {
            const restored = restoredMutationSourcesByContext.get(context) || [];
            restoredMutationSourcesByContext.delete(context);
            let redrawn = 0;
            restored.forEach((bitmap) => {
                try {
                    redrawn += Number(callController(
                        'redrawRestoredEntriesForBitmapMutation',
                        bitmap,
                        `${context && context.methodName || 'bitmap'}-source`
                    )) || 0;
                } catch (_) {}
            });
            return { redrawnWindowSources: redrawn };
        }

        function isCopiedWindowTextMutationContext(context) {
            const method = String(context && context.methodName || '');
            return !!(context
                && (method === 'blt' || method === 'bltImage')
                && context.sourceBitmap
                && context.sourceRect
                && context.targetRect);
        }

        function hasCopiedWindowTargets(bitmap) {
            if (!bitmap) return false;
            try {
                return callController('hasLedgerCopiedTargetsForBitmap', bitmap) === true;
            } catch (_) {
                return false;
            }
        }

        function createBitmapMutationDescriptor(context) {
            const targetRestoreMaterial = getCopiedTargetRestoreMaterialDescriptor(context);
            return {
                rect: cloneBitmapMutationRect(context && context.targetRect),
                sourceBitmap: context && context.sourceBitmap || null,
                sourceRect: cloneBitmapMutationRect(context && context.sourceRect),
                full: context && context.full === true,
                clearReplay: context && context.clearReplay || '',
                recordOp: context && (context.recordOp || context.replayOp) || null,
                targetRestoreMaterialId: targetRestoreMaterial ? targetRestoreMaterial.materialId : '',
                targetRestoreRect: targetRestoreMaterial ? targetRestoreMaterial.rect : null,
                targetRestoreRevisionBefore: targetRestoreMaterial ? targetRestoreMaterial.targetRevisionBefore : undefined,
            };
        }

        function getCopiedTargetRestoreMaterialDescriptor(context) {
            if (!context || typeof context.getMetadata !== 'function') return null;
            const material = context.getMetadata('copiedTargetRestoreMaterial');
            const materialId = String(material && material.materialId || '');
            if (!materialId) return null;
            return {
                materialId,
                rect: cloneBitmapMutationRect(material.rect),
                targetRevisionBefore: Number(material.targetRevisionBefore),
            };
        }

        function cloneBitmapMutationRect(rect) {
            if (!rect || typeof rect !== 'object') return null;
            return {
                x1: Number(rect.x1),
                y1: Number(rect.y1),
                x2: Number(rect.x2),
                y2: Number(rect.y2),
            };
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

            hookWrapper.installMethodWrapper(Window_Base.prototype, 'drawText', {
                property: '__trWindowTextWrapper',
                token: WINDOW_WRAPPER_TOKEN,
                createWrapper(original) {
                    return function(text, x, y, maxWidth, align) {
                        return callController('handleDrawText', this, original, text, x, y, maxWidth, align);
                    };
                },
            });

            hookWrapper.installMethodWrapper(Window_Base.prototype, 'drawTextEx', {
                property: '__trWindowTextWrapper',
                token: WINDOW_WRAPPER_TOKEN,
                createWrapper(original) {
                    return function(text, x, y) {
                        const originalArgs = Array.prototype.slice.call(arguments);
                        return callController('handleDrawTextEx', this, original, text, x, y, originalArgs);
                    };
                },
            });

            return publicHelpers;
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

            return {
                install: installWindowTextAdapter,
            };
        },
    });
})();
