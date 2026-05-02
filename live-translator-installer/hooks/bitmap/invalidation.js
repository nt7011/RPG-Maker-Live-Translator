// Bitmap hook invalidation module.
//
// Bitmap content is mutable. A later clear, fill, resize, or blit can make
// previously detected text unsafe to redraw. This module wraps those mutating
// Bitmap methods, translates their arguments into rectangles, flushes pending
// fragments before content disappears, cancels stale entries, and records paint
// operations that need to be replayed around translated redraws.
//
// The wrappers are observational: they call the original Bitmap method first,
// then update translator bookkeeping. Replay and scratch-small-text paths are
// explicitly bypassed to avoid feedback loops.
(() => {
    'use strict';

    const globalScope = typeof window !== 'undefined'
        ? window
        : (typeof globalThis !== 'undefined' ? globalThis : Function('return this')());

    if (!globalScope.LiveTranslatorModules) {
        globalScope.LiveTranslatorModules = {};
    }
    if (!globalScope.LiveTranslatorModules.hooks) {
        globalScope.LiveTranslatorModules.hooks = {};
    }
    if (!globalScope.LiveTranslatorModules.hooks.bitmap) {
        globalScope.LiveTranslatorModules.hooks.bitmap = {};
    }
    const defineRuntimeModule = globalScope.LiveTranslatorDefine;
    if (typeof defineRuntimeModule !== 'function') {
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/bitmap/invalidation.js.');
    }

    function attachBitmapInvalidation(runtime) {
        const {
            bitmapStates,
            contentsOwners,
            windowRegistry,
            perf,
            telemetry,
            textTracker,
            logger,
            diag,
            diagHot,
            preview,
            shouldCaptureBitmapCallSites,
            captureBitmapCallSite,
            shouldTraceBitmapDiagnostics,
            isSmallTextScratchBitmap,
            isSmallTextDrawActive,
            describeBitmap,
            deriveEntryRect,
            formatRect,
            rectanglesOverlap,
            rectanglesSimilar,
            rectFromDimensions,
            rectHasArea,
            isValidRect,
            fragmentRect,
            discardRenderOpsInRect,
            recordBitmapRenderOp,
            markEntryStale,
            flushAggregatedLines,
        } = runtime;
        const MUTATION_OBSERVER_TOKEN = 'liveTranslator.bitmapMutationObserver';
        const markRecordDisappeared = (recordId, reason, details = null) => {
            if (!textTracker || !recordId) return;
            if (typeof textTracker.disappear === 'function') {
                textTracker.disappear(recordId, reason, details);
            } else if (typeof textTracker.stale === 'function') {
                textTracker.stale(recordId, reason, details);
            }
        };
        const existingObserver = globalScope.LiveTranslatorBitmapMutationObserver;
        const mutationSubscribers = existingObserver
            && existingObserver.__token === MUTATION_OBSERVER_TOKEN
            && existingObserver.subscribers
            && typeof existingObserver.subscribers.add === 'function'
            ? existingObserver.subscribers
            : new Set();

        const subscribeBitmapMutation = (handler) => {
            if (typeof handler !== 'function') return () => {};
            mutationSubscribers.add(handler);
            return () => {
                try { mutationSubscribers.delete(handler); } catch (_) {}
            };
        };

        const notifyBitmapMutation = (bitmap, methodName, args) => {
            if (!mutationSubscribers.size) return;
            const snapshot = Array.from(mutationSubscribers);
            snapshot.forEach((handler) => {
                try {
                    handler(bitmap, methodName, Array.isArray(args) ? args.slice() : []);
                } catch (error) {
                    logger.warn('[bitmap/mutation-observer-error]', error);
                }
            });
        };

        globalScope.LiveTranslatorBitmapMutationObserver = {
            __token: MUTATION_OBSERVER_TOKEN,
            subscribers: mutationSubscribers,
            subscribe: subscribeBitmapMutation,
        };

        // Pending fragments have not become entries yet. If their bitmap area
        // is cleared before the timer flushes, remove or force-flush them so
        // they cannot become stale text entries later.
        const discardFragmentsInRect = (state, rect, reason, skipEntry = null) => {
            if (!state || !Array.isArray(state.fragments) || state.fragments.length === 0) return;
            if (!rect || !isValidRect(rect)) {
                const removed = state.fragments.length;
                state.fragments.length = 0;
                if (removed) {
                    diag(`[bitmap/invalidate] reason=${reason} fragments_cleared=${removed}`);
                }
                return;
            }
            const before = state.fragments.length;
            state.fragments = state.fragments.filter((fragment) => {
                if (!fragment) return false;
                const fragRect = fragmentRect(fragment);
                if (skipEntry && skipEntry.bounds && fragment.ownerType === skipEntry.ownerType) {
                    if (fragRect && rectanglesOverlap(fragRect, skipEntry.bounds)) {
                        return true;
                    }
                }
                return !fragRect || !rectanglesOverlap(rect, fragRect);
            });
            const removed = before - state.fragments.length;
            if (removed > 0) {
                diag(`[bitmap/invalidate] reason=${reason} fragments_removed=${removed}`);
            }
        };

        // Active bitmap entries are canceled when the game paints over their
        // bounds. skipEntry is used during our own translated redraw so the
        // entry being redrawn is not canceled by its clearRect.
        const invalidateEntriesInRect = (bitmap, rect, reason, skipEntry = null) => {
            const state = bitmapStates.get(bitmap);
            if (!state || !state.entries || state.entries.size === 0) return 0;
            let removed = 0;
            const targetRect = rect && isValidRect(rect) ? rect : null;
            const entries = Array.from(state.entries.values());
            for (const entry of entries) {
                if (!entry || entry === skipEntry) continue;
                const entryRect = deriveEntryRect(entry);
                if (!targetRect || !entryRect || rectanglesOverlap(targetRect, entryRect)) {
                    markEntryStale(state, entry, `${reason}-rect`, {
                        rect: targetRect,
                        activeEntry: skipEntry || null,
                    });
                    removed++;
                }
            }
            if (removed) {
                perf.count('bitmap.invalidate.removedEntries', removed);
                discardFragmentsInRect(state, targetRect, reason, skipEntry);
            }
            return removed;
        };

        const deriveWindowEntryRect = (entry) => {
            if (!entry) return null;
            if (entry.bounds && isValidRect(entry.bounds)) return entry.bounds;
            const x = entry.position && Number.isFinite(Number(entry.position.x))
                ? Number(entry.position.x)
                : 0;
            const y = entry.position && Number.isFinite(Number(entry.position.y))
                ? Number(entry.position.y)
                : 0;
            const params = entry.originalParams || {};
            const width = Number.isFinite(Number(params.maxWidth)) && Number(params.maxWidth) > 0
                ? Number(params.maxWidth)
                : Math.max(1, String(entry.visibleText || entry.convertedText || entry.rawText || '').length * 12);
            const height = Number.isFinite(Number(params.lineHeight)) && Number(params.lineHeight) > 0
                ? Number(params.lineHeight)
                : 24;
            return rectFromDimensions(x, y, width, height);
        };

        // Window hooks maintain their own text registry. When a Bitmap belongs
        // to a Window contents object, low-level bitmap invalidation must also
        // stale overlapping window entries.
        const invalidateWindowEntriesInRect = (bitmap, rect, reason, options = {}) => {
            if (!bitmap || !contentsOwners || !windowRegistry) return 0;
            if (bitmap._trWindowRedrawClearDepth && bitmap._trWindowRedrawClearDepth > 0) return 0;
            if (options && options.skipEntryInvalidation) return 0;

            let owner = null;
            try {
                if (contentsOwners && typeof contentsOwners.get === 'function') {
                    owner = contentsOwners.get(bitmap);
                }
            } catch (_) {}
            if (!owner) return 0;

            let data = null;
            try {
                data = windowRegistry && typeof windowRegistry.get === 'function'
                    ? windowRegistry.get(owner)
                    : null;
            } catch (_) {}
            if (!data || !data.texts || typeof data.texts.forEach !== 'function') return 0;

            const targetRect = rect && isValidRect(rect) ? rect : null;
            const removed = [];
            try {
                data.texts.forEach((entry, key) => {
                    if (!entry) return;
                    const entryRect = deriveWindowEntryRect(entry);
                    if (!targetRect || !entryRect || rectanglesOverlap(targetRect, entryRect)) {
                        removed.push({ key, entry });
                    }
                });
            } catch (_) {}

            if (!removed.length) return 0;

            const ownerType = owner && owner.constructor && owner.constructor.name
                ? owner.constructor.name
                : 'Window';

            removed.forEach(({ key, entry }) => {
                try {
                    if (entry) {
                        entry._trStale = true;
                        if (entry.translationStatus === 'completed') {
                            entry.translationStatus = 'stale';
                        }
                        entry.canceledReason = `${reason}-contents`;
                        entry.canceledAt = Date.now();
                        if (entry.recordId && entry._trTrackerVisible !== false) {
                            markRecordDisappeared(entry.recordId, `${reason}-contents`, {
                                windowType: ownerType,
                            });
                        }
                    }
                } catch (_) {}
                try { data.texts.delete(key); } catch (_) {}
                try {
                    if (data.pendingRedraws && typeof data.pendingRedraws.delete === 'function') {
                        data.pendingRedraws.delete(key);
                    }
                } catch (_) {}
            });

            try {
                data.contentsRevision = (data.contentsRevision || 0) + 1;
                if (!targetRect && data.pendingRedraws && typeof data.pendingRedraws.clear === 'function') {
                    data.pendingRedraws.clear();
                }
                if (!targetRect && data.recentlyRedrawn && typeof data.recentlyRedrawn.clear === 'function') {
                    data.recentlyRedrawn.clear();
                }
            } catch (_) {}

            const rectLabel = targetRect ? formatRect(targetRect) : 'FULL';
            diagHot(
                `window/invalidate|${ownerType}|${reason}|${rectLabel}|${removed.length}`,
                () => `[window/invalidate] owner=${ownerType} reason=${reason} rect=${rectLabel} removed=${removed.length}`
            );
            return removed.length;
        };

        // Main invalidation coordinator. It handles pending bitmap fragments,
        // active bitmap entries, and telemetry.
        const handleBitmapInvalidation = (bitmap, rect, reason, options = {}) => {
            if (!bitmap) return;
            perf.count('bitmap.invalidate.calls');
            perf.top('bitmap.invalidate.reason', reason || 'unknown');
            const skipEntry = bitmap._trActiveRedrawEntry || null;
            const state = bitmapStates.get(bitmap);

            try {
                if (state && Array.isArray(state.fragments) && state.fragments.length > 0) {
                    if (rect && isValidRect(rect)) {
                        flushAggregatedLines(bitmap, `pre-${reason}`, rect);
                    } else {
                        flushAggregatedLines(bitmap, `pre-${reason}`);
                    }
                }
            } catch (_) {}

            if (skipEntry && rect && skipEntry.bounds && rectanglesOverlap(rect, skipEntry.bounds)) {
                const similar = rectanglesSimilar(rect, skipEntry.bounds, 12);
                if (similar) {
                    if (state) {
                        discardFragmentsInRect(state, rect, `${reason}-self`, skipEntry);
                    }
                    diag(`[bitmap/invalidate-skip] ${describeBitmap(bitmap)} reason=${reason} rect=${formatRect(rect)} uuid=${skipEntry.instanceId || 'unknown'} treated_as_self_clear`);
                    return;
                }
            }

            let removed = 0;
            if (!options.skipEntryInvalidation) {
                removed = invalidateEntriesInRect(bitmap, rect, reason, skipEntry);
            } else if (state && Array.isArray(state.fragments)) {
                discardFragmentsInRect(state, rect, `${reason}-skip`, skipEntry);
            }
            if (removed) {
                let ownerType = 'Bitmap';
                try {
                    if (skipEntry && skipEntry.ownerType) {
                        ownerType = skipEntry.ownerType;
                    } else if (contentsOwners && typeof contentsOwners.get === 'function') {
                        const owner = contentsOwners.get(bitmap);
                        if (owner && owner.constructor && owner.constructor.name) {
                            ownerType = owner.constructor.name;
                        }
                    }
                } catch (_) {}
                telemetry.logDraw('bitmap_invalidate', reason, (rect && rect.x1) || 0, (rect && rect.y1) || 0, {
                    ownerType,
                    removed,
                });
            } else if (state) {
                discardFragmentsInRect(state, rect, reason, skipEntry);
            }
        };

        // Wrap one Bitmap mutator. rectResolver returns either false to ignore
        // the call, "FULL" for whole-bitmap invalidation, or a rectangle plus
        // options such as replay recording.
        const installInvalidationHook = (methodName, rectResolver) => {
            const original = Bitmap.prototype[methodName];
            if (typeof original !== 'function') return;
            if (original.__trInvalidationWrapped) return;
            const wrapped = function(...args) {
                let rect = null;
                let extraOptions = {};
                const callSite = shouldCaptureBitmapCallSites() && (methodName === 'clearRect' || methodName === 'clear' || methodName === 'resize')
                    ? captureBitmapCallSite()
                    : '';
                try {
                    const resolved = rectResolver.call(this, args);
                    if (resolved && typeof resolved === 'object' && ('rect' in resolved || 'options' in resolved)) {
                        rect = resolved.rect !== undefined ? resolved.rect : null;
                        extraOptions = resolved.options || {};
                    } else {
                        rect = resolved;
                    }
                } catch (_) {}
                const result = original.apply(this, args);
                notifyBitmapMutation(this, methodName, args);
                if (isSmallTextScratchBitmap(this)) {
                    return result;
                }
                if (isSmallTextDrawActive(this)) {
                    perf.count('bitmap.invalidate.bypass.smallText');
                    perf.top('bitmap.invalidate.method', methodName);
                    return result;
                }
                if (this && this._trBitmapReplayDepth && this._trBitmapReplayDepth > 0) {
                    if (shouldTraceBitmapDiagnostics() && rect !== false) {
                        const replayRect = rect && rect !== 'FULL' && isValidRect(rect) ? rect : null;
                        diag(`[bitmap/invalidate-bypass] ${describeBitmap(this)} reason=${methodName} rect=${replayRect ? formatRect(replayRect) : (rect === 'FULL' ? 'FULL' : 'n/a')} replayDepth=${this._trBitmapReplayDepth}${callSite ? ` site=${callSite}` : ''}`);
                    }
                    return result;
                }
                if (rect !== false) {
                    perf.count('bitmap.invalidate.observed');
                    perf.top('bitmap.invalidate.method', methodName);
                    const perfInvalidateStart = perf.isEnabled() ? perf.now() : 0;
                    try {
                        // FULL invalidation is represented as null after this
                        // point so callers can treat it as "all entries".
                        let resolvedRect = null;
                        if (rect === 'FULL') {
                            resolvedRect = null;
                        } else {
                            resolvedRect = rect;
                        }
                        if (shouldTraceBitmapDiagnostics()) {
                            const state = bitmapStates.get(this);
                            const skipEntry = this && this._trActiveRedrawEntry ? this._trActiveRedrawEntry : null;
                            diag(`[bitmap/invalidate-start] ${describeBitmap(this)} reason=${methodName} rect=${resolvedRect && isValidRect(resolvedRect) ? formatRect(resolvedRect) : (rect === 'FULL' ? 'FULL' : 'n/a')} entries=${state && state.entries ? state.entries.size : 0} fragments=${state && Array.isArray(state.fragments) ? state.fragments.length : 0} renderOps=${state && Array.isArray(state.renderOps) ? state.renderOps.length : 0}${skipEntry ? ` active=${skipEntry.instanceId || 'unknown'}` : ''}${callSite ? ` site=${callSite}` : ''}`);
                        }
                        if (extraOptions && extraOptions.clearRenderOps) {
                            const state = bitmapStates.get(this);
                            if (state) {
                                discardRenderOpsInRect(
                                    state,
                                    extraOptions.clearRenderOps === 'all'
                                        ? null
                                        : (resolvedRect && isValidRect(resolvedRect) ? resolvedRect : null)
                                );
                            }
                        }
                        invalidateWindowEntriesInRect(
                            this,
                            resolvedRect && isValidRect(resolvedRect) ? resolvedRect : null,
                            methodName,
                            extraOptions
                        );
                        handleBitmapInvalidation(this, resolvedRect && isValidRect(resolvedRect) ? resolvedRect : null, methodName, extraOptions);
                        if (extraOptions && extraOptions.recordOp) {
                            const op = Object.assign({}, extraOptions.recordOp);
                            if (!op.rect && resolvedRect) {
                                op.rect = resolvedRect;
                            }
                            recordBitmapRenderOp(this, op);
                        }
                    } finally {
                        if (perfInvalidateStart) {
                            perf.time('bitmap.invalidate.ms', perf.now() - perfInvalidateStart);
                        }
                    }
                }
                return result;
            };
            wrapped.__trInvalidationWrapped = true;
            Bitmap.prototype[methodName] = wrapped;
            perf.count('bitmap.invalidate.wrapperInstalled');
            perf.top('bitmap.invalidate.wrapperMethod', methodName);
            diag(`[bitmap/invalidate-hook] Installed for ${methodName}`);
        };

        // Method-specific rectangle resolvers. fill/blit operations may be
        // replayed; clear/resize operations remove previous replay history.
        const rectOrFalse = (rect) => (rectHasArea(rect) ? rect : false);

        installInvalidationHook('clearRect', function(args) {
            const [x, y, w, h] = args;
            return {
                rect: rectOrFalse(rectFromDimensions(x, y, w, h)),
                options: { clearRenderOps: 'rect' },
            };
        });

        installInvalidationHook('clear', function() {
            return {
                rect: 'FULL',
                options: { clearRenderOps: 'all' },
            };
        });

        installInvalidationHook('fillRect', function(args) {
            const [x, y, w, h, color] = args;
            return {
                rect: rectOrFalse(rectFromDimensions(x, y, w, h)),
                options: {
                    recordOp: {
                        methodName: 'fillRect',
                        args: [x, y, w, h, color],
                    },
                },
            };
        });

        installInvalidationHook('gradientFillRect', function(args) {
            const [x, y, w, h, color1, color2, vertical] = args;
            return {
                rect: rectOrFalse(rectFromDimensions(x, y, w, h)),
                options: {
                    recordOp: {
                        methodName: 'gradientFillRect',
                        args: [x, y, w, h, color1, color2, vertical],
                    },
                },
            };
        });

        installInvalidationHook('fillAll', function(args) {
            return {
                rect: 'FULL',
                options: {
                    clearRenderOps: 'all',
                },
            };
        });

        installInvalidationHook('resize', function() {
            return {
                rect: 'FULL',
                options: { clearRenderOps: 'all' },
            };
        });

        installInvalidationHook('blt', function(args) {
            const [source, , , sw, sh, dx, dy, dw, dh] = args;
            const width = Number.isFinite(Number(dw)) ? dw : sw;
            const height = Number.isFinite(Number(dh)) ? dh : sh;
            const recordOp = isSmallTextScratchBitmap(source)
                ? null
                : {
                    methodName: 'blt',
                    args: Array.isArray(args) ? args.slice() : [],
                };
            return {
                rect: rectOrFalse(rectFromDimensions(dx, dy, width, height)),
                options: {
                    skipEntryInvalidation: true,
                    recordOp,
                },
            };
        });

        installInvalidationHook('bltImage', function(args) {
            const [, , , sw, sh, dx, dy, dw, dh] = args;
            const width = Number.isFinite(Number(dw)) ? dw : sw;
            const height = Number.isFinite(Number(dh)) ? dh : sh;
            return {
                rect: rectOrFalse(rectFromDimensions(dx, dy, width, height)),
                options: { skipEntryInvalidation: true },
            };
        });

        installInvalidationHook('strokeRect', function(args) {
            const [x, y, w, h] = args;
            return {
                rect: rectOrFalse(rectFromDimensions(x, y, w, h)),
                options: { skipEntryInvalidation: true },
            };
        });

        installInvalidationHook('drawCircle', function(args) {
            const [x, y, radius] = args;
            const r = Number.isFinite(Number(radius)) ? Number(radius) : 0;
            return {
                rect: rectOrFalse(rectFromDimensions(Number(x) - r, Number(y) - r, r * 2, r * 2)),
                options: { skipEntryInvalidation: true },
            };
        });

        installInvalidationHook('adjustTone', function() {
            return 'FULL';
        });

        installInvalidationHook('rotateHue', function() {
            return 'FULL';
        });

        installInvalidationHook('blur', function() {
            return 'FULL';
        });

        installInvalidationHook('destroy', function() {
            return {
                rect: 'FULL',
                options: { clearRenderOps: 'all' },
            };
        });

        return runtime;
    }

    defineRuntimeModule('hooks.bitmap.invalidation', {
        attach: attachBitmapInvalidation,
    });
})();
