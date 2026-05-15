// Sprite text adapter facade.
//
// Sprite-owned bitmap text has several moving parts: bitmap draw capture, Sprite
// ownership, frame flushing, overlay painting, parent glyph-run grouping, and
// visibility synchronization. The focused controllers in adapters/sprite-text/*
// keep those responsibilities documented and testable without a monolithic file.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before adapters/sprite-text-adapter.js.');
    }
    if (typeof requireRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module require is unavailable before adapters/sprite-text-adapter.js.');
    }

    const controllers = {
        install: requireRuntimeModule('adapters.spriteText.install'),
        bitmapObservation: requireRuntimeModule('adapters.spriteText.bitmapobservation'),
        bitmapOwnership: requireRuntimeModule('adapters.spriteText.bitmapownership'),
        frame: requireRuntimeModule('adapters.spriteText.frame'),
        entries: requireRuntimeModule('adapters.spriteText.entries'),
        overlayBitmap: requireRuntimeModule('adapters.spriteText.overlaybitmap'),
        overlaySprite: requireRuntimeModule('adapters.spriteText.overlaysprite'),
        glyphCandidates: requireRuntimeModule('adapters.spriteText.glyphcandidates'),
        parentRunRecords: requireRuntimeModule('adapters.spriteText.parentrunrecords'),
        parentRunOverlay: requireRuntimeModule('adapters.spriteText.parentrunoverlay'),
        parentRunLifecycle: requireRuntimeModule('adapters.spriteText.parentrunlifecycle'),
        visibility: requireRuntimeModule('adapters.spriteText.visibility'),
        state: requireRuntimeModule('adapters.spriteText.state'),
        utils: requireRuntimeModule('adapters.spriteText.utils'),
    };

    const ADAPTER_ID = 'sprite';
    const HOOK_NAME = 'sprite_text';
    const SURFACE_TYPE = 'sprite';
    const RENDER_STRATEGY = 'spriteTextOverlay';
    const SPRITE_PRIORITY = 550;
    const ADAPTER_TOKEN = 'liveTranslator.spriteTextAdapter.v1';
    const BITMAP_OBSERVER_TOKEN = 'liveTranslator.spriteText.bitmapObserver.v1';
    const CHILD_OBSERVER_TOKEN = 'liveTranslator.spriteText.childObserver.v1';
    const FALLBACK_MUTATION_TOKEN = 'liveTranslator.spriteText.fallbackMutation.v1';
    const FRAME_TOKEN = 'liveTranslator.spriteText.frame.v1';
    const RENDER_GUARD_TOKEN = 'liveTranslator.spriteText.renderGuard.v1';
    const VISUAL_MUTATION_TOKEN = 'liveTranslator.spriteText.visualMutation.v1';
    const MAX_TEXT_OPS = 256;
    const MAX_PAINT_OPS = 256;
    const GAP_MIN = 6;
    const GAP_RATIO = 0.65;
    const GLYPH_BACKTRACK_RATIO = 0.35;
    const GLYPH_VERTICAL_RATIO = 1.75;
    const GLYPH_SPATIAL_VERTICAL_RATIO = 0.75;

    /**
     * Runtime/install-hooks entrypoint.
     */
    function installSpriteTextAdapter(context = {}) {
        return createSpriteTextAdapter(context).install();
    }

    /**
     * Build one sprite adapter instance and compose the focused controllers.
     */
    function createSpriteTextAdapter(context = {}) {
        const scope = {
            globalScope,
            logger: context.logger || console,
            diag: typeof context.diag === 'function' ? context.diag : () => {},
            preview: typeof context.preview === 'function' ? context.preview : (text) => String(text ?? ''),
            stripControls: typeof context.stripControls === 'function'
                ? context.stripControls
                : (text) => String(text ?? ''),
            encodeText: typeof context.encodeText === 'function'
                ? context.encodeText
                : (text) => ({
                    originalText: String(text ?? ''),
                    visibleText: String(text ?? '').trim(),
                    translationText: String(text ?? ''),
                    normalizedText: String(text ?? '').trim(),
                    tokens: [],
                }),
            restoreText: typeof context.restoreText === 'function'
                ? context.restoreText
                : (translated) => translated,
            captureBitmapDrawState: typeof context.captureBitmapDrawState === 'function'
                ? context.captureBitmapDrawState
                : captureDefaultBitmapDrawState,
            applyBitmapDrawState: typeof context.applyBitmapDrawState === 'function'
                ? context.applyBitmapDrawState
                : applyDefaultBitmapDrawState,
            resolveTextScalePercent: typeof context.resolveTextScalePercent === 'function'
                ? context.resolveTextScalePercent
                : null,
            scaleBitmapDrawState: typeof context.scaleBitmapDrawState === 'function'
                ? context.scaleBitmapDrawState
                : null,
            telemetry: context.telemetry || null,
            adapterContract: context.adapterContract || null,
            settings: context.settings && typeof context.settings === 'object' ? context.settings : {},
            contentsOwners: context.contentsOwners || null,
            bitmapServices: normalizeBitmapServices(context.bitmapServices),
            perf: context.perf || {
                count() {},
                top() {},
                time() {},
                isEnabled() { return false; },
                now() { return Date.now(); },
            },
            bitmapStates: new WeakMap(),
            bitmapOwners: new WeakMap(),
            spriteSurfaceClaims: new WeakMap(),
            spriteStates: new WeakMap(),
            parentRunStates: new WeakMap(),
            dirtySprites: new Set(),
            dirtyParents: new Set(),
            activeSprites: new Set(),
            activeParents: new Set(),
            trackedSpriteStates: new Set(),
            trackedParentRuns: new Set(),
            recordsByItemId: new Map(),
            textScaleOthers: 100,
            nextBitmapId: 0,
            nextSpriteId: 0,
            nextEntryId: 0,
            nextRunId: 0,
            flushing: false,
            frameFallbackTimer: null,
            lastMaintenanceFrameKey: null,
            lastBitmapFallbackFrameKey: null,
            lastAdoptedScene: null,
            bitmapMutationObserver: null,
            hasRequiredOrchestrator,
            ADAPTER_ID, HOOK_NAME, SURFACE_TYPE, RENDER_STRATEGY, SPRITE_PRIORITY, ADAPTER_TOKEN,
            BITMAP_OBSERVER_TOKEN, CHILD_OBSERVER_TOKEN, FALLBACK_MUTATION_TOKEN, FRAME_TOKEN,
            RENDER_GUARD_TOKEN, VISUAL_MUTATION_TOKEN, MAX_TEXT_OPS, MAX_PAINT_OPS, GAP_MIN, GAP_RATIO,
            GLYPH_BACKTRACK_RATIO, GLYPH_VERTICAL_RATIO, GLYPH_SPATIAL_VERTICAL_RATIO,
        };
        scope.isPerfEnabled = () => {
            try { return !!(scope.perf && typeof scope.perf.isEnabled === 'function' && scope.perf.isEnabled()); } catch (_) { return false; }
        };
        scope.measurePerf = (name, callback) => {
            if (typeof callback !== 'function') return undefined;
            if (!scope.isPerfEnabled() || !name || typeof scope.perf.time !== 'function') return callback();
            const start = typeof scope.perf.now === 'function' ? scope.perf.now() : Date.now();
            try {
                return callback();
            } finally {
                const end = typeof scope.perf.now === 'function' ? scope.perf.now() : Date.now();
                scope.perf.time(name, end - start);
            }
        };
        scope.textScaleOthers = typeof scope.resolveTextScalePercent === 'function'
            ? scope.resolveTextScalePercent(scope.settings, 'textScaleOthers', 100)
            : 100;

        [controllers.install, controllers.bitmapObservation, controllers.bitmapOwnership, controllers.frame, controllers.entries, controllers.overlayBitmap, controllers.overlaySprite, controllers.glyphCandidates, controllers.parentRunRecords, controllers.parentRunOverlay, controllers.parentRunLifecycle, controllers.visibility, controllers.state, controllers.utils].forEach((controllerModule) => {
            if (!controllerModule || typeof controllerModule.createController !== 'function') {
                throw new Error('[LiveTranslator] sprite text controller is unavailable.');
            }
            Object.assign(scope, controllerModule.createController(scope));
        });

        return {
            install: (...args) => scope.install(...args),
        };
    }

    /**
     * Normalize the sprite-facing bitmap capability facet.
     */
    function normalizeBitmapServices(services) {
        const api = services && typeof services === 'object' ? services : {};
        return {
            hasMutationPublisher() {
                if (typeof api.watchBitmap !== 'function'
                    || typeof api.hasMutationPublisher !== 'function') {
                    return false;
                }
                try { return api.hasMutationPublisher() === true; } catch (_) { return false; }
            },
            watchBitmap(bitmap, handler) {
                if (typeof api.watchBitmap !== 'function') return () => {};
                try { return api.watchBitmap(bitmap, handler) || (() => {}); } catch (_) { return () => {}; }
            },
            flushBitmapFallback(reason) {
                if (typeof api.flushBitmapFallback !== 'function') return false;
                try { return api.flushBitmapFallback(reason) === true; } catch (_) { return false; }
            },
            subscribeDrawBatches(options) {
                if (typeof api.subscribeDrawBatches !== 'function') return () => {};
                try { return api.subscribeDrawBatches(options) || (() => {}); } catch (_) { return () => {}; }
            },
            flushDrawBatches(reason, bitmap) {
                if (typeof api.flushDrawBatches !== 'function') return 0;
                try { return api.flushDrawBatches(reason, bitmap) || 0; } catch (_) { return 0; }
            },
            flushOwnerDrawBatches(reason, bitmap) {
                if (typeof api.flushOwnerDrawBatches !== 'function') return 0;
                try { return api.flushOwnerDrawBatches(reason, bitmap) || 0; } catch (_) { return 0; }
            },
            hasPendingDrawBatches(bitmap) {
                if (typeof api.hasPendingDrawBatches !== 'function') return false;
                try { return api.hasPendingDrawBatches(bitmap) === true; } catch (_) { return false; }
            },
        };
    }

    /**
     * Capture enough Bitmap text state to replay draws in tests and runtime.
     */
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

    /**
     * Apply a default draw-state snapshot to a Bitmap.
     */
    function applyDefaultBitmapDrawState(bitmap, state) {
        if (!bitmap || !state) return;
        Object.keys(state).forEach((key) => {
            try { bitmap[key] = state[key]; } catch (_) {}
        });
    }

    /**
     * Verify the adapter contract exposes the lifecycle APIs this adapter needs.
     */
    function hasRequiredOrchestrator(adapterContract) {
        return !!(adapterContract
            && typeof adapterContract.hasRequiredMethods === 'function'
            && adapterContract.hasRequiredMethods([
                'observeRecord',
                'requestItemTranslation',
                'cancelItemTranslation',
                'retireItem',
                'updateItem',
                'setItemVisibility',
                'setItemTranslationPriority',
                'claimSurface',
                'releaseSurface',
                'subscribeSurfaceDraws',
                'subscribeRecords',
            ]));
    }

    defineRuntimeModule('adapters.spriteText', {
        install: installSpriteTextAdapter,
    });
})();
