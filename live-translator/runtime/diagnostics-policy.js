// Shared GUI diagnostics policy.
//
// Surface diagnostics are the cheap, current-state values the monitor needs:
// active text items, queue counts, and lightweight past rows. Performance mode
// keeps that surface while suppressing expensive histories and command trails.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) globalScope.LiveTranslatorModules = {};
    if (!globalScope.LiveTranslatorModules.runtime) globalScope.LiveTranslatorModules.runtime = {};

    const defineRuntimeModule = globalScope.LiveTranslatorDefine;

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

    function isPerformanceModeEnabled(options = {}) {
        const settings = resolveSettings(options);
        const diagnostics = normalizeObject(settings.diagnostics);
        if (diagnostics && Object.prototype.hasOwnProperty.call(diagnostics, 'performanceMode')) {
            return diagnostics.performanceMode === true;
        }
        return options.defaultPerformanceMode === true;
    }

    function getSnapshotPolicy(options = {}) {
        const surface = isGuiSurfaceActive(options);
        const performanceMode = isPerformanceModeEnabled(options);
        let detailView = surface && !performanceMode;
        if (options.detailView === false || options.includeDetails === false) detailView = false;
        return {
            surface,
            detailView,
            performanceMode,
        };
    }

    function isSurfaceEnabled(options = {}) {
        return getSnapshotPolicy(options).surface;
    }

    function isDetailViewEnabled(options = {}) {
        return getSnapshotPolicy(options).detailView;
    }

    const api = Object.freeze({
        getSnapshotPolicy,
        isGuiSurfaceActive,
        isSurfaceEnabled,
        isPerformanceModeEnabled,
        isDetailViewEnabled,
    });

    try { globalScope.LiveTranslatorDiagnosticsPolicy = api; } catch (_) {}
    if (typeof defineRuntimeModule === 'function') {
        defineRuntimeModule('runtime.diagnosticsPolicy', api);
    }
})();
