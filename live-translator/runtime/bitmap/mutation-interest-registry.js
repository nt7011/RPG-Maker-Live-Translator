// Bitmap mutation interest registry.
//
// Bitmap mutation hooks need a shared event/interest surface without letting
// adapters exchange globals. This registry owns direct bitmap subscribers,
// mutation interest providers, mutation capability collection, and publisher
// liveness counts. Mutation journal policy stays with bitmap services.
(() => {
    'use strict';

    LiveTranslatorDefine({
        name: 'runtime.bitmap.mutationInterestRegistry',
        factory() {
            function createMutationInterestRegistry(deps = {}) {
                const reportError = typeof deps.reportError === 'function'
                    ? deps.reportError
                    : () => {};
                const warn = typeof deps.warn === 'function'
                    ? deps.warn
                    : () => {};
                let mutationPublisherCount = 0;
                const bitmapSubscribers = new WeakMap();
                const mutationInterestProviders = [];

                function registerMutationPublisher() {
                    mutationPublisherCount += 1;
                    let active = true;
                    return () => {
                        if (!active) return;
                        active = false;
                        mutationPublisherCount = Math.max(0, mutationPublisherCount - 1);
                    };
                }

                function hasMutationPublisher() {
                    return mutationPublisherCount > 0;
                }

                function watchBitmap(bitmap, handler) {
                    if (!canStoreWeakState(bitmap) || typeof handler !== 'function') return () => {};
                    let watchers = bitmapSubscribers.get(bitmap);
                    if (!watchers) {
                        watchers = new Set();
                        bitmapSubscribers.set(bitmap, watchers);
                    }
                    watchers.add(handler);
                    return () => {
                        try {
                            watchers.delete(handler);
                            if (!watchers.size) bitmapSubscribers.delete(bitmap);
                        } catch (error) {
                            reportError('watchBitmap.unregister', error);
                        }
                    };
                }

                function registerMutationInterestProvider(provider) {
                    const normalized = normalizeMutationInterestProvider(provider);
                    if (!normalized) {
                        warn('[BitmapServices] Ignoring invalid bitmap mutation interest provider.');
                        return () => {};
                    }
                    mutationInterestProviders.push(normalized);
                    return () => {
                        const index = mutationInterestProviders.indexOf(normalized);
                        if (index >= 0) mutationInterestProviders.splice(index, 1);
                    };
                }

                function hasMutationInterest(bitmap) {
                    try {
                        const direct = bitmap ? bitmapSubscribers.get(bitmap) : null;
                        if (direct && direct.size) return true;
                    } catch (error) {
                        reportError('hasMutationInterest', error);
                    }
                    for (const provider of mutationInterestProviders.slice()) {
                        try {
                            if (provider && typeof provider.hasMutationInterest === 'function'
                                && provider.hasMutationInterest(bitmap) === true) {
                                return true;
                            }
                        } catch (error) {
                            reportError('mutationInterestProvider', error, {
                                provider: provider && provider.token || '',
                            });
                        }
                    }
                    return false;
                }

                function collectMutationCapabilities(bitmap, input = {}) {
                    const capabilities = [];
                    const source = input && typeof input === 'object' ? input : {};
                    for (const provider of mutationInterestProviders.slice()) {
                        try {
                            if (!provider || typeof provider.getMutationCapabilities !== 'function') continue;
                            appendCapabilityList(capabilities, provider.getMutationCapabilities(bitmap, source));
                        } catch (error) {
                            reportError('mutationCapabilityProvider', error, {
                                provider: provider && provider.token || '',
                            });
                        }
                    }
                    return capabilities;
                }

                function publishMutation(bitmap, methodName, args = []) {
                    if (!hasMutationInterest(bitmap)) return;
                    const argsList = Array.isArray(args) ? args.slice() : [];
                    let direct = null;
                    try {
                        direct = bitmap ? bitmapSubscribers.get(bitmap) : null;
                    } catch (error) {
                        reportError('publishMutation.lookup', error);
                    }
                    Array.from(direct || []).forEach((subscription) => {
                        invokeMutationSubscriber(subscription, bitmap, methodName, argsList);
                    });
                }

                function invokeMutationSubscriber(handler, bitmap, methodName, args) {
                    if (typeof handler !== 'function') return;
                    try {
                        handler(bitmap, methodName, args.slice());
                    } catch (error) {
                        reportError('mutationSubscriber', error);
                    }
                }

                function normalizeMutationInterestProvider(provider) {
                    if (typeof provider === 'function') {
                        return {
                            token: 'mutation-interest',
                            hasMutationInterest: provider,
                            getMutationCapabilities: null,
                        };
                    }
                    if (!provider || typeof provider !== 'object'
                        || (typeof provider.hasMutationInterest !== 'function'
                            && typeof provider.getMutationCapabilities !== 'function')) {
                        return null;
                    }
                    return {
                        token: stringify(provider.token || provider.name || 'mutation-interest'),
                        hasMutationInterest(bitmap) {
                            return typeof provider.hasMutationInterest === 'function'
                                ? provider.hasMutationInterest(bitmap)
                                : false;
                        },
                        getMutationCapabilities(bitmap, input) {
                            return typeof provider.getMutationCapabilities === 'function'
                                ? provider.getMutationCapabilities(bitmap, input)
                                : [];
                        },
                    };
                }

                return freezeApi({
                    registerMutationPublisher,
                    hasMutationPublisher,
                    watchBitmap,
                    registerMutationInterestProvider,
                    hasMutationInterest,
                    collectMutationCapabilities,
                    publishMutation,
                });
            }

            function appendCapabilityList(target, value) {
                if (!Array.isArray(target)) return target;
                const values = Array.isArray(value) ? value : [value];
                values.forEach((candidate) => {
                    const capability = stringify(candidate || '');
                    if (capability && target.indexOf(capability) < 0) target.push(capability);
                });
                return target;
            }

            function canStoreWeakState(value) {
                const type = typeof value;
                return value !== null && (type === 'object' || type === 'function');
            }

            function stringify(value) {
                try { return String(value ?? ''); } catch (_) { return ''; }
            }

            function freezeApi(api) {
                try { return Object.freeze(api); } catch (_) { return api; }
            }

            return freezeApi({
                createMutationInterestRegistry,
            });
        },
    });
})();
