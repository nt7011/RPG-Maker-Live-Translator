// Sprite text adapter facade.
//
// Sprite-owned bitmap text has several moving parts: bitmap draw capture, Sprite
// ownership, frame flushing, overlay painting, parent glyph-run grouping, and
// visibility synchronization. The focused controllers in adapters/sprite-text/*
// keep those responsibilities documented and testable without a monolithic file.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'adapters.spriteText',
        requires: {
            measuredBounds: 'runtime.measuredBounds',
            operationIntel: 'runtime.operationIntel',
            renderTransaction: 'runtime.renderTransaction',
            controllerFacades: 'adapters.spriteText.controllerFacades',
            install: 'adapters.spriteText.install',
            bitmapObservation: 'adapters.spriteText.bitmapObservation',
            bitmapOwnership: 'adapters.spriteText.bitmapOwnership',
            frame: 'adapters.spriteText.frame',
            entries: 'adapters.spriteText.entries',
            overlayBitmap: 'adapters.spriteText.overlayBitmap',
            overlaySprite: 'adapters.spriteText.overlaySprite',
            glyphCandidates: 'adapters.spriteText.glyphCandidates',
            parentRunRecords: 'adapters.spriteText.parentRunRecords',
            parentRunOverlay: 'adapters.spriteText.parentRunOverlay',
            parentRunLifecycle: 'adapters.spriteText.parentRunLifecycle',
            visibility: 'adapters.spriteText.visibility',
            state: 'adapters.spriteText.state',
            utils: 'adapters.spriteText.utils',
        },
        factory({
            measuredBounds,
            operationIntel,
            renderTransaction,
            controllerFacades,
            install,
            bitmapObservation,
            bitmapOwnership,
            frame,
            entries,
            overlayBitmap,
            overlaySprite,
            glyphCandidates,
            parentRunRecords,
            parentRunOverlay,
            parentRunLifecycle,
            visibility,
            state,
            utils,
        }, { scope: globalScope }) {
            const controllers = {
                controllerFacades,
                install,
                bitmapObservation,
                bitmapOwnership,
                frame,
                entries,
                overlayBitmap,
                overlaySprite,
                glyphCandidates,
                parentRunRecords,
                parentRunOverlay,
                parentRunLifecycle,
                visibility,
                state,
                utils,
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
        const perf = context.perf || {
            count() {},
            top() {},
            time() {},
            isEnabled() { return false; },
            now() { return Date.now(); },
        };
        const scope = {
            globalScope,
            logger: context.logger || console,
            traceLog: typeof context.traceLog === 'function' ? context.traceLog : () => {},
            preview: typeof context.preview === 'function' ? context.preview : (text) => String(text ?? ''),
            textCodec: requireTextCodec(context.textCodec, 'SpriteText'),
            stripControls: typeof context.stripControls === 'function'
                ? context.stripControls
                : (text) => String(text ?? ''),
            createTextSource: requireTextSourceHelper(context.createTextSource, 'SpriteText'),
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
            surfaceOwnership: context.surfaceOwnership || null,
            testOnlyMutationFallbackWrappers: context.testOnlyMutationFallbackWrappers === true,
            bitmapServices: normalizeBitmapServices(context.bitmapServices, {
                perf,
                logger: context.logger || console,
            }),
            measuredBounds,
            renderTransaction,
            perf,
            bitmapStates: new WeakMap(),
            bitmapOwners: new WeakMap(),
            overlayBitmaps: new WeakSet(),
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
            lastMaintenanceFrameKey: null,
            lastPendingDrawUnitFlushFrameKey: null,
            lastAdoptedScene: null,
            bitmapMutationObserver: null,
            bitmapServiceCapabilitiesRegistered: false,
            bitmapServiceCapabilityUnregisters: [],
            controllerFacades: null,
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
        scope.controllerFacades = controllers.controllerFacades.create(scope);

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

    function requireTextSourceHelper(value, label) {
        if (typeof value === 'function') return value;
        throw new Error(`[${label}] createTextSource helper is required.`);
    }

    function requireTextCodec(value, label) {
        if (value && typeof value.createPlainTextSource === 'function') return value;
        throw new Error(`[${label}] textCodec service is required.`);
    }

    /**
     * Normalize the sprite-facing bitmap capability facet.
     */
    function normalizeBitmapServices(services, intel = {}) {
        const api = services && typeof services === 'object' ? services : {};
        const onError = operationIntel.createOperationErrorReporter({
            component: 'SpriteText',
            operationLabel: 'Bitmap service',
            metricBase: 'bitmapServices.error',
            perf: intel.perf,
            logger: intel.logger,
        });
        return {
            hasMutationPublisher() {
                if (typeof api.watchBitmap !== 'function'
                    || typeof api.hasMutationPublisher !== 'function') {
                    return false;
                }
                try { return api.hasMutationPublisher() === true; } catch (error) { onError('hasMutationPublisher', error); return false; }
            },
            watchBitmap(bitmap, handler) {
                if (typeof api.watchBitmap !== 'function') return () => {};
                try { return api.watchBitmap(bitmap, handler) || (() => {}); } catch (error) { onError('watchBitmap', error); return () => {}; }
            },
            getRenderGuardState(bitmap) {
                if (typeof api.getRenderGuardState !== 'function') throw new Error('[SpriteText] bitmapServices.getRenderGuardState is required.');
                return api.getRenderGuardState(bitmap);
            },
            getRenderGuardReason(bitmap) {
                if (typeof api.getRenderGuardReason !== 'function') throw new Error('[SpriteText] bitmapServices.getRenderGuardReason is required.');
                return api.getRenderGuardReason(bitmap);
            },
            getSourceObservationPolicy(bitmap) {
                if (typeof api.getSourceObservationPolicy !== 'function') throw new Error('[SpriteText] bitmapServices.getSourceObservationPolicy is required.');
                return api.getSourceObservationPolicy(bitmap);
            },
            withBitmapSkipGuard(bitmap, callback) {
                if (typeof api.withBitmapSkipGuard !== 'function') throw new Error('[SpriteText] bitmapServices.withBitmapSkipGuard is required.');
                return api.withBitmapSkipGuard(bitmap, callback);
            },
            withSpriteTextReplayGuard(bitmap, callback) {
                if (typeof api.withSpriteTextReplayGuard !== 'function') throw new Error('[SpriteText] bitmapServices.withSpriteTextReplayGuard is required.');
                return api.withSpriteTextReplayGuard(bitmap, callback);
            },
            withBitmapSkipAndSpriteReplayGuard(bitmap, callback) {
                if (typeof api.withBitmapSkipAndSpriteReplayGuard !== 'function') throw new Error('[SpriteText] bitmapServices.withBitmapSkipAndSpriteReplayGuard is required.');
                return api.withBitmapSkipAndSpriteReplayGuard(bitmap, callback);
            },
            withBitmapNativeDrawAttribution(bitmap, attribution, callback) {
                if (typeof api.withBitmapNativeDrawAttribution !== 'function') throw new Error('[SpriteText] bitmapServices.withBitmapNativeDrawAttribution is required.');
                return api.withBitmapNativeDrawAttribution(bitmap, attribution, callback);
            },
            markBitmapPixelsDirty(bitmap, input) {
                if (typeof api.markBitmapPixelsDirty !== 'function') throw new Error('[SpriteText] bitmapServices.markBitmapPixelsDirty is required.');
                return api.markBitmapPixelsDirty(bitmap, input);
            },
            registerFrameFlushProvider(provider) {
                if (typeof api.registerFrameFlushProvider !== 'function') return () => {};
                try { return api.registerFrameFlushProvider(provider) || (() => {}); } catch (error) { onError('registerFrameFlushProvider', error); return () => {}; }
            },
            registerSurfaceClassifier(provider) {
                if (typeof api.registerSurfaceClassifier !== 'function') return () => {};
                try { return api.registerSurfaceClassifier(provider) || (() => {}); } catch (error) { onError('registerSurfaceClassifier', error); return () => {}; }
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
                'describeTextEligibility',
                'subscribeSurfaceDraws',
                'subscribeRecords',
            ]));
    }

            return {
                install: installSpriteTextAdapter,
            };
        },
    });
})();
