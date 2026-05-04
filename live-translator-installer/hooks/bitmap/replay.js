// Bitmap hook replay module.
//
// Bitmap translation redraw is destructive: the hook clears the original text
// area, draws translated text, and must preserve anything else that overlapped
// the cleared rectangle. This module records enough drawing history to replay
// affected non-text operations and skipped native text around a translated
// redraw.
//
// The replay model is intentionally bounded and best-effort. It stores recent
// operations, prunes old records, and uses rectangle overlap plus draw order to
// decide what needs to be replayed before or after the translated entry.
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
        throw new Error('[LiveTranslator] runtime module registry is unavailable before hooks/bitmap/replay.js.');
    }

    function attachBitmapReplay(runtime) {
        const {
            perf,
            preview,
            logger,
            diag,
            stripRpgmEscapes,
            applyBitmapDrawState,
            ensureBitmapState,
            getBitmapState,
            nextDrawOrder,
            deriveEntryRect,
            isValidRect,
            rectFromDimensions,
            rectanglesOverlap,
            describeBitmap,
            describeEntry,
            formatRect,
            textTracker,
        } = runtime;

        // Drop replay records when a clear/resize/fill makes them invalid.
        // Keeping nativeTextOps synchronized prevents stale skipped text from
        // being replayed after the underlying render operation was pruned.
        const discardRenderOpsInRect = (state, rect) => {
            if (!state || !Array.isArray(state.renderOps) || state.renderOps.length === 0) return;
            if (!rect || !isValidRect(rect)) {
                if (state.nativeTextOps && typeof state.nativeTextOps.clear === 'function') {
                    state.nativeTextOps.clear();
                }
                state.renderOps.length = 0;
                return;
            }
            state.renderOps = state.renderOps.filter((op) => {
                const keep = !op || !op.rect || !rectanglesOverlap(rect, op.rect);
                if (!keep && op && op.nativeTextKey && state.nativeTextOps && state.nativeTextOps.get(op.nativeTextKey) === op) {
                    state.nativeTextOps.delete(op.nativeTextKey);
                }
                return keep;
            });
        };

        // A text entry can move from "skipped native replay" to "translatable".
        // Remove the native replay record before registering the translatable
        // entry, or the same text can be drawn twice during future replays.
        const removeNativeTextOpByKey = (state, key) => {
            if (!state || !state.nativeTextOps || !key) return null;
            const existing = state.nativeTextOps.get(key);
            if (!existing) return null;
            state.nativeTextOps.delete(key);
            if (Array.isArray(state.renderOps) && state.renderOps.length) {
                state.renderOps = state.renderOps.filter((op) => op !== existing);
            }
            return existing;
        };

        // Record fills, blits, and other non-text bitmap operations that may
        // visually overlap text. Only bounded rectangle operations are useful
        // for selective replay.
        const recordBitmapRenderOp = (bitmap, op) => {
            if (!bitmap || !op || !op.methodName) return null;
            const state = getBitmapState ? getBitmapState(bitmap) : null;
            if (!state) return null;
            const rect = op.fullBitmap
                ? rectFromDimensions(0, 0, bitmap.width, bitmap.height)
                : op.rect;
            if (!rect || !isValidRect(rect)) return null;
            const record = {
                methodName: op.methodName,
                args: Array.isArray(op.args) ? op.args.slice() : [],
                rect,
                drawOrder: nextDrawOrder(state),
                recordedAt: Date.now(),
                windowDrawTextExReplay: !!(op.windowDrawTextExReplay
                    || (bitmap && bitmap._trWindowDrawTextExReplayDepth > 0)),
            };
            state.renderOps.push(record);
            perf.count('bitmap.renderOp.recorded');
            perf.top('bitmap.renderOp.method', op.methodName);
            if (state.renderOps.length > 256) {
                const removed = state.renderOps.splice(0, state.renderOps.length - 256);
                perf.count('bitmap.renderOp.pruned', removed.length);
                if (removed.length && state.nativeTextOps) {
                    removed.forEach((item) => {
                        if (item && item.nativeTextKey && state.nativeTextOps.get(item.nativeTextKey) === item) {
                            state.nativeTextOps.delete(item.nativeTextKey);
                        }
                    });
                }
            }
            return record;
        };

        // Redraw uses normal Bitmap methods. This depth flag tells wrappers not
        // to capture replayed text and render operations as new user-facing
        // source text.
        const withBitmapReplay = (bitmap, fn) => {
            if (!bitmap || typeof fn !== 'function') return undefined;
            bitmap._trBitmapReplayDepth = (bitmap._trBitmapReplayDepth || 0) + 1;
            try {
                return fn();
            } finally {
                bitmap._trBitmapReplayDepth = Math.max(0, (bitmap._trBitmapReplayDepth || 1) - 1);
            }
        };

        // Bitmap.drawText variants cannot safely receive RPG Maker escape codes
        // during low-level redraw. drawTextEx handling belongs to window hooks.
        const sanitizeBitmapDrawText = (text, methodName) => {
            if (typeof text !== 'string') return text;
            if (methodName === 'drawText' || methodName === 'drawTextS' || methodName === 'drawTextM') {
                return stripRpgmEscapes(text);
            }
            return text;
        };

        // Skipped bitmap text still affects visual layering. Recording it as a
        // native op lets translated entries clear and replay around it later.
        const recordNativeBitmapTextOp = (entry) => {
            if (!entry || !entry.bitmap || !entry.key) return null;
            const state = ensureBitmapState(entry.bitmap);
            if (!state) return null;
            const rect = deriveEntryRect(entry);
            if (!rect || !isValidRect(rect)) return null;
            const drawOrder = nextDrawOrder(state);
            const args = [
                entry.rawText,
                entry.drawParams.x,
                entry.drawParams.y,
                entry.drawParams.maxWidth,
                entry.drawParams.lineHeight,
                entry.drawParams.align,
            ];
            const existing = state.nativeTextOps && state.nativeTextOps.get(entry.key);
            if (existing) {
                existing.methodName = entry.methodName || 'drawText';
                existing.args = args;
                existing.rect = rect;
                existing.drawState = entry.drawState;
                existing.drawOrder = drawOrder;
                existing.recordedAt = Date.now();
                existing.nativeTextKey = entry.key;
                existing.textPreview = entry.trimmedText || entry.rawText || '';
                existing.ownerType = entry.ownerType || existing.ownerType;
                existing.debugCallSite = entry.debugCallSite || existing.debugCallSite || '';
                perf.count('bitmap.nativeTextOp.updated');
                perf.top('bitmap.owner', existing.ownerType || 'Bitmap');
                return existing;
            }
            const record = {
                methodName: entry.methodName || 'drawText',
                args,
                rect,
                drawState: entry.drawState,
                drawOrder,
                recordedAt: Date.now(),
                nativeTextKey: entry.key,
                textPreview: entry.trimmedText || entry.rawText || '',
                ownerType: entry.ownerType || 'Bitmap',
                debugCallSite: entry.debugCallSite || '',
            };
            state.renderOps.push(record);
            if (state.nativeTextOps) {
                state.nativeTextOps.set(entry.key, record);
            }
            perf.count('bitmap.nativeTextOp.recorded');
            perf.top('bitmap.owner', record.ownerType || 'Bitmap');
            if (state.renderOps.length > 256) {
                const removed = state.renderOps.splice(0, state.renderOps.length - 256);
                perf.count('bitmap.renderOp.pruned', removed.length);
                if (removed.length && state.nativeTextOps) {
                    removed.forEach((item) => {
                        if (item && item.nativeTextKey && state.nativeTextOps.get(item.nativeTextKey) === item) {
                            state.nativeTextOps.delete(item.nativeTextKey);
                        }
                    });
                }
            }
            return record;
        };

        // Replay text through the same draw variant that originally produced
        // the entry, after restoring captured font and outline state.
        const drawBitmapTextValue = (bitmap, entry, text) => {
            if (!bitmap || !entry || typeof text !== 'string' || !text) return;
            try { applyBitmapDrawState(bitmap, entry.drawState); } catch (_) {}
            const drawMethodName = entry.methodName && typeof bitmap[entry.methodName] === 'function'
                ? entry.methodName
                : 'drawText';
            const drawFn = bitmap[drawMethodName] || bitmap.drawText;
            if (typeof drawFn !== 'function') return;
            const safeText = sanitizeBitmapDrawText(text, drawMethodName);
            perf.count('bitmap.drawTextValue.calls');
            perf.top('bitmap.drawTextValue.method', drawMethodName);
            const perfDrawStart = perf.isEnabled() ? perf.now() : 0;
            try {
                drawFn.call(
                    bitmap,
                    safeText,
                    entry.drawParams.x,
                    entry.drawParams.y,
                    entry.drawParams.maxWidth,
                    entry.drawParams.lineHeight,
                    entry.drawParams.align
                );
            } finally {
                if (perfDrawStart) {
                    perf.time('bitmap.drawTextValue.ms', perf.now() - perfDrawStart);
                }
            }
        };

        const replayBitmapEntry = (bitmap, entry) => {
            if (!bitmap || !entry || entry._trStale) return;
            const text = entry.translationStatus === 'completed' && entry.translatedText
                ? entry.translatedText
                : entry.rawText;
            drawBitmapTextValue(bitmap, entry, text);
        };

        // Turn recorded history into concrete draw calls. Render operations and
        // text entries share the same drawOrder timeline.
        const replayBitmapRenderOp = (bitmap, op) => {
            if (!bitmap || !op || !op.methodName) return;
            perf.count('bitmap.replay.renderOp');
            perf.top('bitmap.replay.method', op.methodName);
            const perfReplayStart = perf.isEnabled() ? perf.now() : 0;
            try {
                switch (op.methodName) {
                case 'drawText':
                case 'drawTextS':
                case 'drawTextM': {
                    const drawMethodName = typeof bitmap[op.methodName] === 'function' ? op.methodName : 'drawText';
                    const drawFn = bitmap[drawMethodName] || bitmap.drawText;
                    if (typeof drawFn !== 'function') break;
                    try { applyBitmapDrawState(bitmap, op.drawState); } catch (_) {}
                    const drawArgs = Array.isArray(op.args) ? op.args.slice() : [];
                    if (drawArgs.length > 0) {
                        drawArgs[0] = sanitizeBitmapDrawText(drawArgs[0], drawMethodName);
                    }
                    drawFn.call(bitmap, ...drawArgs);
                    break;
                }
                case 'fillRect':
                    if (typeof bitmap.fillRect === 'function') bitmap.fillRect(...op.args);
                    break;
                case 'gradientFillRect':
                    if (typeof bitmap.gradientFillRect === 'function') bitmap.gradientFillRect(...op.args);
                    break;
                case 'fillAll':
                    if (typeof bitmap.fillAll === 'function') bitmap.fillAll(...op.args);
                    break;
                case 'blt':
                    if (typeof bitmap.blt === 'function') bitmap.blt(...op.args);
                    break;
                case 'bltImage':
                    if (typeof bitmap.bltImage === 'function') bitmap.bltImage(...op.args);
                    break;
                case 'strokeRect':
                    if (typeof bitmap.strokeRect === 'function') bitmap.strokeRect(...op.args);
                    break;
                case 'drawCircle':
                    if (typeof bitmap.drawCircle === 'function') bitmap.drawCircle(...op.args);
                    break;
                default:
                    break;
                }
            } finally {
                if (perfReplayStart) {
                    perf.time('bitmap.replay.renderOp.ms', perf.now() - perfReplayStart);
                }
            }
        };

        // Build the ordered replay list for one clear rectangle. The caller
        // supplies relation(order) to collect either operations before or after
        // the active translated entry.
        const collectReplayItems = (state, rect, currentEntry, relation) => {
            if (!state || !rect || !isValidRect(rect) || typeof relation !== 'function') return [];
            const perfCollectStart = perf.isEnabled() ? perf.now() : 0;
            const items = [];
            if (Array.isArray(state.renderOps)) {
                state.renderOps.forEach((op) => {
                    if (!op || !op.rect || !rectanglesOverlap(rect, op.rect)) return;
                    if (!relation(op.drawOrder || 0)) return;
                    items.push({ type: 'renderOp', drawOrder: op.drawOrder || 0, op });
                });
            }
            if (state.entries && typeof state.entries.forEach === 'function') {
                state.entries.forEach((entry) => {
                    if (!entry || entry === currentEntry || entry._trStale) return;
                    const entryRect = deriveEntryRect(entry);
                    if (!entryRect || !rectanglesOverlap(rect, entryRect)) return;
                    if (!relation(entry.drawOrder || 0)) return;
                    items.push({ type: 'text', drawOrder: entry.drawOrder || 0, entry });
                });
            }
            items.sort((a, b) => (a.drawOrder || 0) - (b.drawOrder || 0));
            perf.count('bitmap.collectReplay.calls');
            perf.count('bitmap.collectReplay.items', items.length);
            if (perfCollectStart) {
                perf.time('bitmap.collectReplay.ms', perf.now() - perfCollectStart);
            }
            return items;
        };

        const summarizeReplayItems = (items, limit = 6) => {
            if (!Array.isArray(items) || items.length === 0) return 'none';
            const rendered = items.slice(0, limit).map((item) => {
                if (!item) return 'null';
                if (item.type === 'renderOp') {
                    const previewText = item.op && item.op.textPreview ? `:"${preview(item.op.textPreview, 20)}"` : '';
                    return `op:${item.op && item.op.methodName ? item.op.methodName : 'unknown'}#${item.drawOrder || 0}@${formatRect(item.op && item.op.rect)}${previewText}`;
                }
                const entry = item.entry;
                const text = entry && (entry.trimmedText || entry.rawText) ? preview(entry.trimmedText || entry.rawText, 20) : '';
                const status = entry && entry.translationStatus ? entry.translationStatus : 'unknown';
                return `text:${item.drawOrder || 0}:${status}:"${text}"`;
            });
            if (items.length > limit) {
                rendered.push(`+${items.length - limit} more`);
            }
            return rendered.join(' | ');
        };

        const replayBitmapItems = (bitmap, items) => {
            if (!bitmap || !Array.isArray(items) || items.length === 0) return;
            perf.count('bitmap.replay.items', items.length);
            const perfReplayStart = perf.isEnabled() ? perf.now() : 0;
            try {
                items.forEach((item) => {
                    if (!item) return;
                    if (item.type === 'renderOp') {
                        replayBitmapRenderOp(bitmap, item.op);
                    } else if (item.type === 'text') {
                        replayBitmapEntry(bitmap, item.entry);
                    }
                });
            } finally {
                if (perfReplayStart) {
                    perf.time('bitmap.replay.items.ms', perf.now() - perfReplayStart);
                }
            }
        };

        try {
            globalScope.LiveTranslatorBitmapReplay = {
                __token: 'liveTranslator.bitmapReplay',
                getBitmapState,
                ensureBitmapState,
                nextDrawOrder,
                collectReplayItems,
                replayBitmapItems,
                withBitmapReplay,
                rectFromDimensions,
                isValidRect,
            };
        } catch (_) {}

        // The clear rectangle needs enough vertical padding for outlines and
        // descenders but should stay clipped to bitmap bounds.
        const calculateClearRect = (bitmap, entry, outlinePadding) => {
            const bounds = entry && entry.bounds;
            if (!bitmap || !bounds) return null;
            const fontSize = entry.drawState && Number.isFinite(entry.drawState.fontSize)
                ? entry.drawState.fontSize
                : (entry.drawParams && Number.isFinite(entry.drawParams.lineHeight)
                    ? entry.drawParams.lineHeight
                    : 24);
            const topPad = Math.min(Math.max(0, Math.ceil(fontSize * 0.08)), outlinePadding);
            const bottomPad = Math.max(outlinePadding, Math.ceil(fontSize * 0.25));
            const width = Math.max(0, Math.ceil((bounds.x2 - bounds.x1) + outlinePadding * 2));
            const height = Math.max(0, Math.ceil((bounds.y2 - bounds.y1) + topPad + bottomPad));
            const clearX = Math.max(0, Math.floor(bounds.x1 - outlinePadding));
            const clearY = Math.max(0, Math.floor(bounds.y1 - topPad));
            return {
                x: clearX,
                y: clearY,
                width: Math.min(Math.max(0, bitmap.width - clearX), width),
                height: Math.min(Math.max(0, bitmap.height - clearY), height),
                topPad,
                bottomPad,
            };
        };

        // Marking stale is the central cancellation path for bitmap entries.
        // Async translation callbacks check this flag before applying results.
        const markEntryStale = (state, entry, reason, details = null) => {
            if (!state || !entry || entry._trStale) return;
            perf.count('bitmap.entry.canceled');
            perf.top('bitmap.cancel.reason', reason || 'unknown');
            perf.top('bitmap.owner', entry.ownerType || 'Bitmap');
            entry._trStale = true;
            entry.canceledReason = reason;
            entry.canceledAt = Date.now();
            if (textTracker && entry.recordId) {
                const markGone = typeof textTracker.disappear === 'function'
                    ? textTracker.disappear.bind(textTracker)
                    : (typeof textTracker.stale === 'function' ? textTracker.stale.bind(textTracker) : null);
                if (markGone) markGone(entry.recordId, reason || 'stale', {
                    ownerType: entry.ownerType || 'Bitmap',
                    instanceId: entry.instanceId || '',
                });
            }
            if (entry.key && state.entries && state.entries.get(entry.key) === entry) {
                state.entries.delete(entry.key);
            } else if (state.entries) {
                try {
                    state.entries.forEach((value, key) => {
                        if (value === entry) state.entries.delete(key);
                    });
                } catch (_) {}
            }
            const detailParts = [
                describeBitmap(entry.bitmap),
                `reason=${reason}`,
                describeEntry(entry),
                `text="${preview(entry.trimmedText || entry.rawText || '')}"`,
            ];
            if (details && details.rect) {
                detailParts.push(`target=${formatRect(details.rect)}`);
            }
            if (details && details.activeEntry) {
                detailParts.push(`active=${details.activeEntry.instanceId || 'unknown'}`);
            }
            if (entry.debugCallSite) {
                detailParts.push(`site=${entry.debugCallSite}`);
            }
            diag(`[bitmap/cancel] ${detailParts.join(' ')}`);
        };

        Object.assign(runtime, {
            discardRenderOpsInRect,
            removeNativeTextOpByKey,
            recordBitmapRenderOp,
            withBitmapReplay,
            sanitizeBitmapDrawText,
            recordNativeBitmapTextOp,
            drawBitmapTextValue,
            replayBitmapEntry,
            replayBitmapRenderOp,
            collectReplayItems,
            summarizeReplayItems,
            replayBitmapItems,
            calculateClearRect,
            markEntryStale,
        });

        return runtime;
    }

    defineRuntimeModule('hooks.bitmap.replay', {
        attach: attachBitmapReplay,
    });
})();
