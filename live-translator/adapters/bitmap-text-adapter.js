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

    const controllers = {
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
            stripControls: typeof context.stripControls === 'function' ? context.stripControls : (text) => String(text ?? ''),
            encodeText: typeof context.encodeText === 'function'
                ? context.encodeText
                : (text) => ({
                    originalText: String(text ?? ''),
                    visibleText: String(text ?? '').trim(),
                    translationText: String(text ?? ''),
                    normalizedText: String(text ?? '').trim(),
                    tokens: [],
                }),
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
            windowRegistry: context.windowRegistry || null,
            windowLifecycle: context.windowLifecycle || null,
            getWindowTextHelpers: typeof context.getWindowTextHelpers === 'function'
                ? context.getWindowTextHelpers
                : null,
            settings: context.settings && typeof context.settings === 'object' ? context.settings : {},
            bitmapServices: normalizeBitmapServices(context.bitmapServices),
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
            fallbackFlushTimer: null,
            frameFlushInstalled: false,
            smallTextDepth: 0,
            normalCharacterDepth: 0,
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
            scheduleBitmapDrawWrapperRetry: 'install',
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
            getBitmapFallbackMode: 'textUtils',
            isBitmapFallbackCaptureEnabled: 'textUtils',
            isBitmapFallbackRedrawEnabled: 'textUtils',
            readBitmapOwner: 'textUtils',
            hasDedicatedOwnerHook: 'textUtils',
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
        Object.keys(methodControllers).forEach((methodName) => {
            scope[methodName] = (...args) => callController(methodName, ...args);
        });
        return { install: scope.install };
    }

    function normalizePerfOptions(options) {
        if (typeof options === 'string') return { domain: options };
        if (options && typeof options === 'object') return options;
        return {};
    }

    function createBitmapTextRegion(scope, bitmap, text, x, y, maxWidth, lineHeight, align) {
        if (!bitmap) return null;
        const visibleText = typeof scope.sanitizeVisibleText === 'function'
            ? scope.sanitizeVisibleText(text)
            : String(text ?? '').trim();
        if (!visibleText) return null;
        const sourceWidth = Math.max(0, Math.ceil(Number(bitmap.width) || 0));
        const sourceHeight = Math.max(0, Math.ceil(Number(bitmap.height) || 0));
        if (!sourceWidth || !sourceHeight) return null;

        const measuredWidth = measureNativeBitmapTextWidth(bitmap, text);
        const drawWidth = resolveNativeBitmapTextWidth(measuredWidth, maxWidth);
        if (!drawWidth) return null;

        const outlineWidth = Number(bitmap && bitmap.outlineWidth);
        const outline = Number.isFinite(outlineWidth)
            ? Math.max(0, outlineWidth + 2)
            : 2;
        const fontSize = positiveNativeNumber(bitmap && bitmap.fontSize, 24);
        const textX = resolveAlignedNativeTextX(x, maxWidth, drawWidth, align);
        const textY = finiteNativeNumber(y, 0);
        const height = positiveNativeNumber(lineHeight, fontSize, 24);
        const horizontalPadding = Math.max(outline, Math.ceil(fontSize * 0.25));
        // Bitmap.drawText positions glyphs around a computed baseline, not inside
        // the requested y..y+lineHeight box. Short line heights can put native ink
        // well above y-outline, so the backdrop/source patch must cover the font
        // ink envelope rather than only the API rectangle.
        const baseline = textY + height / 2 + fontSize * 0.35;
        const inkTop = Math.min(textY, baseline - fontSize * 1.4);
        const inkBottom = Math.max(textY + height, baseline + fontSize * 0.45);
        const x1 = Math.max(0, Math.floor(textX - horizontalPadding));
        const y1 = Math.max(0, Math.floor(inkTop - outline));
        const x2 = Math.min(sourceWidth, Math.ceil(textX + drawWidth + horizontalPadding));
        const y2 = Math.min(sourceHeight, Math.ceil(inkBottom + outline));
        if (x2 <= x1 || y2 <= y1) return null;
        return { x1, y1, x2, y2 };
    }

    function createBitmapTextBackdropRegion(scope, bitmap, text, x, y, maxWidth, lineHeight) {
        if (!bitmap) return null;
        const visibleText = typeof scope.sanitizeVisibleText === 'function'
            ? scope.sanitizeVisibleText(text)
            : String(text ?? '').trim();
        if (!visibleText) return null;
        const sourceWidth = Math.max(0, Math.ceil(Number(bitmap.width) || 0));
        const sourceHeight = Math.max(0, Math.ceil(Number(bitmap.height) || 0));
        if (!sourceWidth || !sourceHeight) return null;

        const measuredWidth = measureNativeBitmapTextWidth(bitmap, text);
        const drawWidth = resolveNativeBitmapBackdropWidth(measuredWidth, maxWidth);
        if (!drawWidth) return null;

        const outlineWidth = Number(bitmap && bitmap.outlineWidth);
        const outline = Number.isFinite(outlineWidth)
            ? Math.max(1, outlineWidth + 1)
            : 2;
        const fontSize = positiveNativeNumber(bitmap && bitmap.fontSize, lineHeight, 24);
        const height = positiveNativeNumber(lineHeight, fontSize, 24);
        const topPad = Math.min(outline, Math.ceil(fontSize * 0.08));
        const bottomPad = Math.max(outline, Math.ceil(fontSize * 0.25));
        const x1 = Math.max(0, Math.floor(finiteNativeNumber(x, 0) - outline));
        const y1 = Math.max(0, Math.floor(finiteNativeNumber(y, 0) - topPad));
        const width = Math.ceil(drawWidth + outline * 2);
        const heightWithPadding = Math.ceil(height + topPad + bottomPad);
        const clippedWidth = Math.min(sourceWidth, width, Math.max(0, sourceWidth - x1));
        const clippedHeight = Math.min(sourceHeight, heightWithPadding, Math.max(0, sourceHeight - y1));
        if (clippedWidth <= 0 || clippedHeight <= 0) return null;
        return {
            x1,
            y1,
            x2: x1 + clippedWidth,
            y2: y1 + clippedHeight,
        };
    }

    function isBitmapTextBackdropTrusted(scope, bitmap, region) {
        if (!bitmap || !region || !isNativeRect(region)) return false;
        let ink = null;
        try { ink = scope.nativeTextInkByBitmap.get(bitmap) || null; } catch (_) { ink = null; }
        if (!Array.isArray(ink) || !ink.length) return true;
        return !ink.some((rect) => nativeRectsOverlap(rect, region));
    }

    function recordBitmapNativeTextInk(scope, bitmap, region) {
        if (!bitmap || !region || !isNativeRect(region)) return false;
        let ink = null;
        try { ink = scope.nativeTextInkByBitmap.get(bitmap) || null; } catch (_) { ink = null; }
        if (!Array.isArray(ink)) {
            ink = [];
            try { scope.nativeTextInkByBitmap.set(bitmap, ink); } catch (_) { return false; }
        }
        ink.push(cloneNativeRect(region));
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
        const rect = mutation && mutation.rect && isNativeRect(mutation.rect) ? mutation.rect : null;
        if (!rect) return false;
        let ink = null;
        try { ink = scope.nativeTextInkByBitmap.get(bitmap) || null; } catch (_) { ink = null; }
        if (!Array.isArray(ink) || !ink.length) return false;
        const next = ink.filter((item) => !nativeRectContains(rect, item));
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

    function measureNativeBitmapTextWidth(bitmap, text) {
        try {
            const measured = bitmap && typeof bitmap.measureTextWidth === 'function'
                ? Number(bitmap.measureTextWidth(String(text ?? '')))
                : 0;
            if (Number.isFinite(measured) && measured > 0) return Math.ceil(measured);
        } catch (_) {}
        const fontSize = positiveNativeNumber(bitmap && bitmap.fontSize, 24);
        return Math.max(1, Math.ceil(String(text ?? '').length * Math.max(6, fontSize * 0.6)));
    }

    function resolveNativeBitmapTextWidth(measuredWidth, maxWidth) {
        const measured = Number(measuredWidth);
        const limit = Number(maxWidth);
        if (!Number.isFinite(measured) || measured <= 0) return 0;
        if (Number.isFinite(limit) && limit > 0) return Math.max(1, Math.min(Math.ceil(limit), Math.ceil(measured)));
        return Math.max(1, Math.ceil(measured));
    }

    function resolveNativeBitmapBackdropWidth(measuredWidth, maxWidth) {
        const measured = Number(measuredWidth);
        const limit = Number(maxWidth);
        if (!Number.isFinite(measured) || measured <= 0) return 0;
        if (Number.isFinite(limit) && limit > 0) return Math.max(1, Math.max(Math.ceil(limit), Math.ceil(measured)));
        return Math.max(1, Math.ceil(measured));
    }

    function resolveAlignedNativeTextX(x, maxWidth, drawWidth, align) {
        const originX = finiteNativeNumber(x, 0);
        const boxWidth = positiveNativeNumber(maxWidth, drawWidth, 1);
        const textWidth = positiveNativeNumber(drawWidth, 1);
        if (align === 'right' || align === 'end') return originX + Math.max(0, boxWidth - textWidth);
        if (align === 'center') return originX + Math.max(0, (boxWidth - textWidth) / 2);
        return originX;
    }

    function finiteNativeNumber(value, fallback = 0) {
        const numeric = Number(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    function positiveNativeNumber(...values) {
        for (const value of values) {
            const numeric = Number(value);
            if (Number.isFinite(numeric) && numeric > 0) return numeric;
        }
        return 0;
    }

    function isNativeRect(rect) {
        return !!(rect
            && Number.isFinite(Number(rect.x1))
            && Number.isFinite(Number(rect.y1))
            && Number.isFinite(Number(rect.x2))
            && Number.isFinite(Number(rect.y2))
            && Number(rect.x2) > Number(rect.x1)
            && Number(rect.y2) > Number(rect.y1));
    }

    function cloneNativeRect(rect) {
        return {
            x1: Number(rect.x1),
            y1: Number(rect.y1),
            x2: Number(rect.x2),
            y2: Number(rect.y2),
        };
    }

    function nativeRectsOverlap(left, right) {
        return isNativeRect(left)
            && isNativeRect(right)
            && left.x1 < right.x2
            && left.x2 > right.x1
            && left.y1 < right.y2
            && left.y2 > right.y1;
    }

    function nativeRectContains(outer, inner) {
        return isNativeRect(outer)
            && isNativeRect(inner)
            && outer.x1 <= inner.x1
            && outer.y1 <= inner.y1
            && outer.x2 >= inner.x2
            && outer.y2 >= inner.y2;
    }

    function normalizeBitmapServices(services) {
        const api = services && typeof services === 'object' ? services : {};
        return {
            registerReplayProvider(provider) {
                if (typeof api.registerReplayProvider !== 'function') return () => {};
                try { return api.registerReplayProvider(provider) || (() => {}); } catch (_) { return () => {}; }
            },
            registerFallbackFlush(callback) {
                if (typeof api.registerFallbackFlush !== 'function') return () => {};
                try { return api.registerFallbackFlush(callback) || (() => {}); } catch (_) { return () => {}; }
            },
            registerMutationPublisher() {
                if (typeof api.registerMutationPublisher !== 'function') return () => {};
                try { return api.registerMutationPublisher() || (() => {}); } catch (_) { return () => {}; }
            },
            hasMutationInterest(bitmap) {
                if (typeof api.hasMutationInterest !== 'function') return false;
                try { return api.hasMutationInterest(bitmap) === true; } catch (_) { return false; }
            },
            publishMutation(bitmap, methodName, args) {
                if (typeof api.publishMutation !== 'function') return;
                try { api.publishMutation(bitmap, methodName, args); } catch (_) {}
            },
            recordDraw(bitmap, input) {
                if (typeof api.recordDraw !== 'function') return null;
                try { return api.recordDraw(bitmap, input); } catch (_) { return null; }
            },
            subscribeDrawBatches(options) {
                if (typeof api.subscribeDrawBatches !== 'function') return () => {};
                try { return api.subscribeDrawBatches(options) || (() => {}); } catch (_) { return () => {}; }
            },
            flushDrawBatches(reason, bitmap) {
                if (typeof api.flushDrawBatches !== 'function') return 0;
                try { return api.flushDrawBatches(reason, bitmap) || 0; } catch (_) { return 0; }
            },
            hasPendingDrawBatches(bitmap) {
                if (typeof api.hasPendingDrawBatches !== 'function') return false;
                try { return api.hasPendingDrawBatches(bitmap) === true; } catch (_) { return false; }
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
                'updateItem', 'recordSurfaceDraw', 'finalizeTextClaim', 'releaseTextClaim', 'subscribeRecords',
            ]));
    }

    defineRuntimeModule('adapters.bitmapText', { install: installBitmapTextAdapter });
})();
