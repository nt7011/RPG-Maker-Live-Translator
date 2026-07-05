// Shared runtime Intel policy.
//
// Intel is the live-translator-owned runtime information surface. It is
// production-safe, bounded, and lightweight.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.intelPolicy',
        requires: {
            guiState: 'runtime.guiState',
        },
        factory(_dependencies, { scope: globalScope }) {
            const DEFAULT_LIMITS = Object.freeze({
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

            function resolveIntelSettings(options = {}) {
                const settings = resolveSettings(options);
                return normalizeObject(settings.intel) || {};
            }

            function isDiagnosticsEnabled(options = {}) {
                const settings = resolveSettings(options);
                const diagnostics = normalizeObject(settings.diagnostics) || {};
                return diagnostics.enabled === true && isDiagnosticsRuntimeAvailable(options);
            }

            function isDiagnosticsRuntimeAvailable(options = {}) {
                const scope = resolveScope(options);
                return !!normalizeObject(scope && scope.LiveTranslatorDiagnosticsHooks);
            }

            function isGuiSurfaceActive(options = {}) {
                if (options.forceIntelSurface === true || options.forceSurface === true) return true;
                const scope = resolveScope(options);
                const guiState = normalizeObject(scope && scope.LiveTranslatorGuiState);
                // Snapshot/profile runners can disable the GUI while still needing
                // the same bounded Intel surface for settling and artifact export.
                if (guiState && guiState.translatorOpen !== true && isCaptureWhenGuiClosedEnabled(options)) return true;
                if (!guiState) return options.defaultWhenGuiUnknown === false ? false : true;
                return guiState.translatorOpen === true;
            }

            function isCaptureWhenGuiClosedEnabled(options = {}) {
                return resolveIntelSettings(options).captureWhenGuiClosed === true;
            }

            function positiveInteger(value, fallback) {
                const numeric = Number(value);
                if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
                return Math.max(1, Math.round(numeric));
            }

            function resolveLimit(settings, name, fallback) {
                const intel = normalizeObject(settings.intel) || {};
                const limits = normalizeObject(intel.limits) || {};
                return positiveInteger(limits[name], fallback);
            }

            function resolveLimits(options = {}) {
                const settings = resolveSettings(options);
                return {
                    foresightScans: resolveLimit(settings, 'foresightScans', DEFAULT_LIMITS.foresightScans),
                    foresightMessages: resolveLimit(settings, 'foresightMessages', DEFAULT_LIMITS.foresightMessages),
                    archivedItems: resolveLimit(settings, 'archivedItems', DEFAULT_LIMITS.archivedItems),
                    detachedItems: resolveLimit(settings, 'detachedItems', DEFAULT_LIMITS.detachedItems),
                    pastJobs: resolveLimit(settings, 'pastJobs', DEFAULT_LIMITS.pastJobs),
                };
            }

            function shouldPublish(options = {}) {
                if (options.surface === false || options.enabled === false) return false;
                return isGuiSurfaceActive(options);
            }

            function getPolicy(options = {}) {
                const publish = shouldPublish(options);
                const captureDiagnostics = publish && isDiagnosticsEnabled(options);
                return {
                    publish,
                    capture: publish,
                    surface: publish,
                    includeActiveItems: publish,
                    includeDetachedItems: publish,
                    includeArchivedItems: publish,
                    captureEvents: captureDiagnostics,
                    captureHistories: publish,
                    captureRenderQueue: captureDiagnostics,
                    captureForesightMetadata: captureDiagnostics,
                    captureForesightMessages: publish,
                    limits: publish ? resolveLimits(options) : Object.assign({}, DEFAULT_LIMITS),
                };
            }

            function getSnapshotPolicy(options = {}) {
                // Snapshot producers still use this name, but the returned shape
                // is bounded live Intel information.
                return getPolicy(options);
            }

            function shouldCapture(options = {}) {
                return getPolicy(options).capture === true;
            }

            function isSurfaceEnabled(options = {}) {
                return getPolicy(options).surface === true;
            }

            const api = Object.freeze({
                DEFAULT_LIMITS,
                getPolicy,
                getSnapshotPolicy,
                shouldPublish,
                shouldCapture,
                resolveLimits,
                isDiagnosticsEnabled,
                isDiagnosticsRuntimeAvailable,
                isGuiSurfaceActive,
                isCaptureWhenGuiClosedEnabled,
                isSurfaceEnabled,
            });

            try { globalScope.LiveTranslatorIntelPolicy = api; } catch (_) {}
            return api;
        },
    });
})();
