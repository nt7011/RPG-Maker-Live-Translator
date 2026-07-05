// Bitmap text adapter facade.
// Heavy draw, fallback run-record, mutation, replay, and record logic lives in adapters/bitmap-text/*.js.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.bitmapText',
        requires: {
            measuredBounds: 'runtime.measuredBounds',
            operationIntel: 'runtime.operationIntel',
            renderTransaction: 'runtime.renderTransaction',
            controllerFacades: 'adapters.bitmapText.controllerFacades',
            install: 'adapters.bitmapText.install',
            drawCapture: 'adapters.bitmapText.drawCapture',
            drawIntel: 'adapters.bitmapText.drawIntel',
            drawPolicy: 'adapters.bitmapText.drawPolicy',
            fallbackObserver: 'adapters.bitmapText.fallbackObserver',
            fallbackRenderer: 'adapters.bitmapText.fallbackRenderer',
            copiedTargets: 'adapters.bitmapText.copiedTargets',
            fallbackRunRecords: 'adapters.bitmapText.fallbackRunRecords',
            records: 'adapters.bitmapText.records',
            mutations: 'adapters.bitmapText.mutations',
            mutationDescriptor: 'adapters.bitmapText.mutationDescriptor',
            mutationIntel: 'adapters.bitmapText.mutationIntel',
            mutationInterest: 'adapters.bitmapText.mutationInterest',
            mutationInvalidation: 'adapters.bitmapText.mutationInvalidation',
            mutationJournal: 'adapters.bitmapText.mutationJournal',
            mutationNative: 'adapters.bitmapText.mutationNative',
            mutationParticipants: 'adapters.bitmapText.mutationParticipants',
            mutationPolicy: 'adapters.bitmapText.mutationPolicy',
            frameMarkers: 'adapters.bitmapText.frameMarkers',
            replay: 'adapters.bitmapText.replay',
            textUtils: 'adapters.bitmapText.textUtils',
        },
        factory({
            measuredBounds,
            operationIntel,
            renderTransaction,
            controllerFacades,
            install,
            drawCapture,
            drawIntel,
            drawPolicy,
            fallbackObserver,
            fallbackRenderer,
            copiedTargets,
            fallbackRunRecords,
            records,
            mutations,
            mutationDescriptor,
            mutationIntel,
            mutationInterest,
            mutationInvalidation,
            mutationJournal,
            mutationNative,
            mutationParticipants,
            mutationPolicy,
            frameMarkers,
            replay,
            textUtils,
        }, { scope: globalScope }) {
            if (!globalScope.LiveTranslatorModules) globalScope.LiveTranslatorModules = {};
            if (!globalScope.LiveTranslatorModules.adapters) globalScope.LiveTranslatorModules.adapters = {};

            const controllers = {
                controllerFacades,
                install,
                drawCapture,
                drawIntel,
                drawPolicy,
                fallbackObserver,
                fallbackRenderer,
                copiedTargets,
                fallbackRunRecords,
                records,
                mutations,
                mutationDescriptor,
                mutationIntel,
                mutationInterest,
                mutationInvalidation,
                mutationJournal,
                mutationNative,
                mutationParticipants,
                mutationPolicy,
                frameMarkers,
                replay,
                textUtils,
            };

    const ADAPTER_ID = 'bitmap';
    const ADAPTER_LABEL = 'Bitmap Text';
    const SURFACE_TYPE = 'bitmap';
    const RENDER_STRATEGY = 'bitmapTextReplay';
    const BITMAP_PRIORITY = 450;
    const DRAW_WRAPPER_TOKEN = 'liveTranslator.bitmapText.draw.v1';
    const MUTATION_WRAPPER_TOKEN = 'liveTranslator.bitmapText.mutation.v1';
    const FRAME_FLUSH_TOKEN = 'liveTranslator.bitmapText.frameFlush.v1';
    const SMALL_TEXT_TOKEN = 'liveTranslator.bitmapText.smallText.v1';
    const NORMAL_CHAR_TOKEN = 'liveTranslator.bitmapText.normalCharacter.v1';
    const MAX_REPLAY_OPS = 256;
    const GAP_MIN = 6;
    const GAP_RATIO = 0.65;

    function installBitmapTextAdapter(context = {}) {
        return createBitmapTextAdapter(context).install();
    }

    function createBitmapTextAdapter(context = {}) {
        const perf = context.perf || {
            count() {},
            top() {},
            time() {},
            isEnabled() { return false; },
            now() { return Date.now(); },
        };
        const scope = {
            logger: context.logger || console,
            settings: context.settings && typeof context.settings === 'object' ? context.settings : {},
            traceLog: typeof context.traceLog === 'function' ? context.traceLog : () => {},
            hotTraceLog: typeof context.dbg === 'function' ? context.dbg : (typeof context.traceLog === 'function' ? context.traceLog : () => {}),
            preview: typeof context.preview === 'function' ? context.preview : (text) => String(text ?? ''),
            textCodec: requireTextCodec(context.textCodec, ADAPTER_LABEL),
            stripControls: typeof context.stripControls === 'function' ? context.stripControls : (text) => String(text ?? ''),
            createTextSource: requireTextSourceHelper(context.createTextSource, ADAPTER_LABEL),
            restoreText: typeof context.restoreText === 'function' ? context.restoreText : (translated) => translated,
            captureBitmapDrawState: typeof context.captureBitmapDrawState === 'function'
                ? context.captureBitmapDrawState
                : captureDefaultBitmapDrawState,
            applyBitmapDrawState: typeof context.applyBitmapDrawState === 'function'
                ? context.applyBitmapDrawState
                : applyDefaultBitmapDrawState,
            telemetry: context.telemetry || null,
            adapterContract: context.adapterContract || null,
            drawCaptureTrace: context.drawCaptureTrace || null,
            contentsOwners: context.contentsOwners || null,
            surfaceOwnership: context.surfaceOwnership || null,
            windowRegistry: context.windowRegistry || null,
            windowLifecycle: context.windowLifecycle || null,
            getWindowTextHelpers: typeof context.getWindowTextHelpers === 'function'
                ? context.getWindowTextHelpers
                : null,
            bitmapServices: normalizeBitmapServices(context.bitmapServices, {
                perf,
                logger: context.logger || console,
            }),
            reportAdapterError: operationIntel.createOperationErrorReporter({
                component: 'BitmapText',
                operationLabel: 'Adapter operation',
                metricBase: 'bitmapText.error',
                domain: 'bitmap',
                perf,
                logger: context.logger || console,
            }),
            measuredBounds,
            renderTransaction,
            PER_CHAR_MARK: typeof context.PER_CHAR_MARK === 'string' ? context.PER_CHAR_MARK : '',
            perCharPattern: null,
            perf,
            bitmapStates: new WeakMap(),
            entriesByItemId: new Map(),
            sourceRunEntriesByKey: new Map(),
            sourceRunEntryKeys: new WeakMap(),
            nativeTextInkByBitmap: new WeakMap(),
            maxNativeTextInkRects: 160,
            nextBitmapId: 0,
            nextEntryId: 0,
            nextNormalCharacterRunId: 0,
            frameFlushInstalled: false,
            smallTextDepth: 0,
            normalCharacterDepth: 0,
            controllerFacades: null,
            ADAPTER_ID, ADAPTER_LABEL, SURFACE_TYPE, RENDER_STRATEGY, BITMAP_PRIORITY,
            DRAW_WRAPPER_TOKEN, MUTATION_WRAPPER_TOKEN, FRAME_FLUSH_TOKEN, SMALL_TEXT_TOKEN,
            NORMAL_CHAR_TOKEN, MAX_REPLAY_OPS, GAP_MIN, GAP_RATIO,
        };
        scope.perCharPattern = scope.PER_CHAR_MARK ? new RegExp(scope.PER_CHAR_MARK, 'g') : null;
        scope.hasRequiredOrchestrator = hasRequiredOrchestrator;
        scope.isPerfEnabled = () => {
            try { return !!(scope.perf && typeof scope.perf.isEnabled === 'function' && scope.perf.isEnabled()); } catch (_) { return false; }
        };
        scope.measurePerf = (name, callback, options = null) => {
            if (typeof callback !== 'function') return undefined;
            if (!scope.isPerfEnabled() || !name || typeof scope.perf.time !== 'function') return callback();
            const perfOptions = normalizePerfOptions(options);
            if (typeof scope.perf.measure === 'function') {
                try { return scope.perf.measure(name, callback, perfOptions); } catch (error) { throw error; }
            }
            const start = typeof scope.perf.now === 'function' ? scope.perf.now() : Date.now();
            try {
                return callback();
            } finally {
                const end = typeof scope.perf.now === 'function' ? scope.perf.now() : Date.now();
                scope.perf.time(name, end - start, perfOptions);
            }
        };
        scope.createBitmapTextRegion = (...args) => createBitmapTextRegion(scope, ...args);
        scope.createBitmapTextBackdropRegion = (...args) => createBitmapTextBackdropRegion(scope, ...args);
        scope.isBitmapTextBackdropTrusted = (...args) => isBitmapTextBackdropTrusted(scope, ...args);
        scope.recordBitmapNativeTextInk = (...args) => recordBitmapNativeTextInk(scope, ...args);
        scope.hasBitmapNativeTextInkInterest = (bitmap) => hasBitmapNativeTextInkInterest(scope, bitmap);
        scope.applyBitmapNativePaintMutation = (...args) => applyBitmapNativePaintMutation(scope, ...args);

        const methodControllers = {
            install: 'install',
            installOrchestratorSubscription: 'install',
            registerBitmapCapabilities: 'install',
            exposeAdapterApi: 'install',
            installBitmapDrawWrappers: 'install',
            installBitmapDrawWrapper: 'install',
            installDeferredBitmapDrawWrapper: 'install',
            handleBitmapDrawText: 'install',
            beginBitmapTextDrawTransaction: 'drawCapture',
            beginBitmapDrawHookIntel: 'drawIntel',
            isBitmapDrawTraceEnabled: 'drawIntel',
            recordBitmapDrawEnterIfEnabled: 'drawIntel',
            recordBitmapDrawTransactionOutcome: 'drawIntel',
            createBitmapNativeDrawInvoker: 'drawIntel',
            finishBitmapDrawHookIntel: 'drawIntel',
            createBitmapDrawRoutingDecision: 'drawPolicy',
            resolveInlineBitmapReplacement: 'drawPolicy',
            handleBitmapTextRuns: 'fallbackObserver',
            flushFallbackRunRecords: 'fallbackRunRecords',
            observeEntry: 'records',
            requestEntryTranslation: 'records',
            applyRenderCommand: 'records',
            getRenderGeneration: 'records',
            isRenderTargetCurrent: 'records',
            handleRenderRejected: 'records',
            restoreTranslatedEntryText: 'records',
            executeBitmapFallbackRender: 'fallbackRenderer',
            markEntryTerminal: 'records',
            isEntryActive: 'records',
            getEntryStatus: 'records',
            isEntryRequestActive: 'records',
            isEntryCompleted: 'records',
            findEntryBySourceRun: 'records',
            getEntryObservationStatus: 'records',
            retireEntry: 'records',
            detachEntryForCopiedTargets: 'records',
            rejectUnresolvedRenderCommandsForInvalidation: 'records',
            getUnresolvedRenderCommandsForEntry: 'records',
            shouldKeepRecordAfterRenderRejection: 'records',
            isRenderApplicationFailure: 'records',
            normalizeRenderRejectionReason: 'records',
            installBitmapMutationHooks: 'mutations',
            installBitmapMutationHook: 'mutations',
            registerBitmapMutationParticipants: 'mutationParticipants',
            beginBitmapMutationTransaction: 'mutationJournal',
            applyNativeBitmapMutation: 'mutationNative',
            planBitmapMutationObservation: 'mutationInterest',
            shouldBypassMutation: 'mutationPolicy',
            getMutationBypassReason: 'mutationPolicy',
            hasMutationObserverInterest: 'mutationInterest',
            shouldHandleBitmapMutation: 'mutationInterest',
            hasBitmapStateMutationInterest: 'mutationInterest',
            hasPendingBitmapTextSource: 'mutationInterest',
            recordMutationHookDecision: 'mutationIntel',
            recordNativeMutationAttribution: 'mutationIntel',
            classifyBitmapMutationSurface: 'mutationIntel',
            bucketBitmapPixels: 'mutationIntel',
            bucketBitmapDimensions: 'mutationIntel',
            bucketDimension: 'mutationIntel',
            sanitizePerfLabel: 'mutationIntel',
            describeMutation: 'mutationDescriptor',
            createMutationJournalInput: 'mutationDescriptor',
            createLedgerMutationInput: 'mutationDescriptor',
            createMutationDescriptorFromJournalContext: 'mutationDescriptor',
            handleBitmapMutation: 'mutationInvalidation',
            invalidateEntriesInRect: 'mutationInvalidation',
            installFrameFlushHooks: 'frameMarkers',
            hasActiveFrameFlushHooks: 'frameMarkers',
            ensureActiveFrameFlushHooks: 'frameMarkers',
            ensureRecordedDrawDelivery: 'frameMarkers',
            installFrameFlushHook: 'frameMarkers',
            hasHookInChain: 'frameMarkers',
            installSmallTextMarkers: 'frameMarkers',
            installSmallTextMarker: 'frameMarkers',
            installNormalCharacterMarker: 'frameMarkers',
            isSmallTextDrawActive: 'frameMarkers',
            isNormalCharacterDrawActive: 'frameMarkers',
            isSmallTextScratchBitmap: 'frameMarkers',
            ensureBitmapState: 'replay',
            getBitmapState: 'replay',
            nextDrawOrder: 'replay',
            recordBitmapRenderOp: 'replay',
            recordNativeTextForReplay: 'replay',
            discardRenderOpsInRect: 'replay',
            withBitmapReplay: 'replay',
            collectReplayItems: 'replay',
            replayBitmapItems: 'replay',
            replayBitmapRenderOp: 'replay',
            replayBitmapEntry: 'replay',
            drawBitmapTextValue: 'replay',
            drawBitmapTextArgs: 'replay',
            calculateClearRect: 'replay',
            registerCopiedBitmapTargetProvider: 'copiedTargets',
            materializeCopiedBitmapTargetsBeforeMutation: 'copiedTargets',
            redrawMaterializedCopiedBitmapTargetsAfterMutation: 'copiedTargets',
            invalidateCopiedBitmapTargetsForMutation: 'copiedTargets',
            materializeCopiedBitmapTargetRedraws: 'copiedTargets',
            redrawCopiedBitmapTargets: 'copiedTargets',
            estimateTextWidth: 'textUtils',
            computeFontSignature: 'textUtils',
            sanitizeVisibleText: 'textUtils',
            sanitizePerChar: 'textUtils',
            isStandaloneGlyphText: 'textUtils',
            sanitizeBitmapDrawText: 'textUtils',
            safePrepareText: 'textUtils',
            describeEntryEligibility: 'textUtils',
            normalizeBitmapDrawCallArgs: 'textUtils',
            createBitmapDrawContext: 'textUtils',
            isDrawCaptureTraceEnabled: 'textUtils',
            recordDrawTrace: 'textUtils',
            bitmapTraceDetails: 'textUtils',
            cloneTraceRect: 'textUtils',
            roundTraceNumber: 'textUtils',
            readBitmapOwner: 'textUtils',
            resolveBitmapWindowSurface: 'textUtils',
            hasDedicatedOwnerHook: 'textUtils',
            describeBitmapContentsOwnership: 'textUtils',
            deriveEntryRect: 'textUtils',
            rectFromDimensions: 'textUtils',
            isValidRect: 'textUtils',
            rectHasArea: 'textUtils',
            rectOrNull: 'textUtils',
            rectanglesOverlap: 'textUtils',
            normalizeCanvasTextAlign: 'textUtils',
            describeOwnerType: 'textUtils',
            logTextDetected: 'textUtils',
            updateItem: 'textUtils',
            safeCall: 'textUtils',
            isAdapterContractFailure: 'textUtils',
            warn: 'textUtils',
            stringify: 'textUtils',
            finiteNumber: 'textUtils',
            positiveNumber: 'textUtils',
            pruneArray: 'textUtils',
            errorMessage: 'textUtils',
        };
        const instances = {};
        function getController(key) {
            if (!instances[key]) instances[key] = controllers[key].create(scope);
            return instances[key];
        }
        function callController(methodName, ...args) {
            const key = methodControllers[methodName];
            const controller = key ? getController(key) : null;
            const method = controller && controller[methodName];
            if (typeof method !== 'function') throw new Error('[BitmapText] Missing controller method: ' + methodName);
            return method(...args);
        }
        scope.controllerFacades = controllers.controllerFacades.create({ callController });
        Object.keys(methodControllers).forEach((methodName) => {
            scope[methodName] = (...args) => callController(methodName, ...args);
        });
        return { install: scope.install };
    }

    function requireTextSourceHelper(value, label) {
        if (typeof value === 'function') return value;
        throw new Error(`[${label}] createTextSource helper is required.`);
    }

    function requireTextCodec(value, label) {
        if (value
            && typeof value.createPlainTextSource === 'function'
            && typeof value.sanitizeVisibleText === 'function'
            && typeof value.sanitizeDrawTextOutput === 'function') {
            return value;
        }
        throw new Error(`[${label}] textCodec service is required.`);
    }

    function normalizePerfOptions(options) {
        if (typeof options === 'string') return { domain: options };
        if (options && typeof options === 'object') return options;
        return {};
    }

    function createBitmapTextRegion(scope, bitmap, text, x, y, maxWidth, lineHeight, align) {
        const visibleText = typeof scope.sanitizeVisibleText === 'function'
            ? scope.sanitizeVisibleText(text)
            : String(text ?? '').trim();
        return measuredBounds.createBitmapTextInkRegion({ bitmap, text, visibleText, x, y, maxWidth, lineHeight, align });
    }

    function createBitmapTextBackdropRegion(scope, bitmap, text, x, y, maxWidth, lineHeight) {
        const visibleText = typeof scope.sanitizeVisibleText === 'function'
            ? scope.sanitizeVisibleText(text)
            : String(text ?? '').trim();
        return measuredBounds.createBitmapTextBackdropRegion({ bitmap, text, visibleText, x, y, maxWidth, lineHeight });
    }

    function isBitmapTextBackdropTrusted(scope, bitmap, region) {
        if (!bitmap || !region || !measuredBounds.isRectWithArea(region)) return false;
        let ink = null;
        try { ink = scope.nativeTextInkByBitmap.get(bitmap) || null; } catch (_) { ink = null; }
        if (!Array.isArray(ink) || !ink.length) return true;
        return !ink.some((rect) => measuredBounds.rectsOverlap(rect, region));
    }

    function recordBitmapNativeTextInk(scope, bitmap, region) {
        if (!bitmap || !region || !measuredBounds.isRectWithArea(region)) return false;
        let ink = null;
        try { ink = scope.nativeTextInkByBitmap.get(bitmap) || null; } catch (_) { ink = null; }
        if (!Array.isArray(ink)) {
            ink = [];
            try { scope.nativeTextInkByBitmap.set(bitmap, ink); } catch (_) { return false; }
        }
        ink.push(measuredBounds.cloneRect(region));
        const limit = Math.max(16, Number(scope.maxNativeTextInkRects) || 160);
        if (ink.length > limit) ink.splice(0, ink.length - limit);
        return true;
    }

    function hasBitmapNativeTextInkInterest(scope, bitmap) {
        if (!bitmap) return false;
        try {
            const ink = scope.nativeTextInkByBitmap.get(bitmap);
            return Array.isArray(ink) && ink.length > 0;
        } catch (_) {
            return false;
        }
    }

    function applyBitmapNativePaintMutation(scope, bitmap, methodName, mutation = {}) {
        if (!bitmap || !hasBitmapNativeTextInkInterest(scope, bitmap)) return false;
        if (shouldClearAllNativeTextInk(bitmap, methodName, mutation)) {
            try { scope.nativeTextInkByBitmap.delete(bitmap); } catch (_) {}
            return true;
        }
        if (!shouldClearCoveredNativeTextInk(bitmap, methodName)) return false;
        const rect = mutation && mutation.rect && measuredBounds.isRectWithArea(mutation.rect) ? mutation.rect : null;
        if (!rect) return false;
        let ink = null;
        try { ink = scope.nativeTextInkByBitmap.get(bitmap) || null; } catch (_) { ink = null; }
        if (!Array.isArray(ink) || !ink.length) return false;
        const next = ink.filter((item) => !measuredBounds.rectContains(rect, item));
        if (next.length === ink.length) return false;
        if (next.length) {
            try { scope.nativeTextInkByBitmap.set(bitmap, next); } catch (_) {}
        } else {
            try { scope.nativeTextInkByBitmap.delete(bitmap); } catch (_) {}
        }
        return true;
    }

    function shouldClearAllNativeTextInk(bitmap, methodName, mutation) {
        const method = String(methodName || '');
        if (method === 'clear' || method === 'resize' || method === 'destroy') return true;
        if (method === 'fillAll') return isOpaqueBitmapPaint(bitmap);
        return !!(mutation && mutation.clearReplay === 'all' && isOpaqueBitmapPaint(bitmap));
    }

    function shouldClearCoveredNativeTextInk(bitmap, methodName) {
        const method = String(methodName || '');
        if (method === 'clearRect') return true;
        if (method === 'fillRect' || method === 'gradientFillRect') return isOpaqueBitmapPaint(bitmap);
        return false;
    }

    function isOpaqueBitmapPaint(bitmap) {
        const opacity = Number(bitmap && bitmap.paintOpacity);
        return !Number.isFinite(opacity) || opacity >= 255;
    }

    function normalizeBitmapServices(services, intel = {}) {
        const api = services && typeof services === 'object' ? services : {};
        const onError = operationIntel.createOperationErrorReporter({
            component: 'BitmapText',
            operationLabel: 'Bitmap service',
            metricBase: 'bitmapServices.error',
            perf: intel.perf,
            logger: intel.logger,
        });
        return {
            registerReplayProvider(provider) {
                if (typeof api.registerReplayProvider !== 'function') return () => {};
                try { return api.registerReplayProvider(provider) || (() => {}); } catch (error) { onError('registerReplayProvider', error); return () => {}; }
            },
            registerMutationPublisher() {
                if (typeof api.registerMutationPublisher !== 'function') return () => {};
                try { return api.registerMutationPublisher() || (() => {}); } catch (error) { onError('registerMutationPublisher', error); return () => {}; }
            },
            registerMutationParticipant(participant) {
                if (typeof api.registerMutationParticipant !== 'function') return () => {};
                try { return api.registerMutationParticipant(participant) || (() => {}); } catch (error) { onError('registerMutationParticipant', error); return () => {}; }
            },
            hasMutationInterest(bitmap) {
                if (typeof api.hasMutationInterest !== 'function') return false;
                try { return api.hasMutationInterest(bitmap) === true; } catch (error) { onError('hasMutationInterest', error); return false; }
            },
            collectMutationCapabilities(bitmap, input) {
                if (typeof api.collectMutationCapabilities !== 'function') return [];
                try {
                    const capabilities = api.collectMutationCapabilities(bitmap, input);
                    return Array.isArray(capabilities) ? capabilities : [];
                } catch (error) {
                    onError('collectMutationCapabilities', error);
                    return [];
                }
            },
            ensureFrameFlushProvider(adapterId, input) {
                if (typeof api.ensureFrameFlushProvider !== 'function') {
                    return { handled: false, adapterId: String(adapterId || ''), active: false, scheduled: false, status: 'unavailable' };
                }
                try { return api.ensureFrameFlushProvider(adapterId, input); } catch (error) {
                    onError('ensureFrameFlushProvider', error);
                    return { handled: false, adapterId: String(adapterId || ''), active: false, scheduled: false, status: 'failed' };
                }
            },
            describeSurface(bitmap, input) {
                if (typeof api.describeSurface !== 'function') return null;
                try {
                    const description = api.describeSurface(bitmap, input);
                    return description && typeof description === 'object' ? description : null;
                } catch (error) {
                    onError('describeSurface', error);
                    return null;
                }
            },
            getRenderGuardState(bitmap) {
                if (typeof api.getRenderGuardState !== 'function') throw new Error('[BitmapText] bitmapServices.getRenderGuardState is required.');
                return api.getRenderGuardState(bitmap);
            },
            getRenderGuardReason(bitmap) {
                if (typeof api.getRenderGuardReason !== 'function') throw new Error('[BitmapText] bitmapServices.getRenderGuardReason is required.');
                return api.getRenderGuardReason(bitmap);
            },
            getSourceObservationPolicy(bitmap) {
                if (typeof api.getSourceObservationPolicy !== 'function') throw new Error('[BitmapText] bitmapServices.getSourceObservationPolicy is required.');
                return api.getSourceObservationPolicy(bitmap);
            },
            withBitmapReplayGuard(bitmap, callback, source) {
                if (typeof api.withBitmapReplayGuard !== 'function') throw new Error('[BitmapText] bitmapServices.withBitmapReplayGuard is required.');
                return api.withBitmapReplayGuard(bitmap, callback, source);
            },
            withBitmapSkipGuard(bitmap, callback) {
                if (typeof api.withBitmapSkipGuard !== 'function') throw new Error('[BitmapText] bitmapServices.withBitmapSkipGuard is required.');
                return api.withBitmapSkipGuard(bitmap, callback);
            },
            withSpriteTextReplayGuard(bitmap, callback) {
                if (typeof api.withSpriteTextReplayGuard !== 'function') throw new Error('[BitmapText] bitmapServices.withSpriteTextReplayGuard is required.');
                return api.withSpriteTextReplayGuard(bitmap, callback);
            },
            withBitmapSkipAndSpriteReplayGuard(bitmap, callback) {
                if (typeof api.withBitmapSkipAndSpriteReplayGuard !== 'function') throw new Error('[BitmapText] bitmapServices.withBitmapSkipAndSpriteReplayGuard is required.');
                return api.withBitmapSkipAndSpriteReplayGuard(bitmap, callback);
            },
            withActiveRedrawEntry(bitmap, entry, callback) {
                if (typeof api.withActiveRedrawEntry !== 'function') throw new Error('[BitmapText] bitmapServices.withActiveRedrawEntry is required.');
                return api.withActiveRedrawEntry(bitmap, entry, callback);
            },
            getActiveRedrawEntry(bitmap) {
                if (typeof api.getActiveRedrawEntry !== 'function') throw new Error('[BitmapText] bitmapServices.getActiveRedrawEntry is required.');
                return api.getActiveRedrawEntry(bitmap);
            },
            ensureSurfaceLedgerRecord(bitmap, input) {
                if (typeof api.ensureSurfaceLedgerRecord !== 'function') return null;
                try { return api.ensureSurfaceLedgerRecord(bitmap, input) || null; } catch (error) { onError('ensureSurfaceLedgerRecord', error); return null; }
            },
            enterDrawRunContext(bitmap, input) {
                if (typeof api.enterDrawRunContext !== 'function') return () => {};
                try { return api.enterDrawRunContext(bitmap, input) || (() => {}); } catch (error) { onError('enterDrawRunContext', error); return () => {}; }
            },
            getActiveDrawRunContext(bitmap) {
                if (typeof api.getActiveDrawRunContext !== 'function') return null;
                try { return api.getActiveDrawRunContext(bitmap) || null; } catch (error) { onError('getActiveDrawRunContext', error); return null; }
            },
            beginTextDrawCapture(bitmap, input) {
                if (typeof api.beginTextDrawCapture !== 'function') return null;
                try { return api.beginTextDrawCapture(bitmap, input); } catch (error) { onError('beginTextDrawCapture', error); return null; }
            },
            beginMutationJournal(bitmap, input) {
                if (typeof api.beginMutationJournal !== 'function') return null;
                try { return api.beginMutationJournal(bitmap, input); } catch (error) { onError('beginMutationJournal', error); return null; }
            },
            registerCopiedTargetProvider(provider) {
                if (typeof api.registerCopiedTargetProvider !== 'function') return () => {};
                try { return api.registerCopiedTargetProvider(provider) || (() => {}); } catch (error) { onError('registerCopiedTargetProvider', error); return () => {}; }
            },
            redrawCopiedTargetRestoreComposition(input) {
                if (typeof api.redrawCopiedTargetRestoreComposition !== 'function') return 0;
                try { return api.redrawCopiedTargetRestoreComposition(input) || 0; } catch (error) { onError('redrawCopiedTargetRestoreComposition', error); return 0; }
            },
            collectCopiedTargetRestoreSeeds(input) {
                if (typeof api.collectCopiedTargetRestoreSeeds !== 'function') return [];
                try {
                    const seeds = api.collectCopiedTargetRestoreSeeds(input);
                    return Array.isArray(seeds) ? seeds : [];
                } catch (error) {
                    onError('collectCopiedTargetRestoreSeeds', error);
                    return [];
                }
            },
            recordCopiedTextTargetPayload(input) {
                if (typeof api.recordCopiedTextTargetPayload !== 'function') {
                    return { attempted: 0, recorded: 0, skipped: 0, records: [] };
                }
                try {
                    const result = api.recordCopiedTextTargetPayload(input);
                    return result && typeof result === 'object'
                        ? result
                        : { attempted: 0, recorded: 0, skipped: 0, records: [] };
                } catch (error) {
                    onError('recordCopiedTextTargetPayload', error);
                    return { attempted: 0, recorded: 0, skipped: 0, records: [] };
                }
            },
            publishMutation(bitmap, methodName, args) {
                if (typeof api.publishMutation !== 'function') return;
                try { api.publishMutation(bitmap, methodName, args); } catch (error) { onError('publishMutation', error); }
            },
            recordDraw(bitmap, input) {
                if (typeof api.recordDraw !== 'function') return null;
                try { return api.recordDraw(bitmap, input); } catch (error) { onError('recordDraw', error); return null; }
            },
            rememberInlineReplacement(input) {
                if (typeof api.rememberInlineReplacement !== 'function') return null;
                try { return api.rememberInlineReplacement(input); } catch (error) { onError('rememberInlineReplacement', error); return null; }
            },
            lookupInlineReplacement(input) {
                if (typeof api.lookupInlineReplacement !== 'function') return null;
                try { return api.lookupInlineReplacement(input); } catch (error) { onError('lookupInlineReplacement', error); return null; }
            },
            forgetInlineReplacement(input) {
                if (typeof api.forgetInlineReplacement !== 'function') return 0;
                try { return api.forgetInlineReplacement(input) || 0; } catch (error) { onError('forgetInlineReplacement', error); return 0; }
            },
            hasSurfaceLedgerRecord(bitmap) {
                if (typeof api.hasSurfaceLedgerRecord !== 'function') return false;
                try { return api.hasSurfaceLedgerRecord(bitmap) === true; } catch (error) { onError('hasSurfaceLedgerRecord', error); return false; }
            },
            getSurfaceLedgerIdentity(bitmap) {
                if (typeof api.getSurfaceLedgerIdentity !== 'function') return null;
                try { return api.getSurfaceLedgerIdentity(bitmap); } catch (error) { onError('getSurfaceLedgerIdentity', error); return null; }
            },
            getSurfaceById(surfaceId, options) {
                if (typeof api.getSurfaceById !== 'function') return null;
                try { return api.getSurfaceById(surfaceId, options); } catch (error) { onError('getSurfaceById', error); return null; }
            },
            hasCurrentCopyEdgesTo(bitmap) {
                if (typeof api.hasCurrentCopyEdgesTo !== 'function') return false;
                try { return api.hasCurrentCopyEdgesTo(bitmap) === true; } catch (error) { onError('hasCurrentCopyEdgesTo', error); return false; }
            },
            getInvalidatedCopyEdgesTo(bitmap, input) {
                if (typeof api.getInvalidatedCopyEdgesTo !== 'function') return [];
                try {
                    const edges = api.getInvalidatedCopyEdgesTo(bitmap, input);
                    return Array.isArray(edges) ? edges : [];
                } catch (error) {
                    onError('getInvalidatedCopyEdgesTo', error);
                    return [];
                }
            },
            getDamagedCopyEdgesTo(bitmap, input) {
                if (typeof api.getDamagedCopyEdgesTo !== 'function') return [];
                try {
                    const edges = api.getDamagedCopyEdgesTo(bitmap, input);
                    return Array.isArray(edges) ? edges : [];
                } catch (error) {
                    onError('getDamagedCopyEdgesTo', error);
                    return [];
                }
            },
            getCopiedTextTargetMaterializations(sourceBitmap, input) {
                if (typeof api.getCopiedTextTargetMaterializations !== 'function') return [];
                try {
                    const targets = api.getCopiedTextTargetMaterializations(sourceBitmap, input);
                    return Array.isArray(targets) ? targets : [];
                } catch (error) {
                    onError('getCopiedTextTargetMaterializations', error);
                    return [];
                }
            },
            getPendingCopiedTextTargetMaterializations(sourceBitmap, input) {
                if (typeof api.getPendingCopiedTextTargetMaterializations !== 'function') return [];
                try {
                    const targets = api.getPendingCopiedTextTargetMaterializations(sourceBitmap, input);
                    return Array.isArray(targets) ? targets : [];
                } catch (error) {
                    onError('getPendingCopiedTextTargetMaterializations', error);
                    return [];
                }
            },
            getProjectedTextRunsForTarget(targetBitmap, input) {
                if (typeof api.getProjectedTextRunsForTarget !== 'function') return [];
                try {
                    const runs = api.getProjectedTextRunsForTarget(targetBitmap, input);
                    return Array.isArray(runs) ? runs : [];
                } catch (error) {
                    onError('getProjectedTextRunsForTarget', error);
                    return [];
                }
            },
            subscribeTextRuns(options) {
                if (typeof api.subscribeTextRuns !== 'function') return () => {};
                try { return api.subscribeTextRuns(options) || (() => {}); } catch (error) { onError('subscribeTextRuns', error); return () => {}; }
            },
            flushPendingDrawUnits(reason, bitmap, options) {
                if (typeof api.flushPendingDrawUnits !== 'function') return 0;
                try { return api.flushPendingDrawUnits(reason, bitmap, options) || 0; } catch (error) { onError('flushPendingDrawUnits', error); return 0; }
            },
            flushOwnerDrawUnits(reason, bitmap) {
                if (typeof api.flushOwnerDrawUnits !== 'function') return 0;
                try { return api.flushOwnerDrawUnits(reason, bitmap) || 0; } catch (error) { onError('flushOwnerDrawUnits', error); return 0; }
            },
            hasPendingDrawUnits(bitmap) {
                if (typeof api.hasPendingDrawUnits !== 'function') return false;
                try { return api.hasPendingDrawUnits(bitmap) === true; } catch (error) { onError('hasPendingDrawUnits', error); return false; }
            },
            markBitmapPixelsDirty(bitmap, input) {
                if (typeof api.markBitmapPixelsDirty !== 'function') throw new Error('[BitmapText] bitmapServices.markBitmapPixelsDirty is required.');
                try { return api.markBitmapPixelsDirty(bitmap, input); } catch (error) { onError('markBitmapPixelsDirty', error); return null; }
            },
        };
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

    function applyDefaultBitmapDrawState(bitmap, state) {
        if (!bitmap || !state) return;
        Object.keys(state).forEach((key) => {
            try { bitmap[key] = state[key]; } catch (_) {}
        });
    }

    function hasRequiredOrchestrator(adapterContract) {
        return !!(adapterContract
            && typeof adapterContract.hasRequiredMethods === 'function'
            && adapterContract.hasRequiredMethods([
                'observeRecord', 'requestItemTranslation', 'cancelItemTranslation', 'retireItem',
                'updateItem', 'recordSurfaceDraw', 'finalizeTextClaim', 'releaseTextClaim',
                'recordRenderRejected', 'getUnresolvedRenderCommandsForItem',
                'describeTextEligibility', 'subscribeRecords',
            ]));
    }

            return { install: installBitmapTextAdapter };
        },
    });
})();
