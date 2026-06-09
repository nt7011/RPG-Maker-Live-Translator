// Bitmap text adapter facade.
// Heavy draw, aggregation, mutation, replay, and record logic lives in adapters/bitmap-text/*.js.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) globalScope.LiveTranslatorModules = {};
    if (!globalScope.LiveTranslatorModules.adapters) globalScope.LiveTranslatorModules.adapters = {};

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const requireRuntimeModule = globalScope.LiveTranslatorRequire;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/bitmap-text-adapter.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before adapters/bitmap-text-adapter.js.');
    }

    const measuredBounds = requireRuntimeModule('runtime.measuredBounds');
    const operationDiagnostics = requireRuntimeModule('runtime.operationDiagnostics');
    const renderTransaction = requireRuntimeModule('runtime.renderTransaction');
    const controllers = {
        controllerFacades: requireRuntimeModule('adapters.bitmapText.controllerFacades'),
        install: requireRuntimeModule('adapters.bitmapTextInstall'),
        aggregation: requireRuntimeModule('adapters.bitmapTextAggregation'),
        records: requireRuntimeModule('adapters.bitmapTextRecords'),
        mutations: requireRuntimeModule('adapters.bitmapTextMutations'),
        frameMarkers: requireRuntimeModule('adapters.bitmapTextFrameMarkers'),
        replay: requireRuntimeModule('adapters.bitmapTextReplay'),
        textUtils: requireRuntimeModule('adapters.bitmapTextTextUtils'),
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
    const MAX_FRAGMENTS = 240;
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
            diag: typeof context.diag === 'function' ? context.diag : () => {},
            diagHot: typeof context.dbg === 'function' ? context.dbg : (typeof context.diag === 'function' ? context.diag : () => {}),
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
            reportAdapterError: operationDiagnostics.createOperationErrorReporter({
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
            pendingFlushBitmaps: new Set(),
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
            NORMAL_CHAR_TOKEN, MAX_FRAGMENTS, MAX_REPLAY_OPS, GAP_MIN, GAP_RATIO,
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
            shouldBypassBitmapDraw: 'install',
            describeBitmapDrawBypassReason: 'install',
            recordBitmapSurfaceDraw: 'install',
            createFragment: 'install',
            handleBitmapDrawBatch: 'install',
            scheduleFlush: 'aggregation',
            scheduleFallbackFlush: 'aggregation',
            flushQueuedBitmaps: 'aggregation',
            flushAggregatedLines: 'aggregation',
            takeFragmentsForFlush: 'aggregation',
            finalizeFragmentOwnership: 'aggregation',
            releaseFragmentOwnership: 'aggregation',
            groupFragmentsIntoLines: 'aggregation',
            canMergeFragments: 'aggregation',
            createEntryFromGroup: 'aggregation',
            registerBitmapEntry: 'aggregation',
            refreshExistingEntry: 'aggregation',
            observeEntry: 'records',
            requestEntryTranslation: 'records',
            applyRenderCommand: 'records',
            getRenderGeneration: 'records',
            isRenderTargetCurrent: 'records',
            handleRenderRejected: 'records',
            restoreTranslatedEntryText: 'records',
            redrawBitmapEntry: 'records',
            markEntryTerminal: 'records',
            isEntryActive: 'records',
            getEntryStatus: 'records',
            isEntryRequestActive: 'records',
            isEntryCompleted: 'records',
            getEntryObservationStatus: 'records',
            retireEntry: 'records',
            shouldKeepRecordAfterRenderRejection: 'records',
            isRenderApplicationFailure: 'records',
            normalizeRenderRejectionReason: 'records',
            installBitmapMutationHooks: 'mutations',
            installBitmapMutationHook: 'mutations',
            shouldBypassMutation: 'mutations',
            getMutationBypassReason: 'mutations',
            hasMutationObserverInterest: 'mutations',
            shouldHandleBitmapMutation: 'mutations',
            hasBitmapStateMutationInterest: 'mutations',
            hasWindowEntryMutationInterest: 'mutations',
            hasAnyWindowEntries: 'mutations',
            recordNativeMutationAttribution: 'mutations',
            classifyBitmapMutationSurface: 'mutations',
            bucketBitmapPixels: 'mutations',
            bucketBitmapDimensions: 'mutations',
            bucketDimension: 'mutations',
            sanitizePerfLabel: 'mutations',
            describeMutation: 'mutations',
            handleBitmapMutation: 'mutations',
            flushFragmentsBeforeMutation: 'mutations',
            invalidateEntriesInRect: 'mutations',
            discardFragmentsInRect: 'mutations',
            invalidateWindowEntries: 'mutations',
            wasWindowEntryObservedInCurrentRefresh: 'mutations',
            isWindowRefreshMutation: 'mutations',
            installFrameFlushHooks: 'frameMarkers',
            hasActiveFrameFlushHooks: 'frameMarkers',
            ensureActiveFrameFlushHooks: 'frameMarkers',
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
            estimateTextWidth: 'textUtils',
            computeFontSignature: 'textUtils',
            sanitizeVisibleText: 'textUtils',
            sanitizePerChar: 'textUtils',
            isStandaloneGlyphText: 'textUtils',
            sanitizeBitmapDrawText: 'textUtils',
            safePrepareText: 'textUtils',
            describeEntryEligibility: 'textUtils',
            recordDrawTrace: 'textUtils',
            bitmapTraceDetails: 'textUtils',
            cloneTraceRect: 'textUtils',
            roundTraceNumber: 'textUtils',
            readBitmapOwner: 'textUtils',
            resolveBitmapWindowSurface: 'textUtils',
            hasDedicatedOwnerHook: 'textUtils',
            describeBitmapContentsOwnership: 'textUtils',
            windowEntryBelongsToBitmap: 'textUtils',
            deriveWindowEntryRect: 'textUtils',
            deriveEntryRect: 'textUtils',
            fragmentRect: 'textUtils',
            rectFromDimensions: 'textUtils',
            isValidRect: 'textUtils',
            rectHasArea: 'textUtils',
            rectOrNull: 'textUtils',
            rectanglesOverlap: 'textUtils',
            normalizeCanvasTextAlign: 'textUtils',
            describeOwnerType: 'textUtils',
            shouldKeepWindowEntryTranslation: 'textUtils',
            getWindowOwnerScreenState: 'textUtils',
            retireWindowEntry: 'textUtils',
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

    function normalizeBitmapServices(services, diagnostics = {}) {
        const api = services && typeof services === 'object' ? services : {};
        const onError = operationDiagnostics.createOperationErrorReporter({
            component: 'BitmapText',
            operationLabel: 'Bitmap service',
            metricBase: 'bitmapServices.error',
            perf: diagnostics.perf,
            logger: diagnostics.logger,
        });
        return {
            registerReplayProvider(provider) {
                if (typeof api.registerReplayProvider !== 'function') return () => {};
                try { return api.registerReplayProvider(provider) || (() => {}); } catch (error) { onError('registerReplayProvider', error); return () => {}; }
            },
            registerFallbackFlush(callback) {
                if (typeof api.registerFallbackFlush !== 'function') return () => {};
                try { return api.registerFallbackFlush(callback) || (() => {}); } catch (error) { onError('registerFallbackFlush', error); return () => {}; }
            },
            registerMutationPublisher() {
                if (typeof api.registerMutationPublisher !== 'function') return () => {};
                try { return api.registerMutationPublisher() || (() => {}); } catch (error) { onError('registerMutationPublisher', error); return () => {}; }
            },
            hasMutationInterest(bitmap) {
                if (typeof api.hasMutationInterest !== 'function') return false;
                try { return api.hasMutationInterest(bitmap) === true; } catch (error) { onError('hasMutationInterest', error); return false; }
            },
            getRenderGuardState(bitmap) {
                if (typeof api.getRenderGuardState !== 'function') throw new Error('[BitmapText] bitmapServices.getRenderGuardState is required.');
                return api.getRenderGuardState(bitmap);
            },
            getRenderGuardReason(bitmap) {
                if (typeof api.getRenderGuardReason !== 'function') throw new Error('[BitmapText] bitmapServices.getRenderGuardReason is required.');
                return api.getRenderGuardReason(bitmap);
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
            scheduleDeferredFlush(options) {
                if (typeof api.scheduleDeferredFlush !== 'function') throw new Error('[BitmapText] bitmapServices.scheduleDeferredFlush is required.');
                return api.scheduleDeferredFlush(options);
            },
            enterDrawRunContext(bitmap, input) {
                if (typeof api.enterDrawRunContext !== 'function') return () => {};
                try { return api.enterDrawRunContext(bitmap, input) || (() => {}); } catch (error) { onError('enterDrawRunContext', error); return () => {}; }
            },
            getActiveDrawRunContext(bitmap) {
                if (typeof api.getActiveDrawRunContext !== 'function') return null;
                try { return api.getActiveDrawRunContext(bitmap) || null; } catch (error) { onError('getActiveDrawRunContext', error); return null; }
            },
            publishMutation(bitmap, methodName, args) {
                if (typeof api.publishMutation !== 'function') return;
                try { api.publishMutation(bitmap, methodName, args); } catch (error) { onError('publishMutation', error); }
            },
            recordDraw(bitmap, input) {
                if (typeof api.recordDraw !== 'function') return null;
                try { return api.recordDraw(bitmap, input); } catch (error) { onError('recordDraw', error); return null; }
            },
            subscribeDrawBatches(options) {
                if (typeof api.subscribeDrawBatches !== 'function') return () => {};
                try { return api.subscribeDrawBatches(options) || (() => {}); } catch (error) { onError('subscribeDrawBatches', error); return () => {}; }
            },
            flushDrawBatches(reason, bitmap) {
                if (typeof api.flushDrawBatches !== 'function') return 0;
                try { return api.flushDrawBatches(reason, bitmap) || 0; } catch (error) { onError('flushDrawBatches', error); return 0; }
            },
            hasPendingDrawBatches(bitmap) {
                if (typeof api.hasPendingDrawBatches !== 'function') return false;
                try { return api.hasPendingDrawBatches(bitmap) === true; } catch (error) { onError('hasPendingDrawBatches', error); return false; }
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
                'describeTextEligibility', 'subscribeRecords',
            ]));
    }

    defineRuntimeModule('adapters.bitmapText', { install: installBitmapTextAdapter });
})();
