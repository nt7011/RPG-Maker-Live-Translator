// Bitmap adapter coordination helpers.
//
// Bitmap services owns the cross-adapter boundary, but the provider registries
// are kept here so bitmap-services.js does not also own low-level coordination
// mechanics.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.adapterCoordination',
        factory() {
            function createAdapterCoordination(options = {}) {
                const reportError = typeof options.reportError === 'function'
                    ? options.reportError
                    : () => {};
                const frameFlushProviders = [];
                const surfaceClassifiers = [];

                function registerFrameFlushProvider(provider) {
                    const normalized = normalizeFrameFlushProvider(provider);
                    if (!normalized) return () => {};
                    frameFlushProviders.push(normalized);
                    return () => {
                        const index = frameFlushProviders.indexOf(normalized);
                        if (index >= 0) frameFlushProviders.splice(index, 1);
                    };
                }

                function ensureFrameFlushProvider(adapterId, input = {}) {
                    const id = stringify(adapterId || input && (input.adapterId || input.id));
                    const provider = frameFlushProviders.slice().reverse().find((candidate) => candidate.id === id);
                    if (!provider) {
                        return {
                            handled: false,
                            adapterId: id,
                            active: false,
                            scheduled: false,
                            status: 'missing-provider',
                        };
                    }

                    const reason = stringify(input && input.reason || `${id || 'adapter'}.frame-flush`);
                    let active = false;
                    try {
                        if (typeof provider.ensureFrameHooks === 'function') {
                            active = provider.ensureFrameHooks(reason) === true;
                        } else if (typeof provider.hasFrameHooksActive === 'function') {
                            active = provider.hasFrameHooksActive(reason) === true;
                        }
                    } catch (error) {
                        reportError('frameFlushProvider.ensureFrameHooks', error);
                        active = false;
                    }

                    return {
                        handled: true,
                        adapterId: id,
                        active,
                        scheduled: false,
                        status: active ? 'active' : 'inactive',
                    };
                }

                function registerSurfaceClassifier(provider) {
                    const normalized = normalizeSurfaceClassifier(provider);
                    if (!normalized) return () => {};
                    surfaceClassifiers.push(normalized);
                    return () => {
                        const index = surfaceClassifiers.indexOf(normalized);
                        if (index >= 0) surfaceClassifiers.splice(index, 1);
                    };
                }

                function describeSurface(bitmap, input = {}) {
                    const source = input && typeof input === 'object' ? input : {};
                    const adapterId = stringify(source.adapterId || source.id || '');
                    const providers = surfaceClassifiers.slice().reverse().filter((provider) => {
                        return !adapterId || provider.id === adapterId;
                    });
                    for (const provider of providers) {
                        try {
                            const description = provider.describeSurface(bitmap, source);
                            if (typeof description === 'string' && description) {
                                return { adapterId: provider.id, kind: description };
                            }
                            if (description && typeof description === 'object') {
                                return Object.assign({ adapterId: provider.id }, description);
                            }
                        } catch (error) {
                            reportError('surfaceClassifier.describeSurface', error);
                        }
                    }
                    return null;
                }

                return freezeApi({
                    registerFrameFlushProvider,
                    ensureFrameFlushProvider,
                    registerSurfaceClassifier,
                    describeSurface,
                });
            }

            function normalizeFrameFlushProvider(provider) {
                if (!provider || typeof provider !== 'object') return null;
                const id = stringify(provider.adapterId || provider.id || provider.token || '');
                if (!id) return null;
                if (typeof provider.ensureFrameHooks !== 'function'
                    && typeof provider.hasFrameHooksActive !== 'function') {
                    return null;
                }
                return freezeApi({
                    id,
                    ensureFrameHooks: typeof provider.ensureFrameHooks === 'function'
                        ? (...args) => provider.ensureFrameHooks(...args)
                        : null,
                    hasFrameHooksActive: typeof provider.hasFrameHooksActive === 'function'
                        ? (...args) => provider.hasFrameHooksActive(...args)
                        : null,
                });
            }

            function normalizeSurfaceClassifier(provider) {
                if (!provider || typeof provider !== 'object') return null;
                const id = stringify(provider.adapterId || provider.id || provider.token || '');
                const describeSurface = provider.describeSurface || provider.describeBitmapSurface || provider.classify;
                if (!id || typeof describeSurface !== 'function') return null;
                return freezeApi({
                    id,
                    describeSurface(bitmap, input) {
                        return describeSurface.call(provider, bitmap, input);
                    },
                });
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return {
                createAdapterCoordination,
            };
        },
    });
})();
