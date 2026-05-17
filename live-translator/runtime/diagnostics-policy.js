// Shared GUI diagnostics policy.
//
// Diagnostics deliberately have three runtime levels:
// - none: GUI is closed, so producers must not capture or publish diagnostics.
// - performance: GUI is open and needs lightweight surface data only.
// - full: GUI is open and detail/copy views may request histories and trails.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) globalScope.LiveTranslatorModules = {};
    if (!globalScope.LiveTranslatorModules.runtime) globalScope.LiveTranslatorModules.runtime = {};

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    const LEVEL_NONE = 'none';
    const LEVEL_PERFORMANCE = 'performance';
    const LEVEL_FULL = 'full';
    const DEFAULT_PERFORMANCE_LIMITS = Object.freeze({
        foresightScans: 5,
        foresightMessages: 5,
        archivedItems: 40,
        detachedItems: 40,
        pastJobs: 20,
    });

    function normalizeObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value)
            ? value
            : null;
    }

    function resolveSettings(options = {}) {
        const explicit = normalizeObject(options.settings);
        if (explicit) return explicit;
        const scope = options.globalScope || globalScope;
        return normalizeObject(scope && scope.LiveTranslatorSettings) || {};
    }

    function resolveScope(options = {}) {
        return options.globalScope || globalScope;
    }

    function isGuiSurfaceActive(options = {}) {
        const scope = resolveScope(options);
        const guiState = normalizeObject(scope && scope.LiveTranslatorGuiState);
        if (!guiState) return options.defaultWhenGuiUnknown === false ? false : true;
        return guiState.translatorOpen === true;
    }

    function normalizeLevel(value) {
        const text = String(value || '').trim().toLowerCase();
        if (!text) return '';
        if (text === LEVEL_NONE || text === 'off' || text === 'disabled' || text === 'closed') return LEVEL_NONE;
        if (text === LEVEL_FULL || text === 'detail' || text === 'details' || text === 'debug') return LEVEL_FULL;
        if (text === LEVEL_PERFORMANCE
            || text === 'performancemode'
            || text === 'performance-mode'
            || text === 'surface'
            || text === 'minimal'
            || text === 'minimum') return LEVEL_PERFORMANCE;
        return '';
    }

    function resolveConfiguredLevel(options = {}) {
        const settings = resolveSettings(options);
        const diagnostics = normalizeObject(settings.diagnostics);
        const explicitLevel = normalizeLevel(options.mode || options.level || options.diagnosticsMode);
        if (explicitLevel) return explicitLevel;
        if (diagnostics) {
            const configuredLevel = normalizeLevel(diagnostics.mode || diagnostics.level);
            if (configuredLevel) return configuredLevel;
            if (Object.prototype.hasOwnProperty.call(diagnostics, 'performanceMode')) {
                return diagnostics.performanceMode === true ? LEVEL_PERFORMANCE : LEVEL_FULL;
            }
            if (Object.prototype.hasOwnProperty.call(diagnostics, 'detailView')) {
                return diagnostics.detailView === true ? LEVEL_FULL : LEVEL_PERFORMANCE;
            }
        }
        if (settings.performanceMode === true) return LEVEL_PERFORMANCE;
        if (options.defaultDetailView === false) return LEVEL_PERFORMANCE;
        return LEVEL_FULL;
    }

    function applySnapshotDowngrades(level, options = {}) {
        if (options.surface === false || options.enabled === false) return LEVEL_NONE;
        if (options.detailView === false || options.includeDetails === false) {
            return level === LEVEL_NONE ? LEVEL_NONE : LEVEL_PERFORMANCE;
        }
        return level || LEVEL_FULL;
    }

    function positiveInteger(value, fallback) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
        return Math.max(1, Math.round(numeric));
    }

    function resolveLimit(settings, name, fallback) {
        const diagnostics = normalizeObject(settings.diagnostics) || {};
        const limits = normalizeObject(diagnostics.performanceLimits) || normalizeObject(diagnostics.limits) || {};
        return positiveInteger(limits[name], fallback);
    }

    function resolveLimits(level, options = {}) {
        if (level !== LEVEL_PERFORMANCE) {
            return {
                foresightScans: 0,
                foresightMessages: 0,
                archivedItems: 0,
                detachedItems: 0,
                pastJobs: 0,
            };
        }
        const settings = resolveSettings(options);
        return {
            foresightScans: resolveLimit(settings, 'foresightScans', DEFAULT_PERFORMANCE_LIMITS.foresightScans),
            foresightMessages: resolveLimit(settings, 'foresightMessages', DEFAULT_PERFORMANCE_LIMITS.foresightMessages),
            archivedItems: resolveLimit(settings, 'archivedItems', DEFAULT_PERFORMANCE_LIMITS.archivedItems),
            detachedItems: resolveLimit(settings, 'detachedItems', DEFAULT_PERFORMANCE_LIMITS.detachedItems),
            pastJobs: resolveLimit(settings, 'pastJobs', DEFAULT_PERFORMANCE_LIMITS.pastJobs),
        };
    }

    function getSnapshotPolicy(options = {}) {
        const guiActive = isGuiSurfaceActive(options);
        const configuredLevel = guiActive ? resolveConfiguredLevel(options) : LEVEL_NONE;
        const level = applySnapshotDowngrades(configuredLevel, options);
        const surface = guiActive && level !== LEVEL_NONE;
        const detailView = surface && level === LEVEL_FULL;
        const limits = resolveLimits(level, options);
        return {
            mode: surface ? level : LEVEL_NONE,
            level: surface ? level : LEVEL_NONE,
            surface,
            detailView,
            performanceMode: surface && level === LEVEL_PERFORMANCE,
            full: surface && level === LEVEL_FULL,
            none: !surface,
            captureEvents: detailView,
            captureHistories: detailView,
            captureRenderQueue: detailView,
            captureForesightActions: detailView,
            captureForesightMetadata: detailView,
            includeActiveItems: surface,
            includeDetachedItems: surface,
            includeArchivedItems: surface,
            limits,
        };
    }

    function isSurfaceEnabled(options = {}) {
        return getSnapshotPolicy(options).surface;
    }

    function isDetailViewEnabled(options = {}) {
        return getSnapshotPolicy(options).detailView;
    }

    function isPerformanceMode(options = {}) {
        return getSnapshotPolicy(options).performanceMode;
    }

    const api = Object.freeze({
        LEVEL_NONE,
        LEVEL_PERFORMANCE,
        LEVEL_FULL,
        getSnapshotPolicy,
        isGuiSurfaceActive,
        isSurfaceEnabled,
        isDetailSettingEnabled: isDetailViewEnabled,
        isDetailViewEnabled,
        isPerformanceMode,
        normalizeLevel,
    });

    try { globalScope.LiveTranslatorDiagnosticsPolicy = api; } catch (_) {}
    if (typeof defineRuntimeModule === 'function') {
        defineRuntimeModule('runtime.diagnosticsPolicy', api);
    }
})();
